/* ══════════════════════════════════════════════════════
   criarCheckoutSession — cria a Checkout Session do Stripe
   ------------------------------------------------------
   Bem mais simples que a versão do control-plane/ antigo: como tudo
   é o mesmo projeto agora, o tenantId vem direto do custom claim do
   token (verificado automaticamente pelo framework onCall) — não
   existe mais "verificar idToken contra o projeto de outro broker".
   Isso também fecha sozinho o risco de alguém pagar um checkout
   carimbando o slug de outra pessoa: o slug nem é um parâmetro,
   é sempre o tenant do usuário autenticado.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Stripe = require('stripe');
const { db } = require('./admin');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

// lookup_key → coupon aplicado automaticamente na sessão. Só a Página
// de Emprendimento, enquanto dura o preço de lançamento (ver
// docs/REGRAS-DE-NEGOCIO.md, seção 5) — nunca nos planos recorrentes.
const COUPON_LANCAMENTO = {
  inmobly_emprendimento_page: 'LANCAMENTO50',
};

// Promoções que o CLIENT pode pedir, mas só por um nome fixo — nunca
// manda o coupon direto (isso deixaria qualquer um aplicar qualquer
// cupom em qualquer compra). Cada promo já vem com a lista de planos
// em que faz sentido; se o priceLookupKey pedido não estiver na
// lista, a promo é ignorada.
//   primeiroImovel / limiteImoveis — admin-imoveis.js oferece isso nos
//   popups de cupom (parabéns ao cadastrar o primeiro imóvel, e ao
//   bater no limite de 6 grátis do trial): 50% off vitalício, cupom
//   "50OFF" já existe no Stripe Dashboard (duration: forever,
//   max_redemptions controlado manualmente por lá — combinado com o
//   cliente que essa promo fica aberta pros primeiros assinantes e
//   depois é substituída por versões mais curtas, 6 e depois 3 meses,
//   ajustando o coupon aqui quando chegar a hora). O código também é
//   mostrado pro corretor copiar e guardar — pra isso funcionar
//   digitado manualmente depois (não só clicando "Assinar agora" na
//   hora), precisa existir também um Promotion Code no Stripe com o
//   mesmo texto "50OFF" apontando pra esse coupon (Coupon e Promotion
//   Code são objetos diferentes no Stripe — o Coupon sozinho não é
//   digitável no Checkout).
//   trialExpirado — paywall que tranca o painel quando os 14 dias
//   acabam (shell.js#montarPaywall). Mesmo cupom das outras duas: quem
//   deixou o trial vencer é exatamente o público que a promo existe pra
//   converter, e cobrar mais caro de quem hesitou seria o incentivo ao
//   contrário.
const PROMOS = {
  primeiroImovel: { coupon: '50OFF', planos: ['inmobly_starter_monthly', 'inmobly_pro_monthly'] },
  limiteImoveis:  { coupon: '50OFF', planos: ['inmobly_starter_monthly', 'inmobly_pro_monthly'] },
  trialExpirado:  { coupon: '50OFF', planos: ['inmobly_starter_monthly', 'inmobly_pro_monthly'] },
};

const BASE_URL = 'https://painel.sitemob.app';

// Depois de pagar, manda pra onde faz sentido usar a compra — não
// sempre pro painel genérico. Só afeta o "Ir pra..." de obrigado.html.
const PROXIMA_PAGINA = {
  inmobly_emprendimento_page: 'paginas.html',
};

exports.criarCheckoutSession = onCall(
  { region: 'southamerica-east1', secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
    const tenantId = request.auth.token.tenantId;
    if (!tenantId) throw new HttpsError('failed-precondition', 'Conta ainda não tem um tenant associado.');

    const priceLookupKey = String(request.data?.priceLookupKey || '');
    if (!priceLookupKey) throw new HttpsError('invalid-argument', 'priceLookupKey é obrigatório.');

    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    if (!brokerSnap.exists) throw new HttpsError('not-found', 'Broker não encontrado.');
    const broker = brokerSnap.data();

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const precos = await stripe.prices.list({ lookup_keys: [priceLookupKey], limit: 1 });
    const price = precos.data[0];
    if (!price) throw new HttpsError('invalid-argument', 'priceLookupKey desconhecido: ' + priceLookupKey);

    // mode vem do tipo real do Price, não do que o cliente manda
    const mode = price.type === 'recurring' ? 'subscription' : 'payment';
    const produto = priceLookupKey.replace(/^inmobly_/, '').replace(/_monthly$/, '');

    // Produto avulso (Página de Emprendimento, Domínio próprio) exige
    // assinatura ativa — não dá pra comprar avulso estando só no trial
    // ou com pagamento em atraso/cancelado (ver docs/REGRAS-DE-NEGOCIO.md,
    // seção 5). Checado aqui, não só escondendo o botão no frontend,
    // porque essa function é a única barreira real — o botão escondido
    // não impede uma chamada direta.
    if (mode === 'payment' && broker.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Esse produto é exclusivo para assinantes ativos — assine um plano antes de comprar.');
    }

    // Upgrade/downgrade de quem já tem assinatura ativa: uma Checkout
    // Session NOVA em mode:subscription criaria uma SEGUNDA assinatura
    // paralela no Stripe (cobrando os dois planos ao mesmo tempo), em
    // vez de trocar a existente. Troca o item da assinatura atual
    // direto pela API, com proration — sem passar pelo Checkout.
    if (mode === 'subscription' && broker.stripeSubscriptionId) {
      try {
        const subAtual = await stripe.subscriptions.retrieve(broker.stripeSubscriptionId);
        const itemAtual = subAtual.items.data[0];
        if (
          (subAtual.status === 'active' || subAtual.status === 'past_due') &&
          itemAtual && itemAtual.price.id !== price.id
        ) {
          await stripe.subscriptions.update(broker.stripeSubscriptionId, {
            items: [{ id: itemAtual.id, price: price.id }],
            proration_behavior: 'create_prorations',
          });
          return { updated: true, plan: produto };
        }
      } catch (err) {
        console.warn('[criarCheckoutSession] falha ao trocar assinatura existente, seguindo pra checkout novo:', err.message);
        // cai pro fluxo normal abaixo — melhor abrir um checkout novo do que travar o usuário
      }
    }

    const proxima = PROXIMA_PAGINA[priceLookupKey];
    const params = {
      mode,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: tenantId,
      success_url: `${BASE_URL}/obrigado.html${proxima ? '?next=' + encodeURIComponent(proxima) : ''}`,
      cancel_url:  `${BASE_URL}/planos.html`,
    };

    if (broker.stripeCustomerId) params.customer = broker.stripeCustomerId;
    else params.customer_email = broker.email;

    if (mode === 'subscription') {
      params.subscription_data = { metadata: { brokerSlug: tenantId } };
    } else {
      params.metadata = { brokerSlug: tenantId, product: produto };
    }

    // cupom: ou uma promo nomeada que o client pediu (validada contra
    // PROMOS — nunca aceita um coupon cru do client) ou o automático
    // por produto — nunca os dois, e nunca por confiar no que o client
    // manda além do nome.
    const promoPedida = PROMOS[String(request.data?.promo || '')];
    const cupom = (promoPedida && promoPedida.planos.includes(priceLookupKey))
      ? promoPedida.coupon
      : COUPON_LANCAMENTO[priceLookupKey];
    if (cupom) {
      params.discounts = [{ coupon: cupom }];
    } else {
      // Stripe não deixa combinar discounts com allow_promotion_codes
      // na mesma sessão — só liga o campo de código promocional do
      // Checkout quando NÃO estamos aplicando um cupom automático (ex.:
      // corretor foi assinar por conta própria depois, com o cupom que
      // copiou do popup de "primeiro imóvel" — ver PROMOS.primeiroImovel).
      params.allow_promotion_codes = true;
    }

    try {
      const session = await stripe.checkout.sessions.create(params);
      return { url: session.url };
    } catch (err) {
      console.error('[criarCheckoutSession] erro Stripe:', err.message);
      throw new HttpsError('internal', 'Não foi possível criar a sessão de pagamento.');
    }
  }
);
