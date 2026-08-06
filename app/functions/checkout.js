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

const BASE_URL = 'https://inmobly-project.web.app'; // atualizar se/quando tiver domínio próprio

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

    const params = {
      mode,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: tenantId,
      success_url: `${BASE_URL}/obrigado.html`,
      cancel_url:  `${BASE_URL}/planos.html`,
    };

    if (broker.stripeCustomerId) params.customer = broker.stripeCustomerId;
    else params.customer_email = broker.email;

    if (mode === 'subscription') {
      params.subscription_data = { metadata: { brokerSlug: tenantId } };
    } else {
      params.metadata = { brokerSlug: tenantId, product: produto };
      const coupon = COUPON_LANCAMENTO[priceLookupKey];
      if (coupon) params.discounts = [{ coupon }];
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
