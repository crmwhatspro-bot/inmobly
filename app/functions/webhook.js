/* ══════════════════════════════════════════════════════
   stripeWebhook — recebe eventos do Stripe e atualiza brokers/{slug}
   ------------------------------------------------------
   checkout.session.completed, mode:payment  → grava em purchases/
     (único jeito de saber que um pagamento único/avulso aconteceu)
   customer.subscription.created|updated     → grava plan/status
     (chega com o price já resolvido — checkout.session.completed
     em mode:subscription não faz nada, esse evento cobre o caso)
     Também é aqui que "Indique e ganhe" dispara: na primeira vez que
     um broker indicado (referredBy) vira active, gera um Promotion
     Code de 10% off pro indicador (ver recompensarIndicador abaixo).
   customer.subscription.deleted             → status: 'canceled'

   Essa lógica é quase idêntica à versão do control-plane/ antigo —
   ela sempre escreveu só no doc "central", que agora é o único doc
   que existe (não tem mais "broker" separado pra sincronizar depois).

   Configurar no Stripe Dashboard → Developers → Webhooks → Add
   endpoint, apontando pra URL desta function, com os eventos:
     checkout.session.completed
     customer.subscription.created
     customer.subscription.updated
     customer.subscription.deleted

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { FieldValue, FieldPath } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const { db } = require('./admin');

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// lookup_key → o que vira no doc do broker. Muda raro (só quando o
// plano/preço muda de verdade, o que já é um evento de deploy) — não
// vale a pena tornar isso dinâmico via Firestore por enquanto.
const PLANOS = {
  inmobly_starter_monthly: { plan: 'starter', imoveisLimit: 40,   domainIncluded: false },
  inmobly_pro_monthly:     { plan: 'pro',      imoveisLimit: null, domainIncluded: true  },
};

// nosso trial nunca passa pelo Stripe (sem cartão, autogerenciado) —
// então esse mapa só cobre os status que uma subscription real tem
// depois de existir. 'incomplete'/'incomplete_expired' ficam de fora
// de propósito: o checkout nunca completou de verdade, não escreve
// nada e deixa o status atual como está.
const STATUS_MAP = {
  active:   'active',
  past_due: 'past_due',
  unpaid:   'past_due',
  canceled: 'canceled',
};

async function acharSlugPorCustomer(customerId) {
  const snap = await db.collection('brokers').where('stripeCustomerId', '==', customerId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

// Append-only: uma linha por mudança real de status da assinatura, em
// brokers/{slug}/statusHistory/. É o que torna churn calculável de
// verdade mais tarde ("quantos cancelaram no mês X") — activatedAt/
// canceledAt no doc do broker resolvem o funil básico, mas só guardam
// a primeira ativação e o último cancelamento, e perdem quem foi e
// voltou. Ninguém lê isso ainda; o painel interno usa os carimbos do
// doc. Falha aqui NÃO derruba o webhook: o estado que importa
// (brokers.status) já foi gravado antes, e um 5xx faria o Stripe
// reentregar o evento e reprocessar tudo por causa de um log.
async function registrarTransicao(brokerRef, de, para) {
  try {
    await brokerRef.collection('statusHistory').add({ de, para, at: new Date() });
  } catch (err) {
    console.error(`[stripeWebhook] falha ao registrar transição ${de} → ${para} em ${brokerRef.path}:`, err);
  }
}

// ── Indique e ganhe ─────────────────────────────────────────────
// Coupon único e compartilhado (percent_off 10, duration 'once' — só
// desconta a fatura em que for aplicado). O que diferencia cada
// indicador é o Promotion Code, um por indicação premiada.
//
// Por quê um Promotion Code novo a cada indicação, em vez de ir
// aumentando max_redemptions de um código só: a API do Stripe não
// permite alterar max_redemptions depois que o Promotion Code já foi
// criado (só "active" e "metadata" são editáveis). Minerar um código
// novo por indicação premiada é o jeito nativo de "acumular" — cada
// código vale 1 uso, sem validade (expires_at nunca setado), até o
// teto de MAX_INDICACOES_RECOMPENSADAS por indicador.
const COUPON_AFILIADO_ID = 'AFILIADO10';
const MAX_INDICACOES_RECOMPENSADAS = 5;

async function garantirCupomAfiliado(stripe) {
  try {
    await stripe.coupons.retrieve(COUPON_AFILIADO_ID);
  } catch (err) {
    if (err.code !== 'resource_missing') throw err;
    await stripe.coupons.create({
      id: COUPON_AFILIADO_ID,
      percent_off: 10,
      duration: 'once',
      name: 'Indique e ganhe',
    });
  }
}

async function recompensarIndicador({ referrerSlug, indicadoSlug, stripe }) {
  const referrerRef = db.doc('brokers/' + referrerSlug);
  const referrerSnap = await referrerRef.get();
  if (!referrerSnap.exists) {
    console.warn(`[stripeWebhook] indicador "${referrerSlug}" não existe mais — recompensa pela indicação de "${indicadoSlug}" ignorada`);
    return;
  }

  const codigosAtuais = referrerSnap.data().referral?.codes || [];
  if (codigosAtuais.length >= MAX_INDICACOES_RECOMPENSADAS) {
    console.log(`[stripeWebhook] indicador "${referrerSlug}" já tem os ${MAX_INDICACOES_RECOMPENSADAS} códigos — indicação de "${indicadoSlug}" não gera novo código`);
    return;
  }

  await garantirCupomAfiliado(stripe);

  // código previsível (INDICA-<slug>-<n>) — dá pra recriar o mesmo
  // texto sem precisar guardar/consultar nada além da contagem atual
  const codigo = `INDICA-${referrerSlug}-${codigosAtuais.length + 1}`.toUpperCase();
  await stripe.promotionCodes.create({
    coupon: COUPON_AFILIADO_ID,
    code: codigo,
    max_redemptions: 1,
    metadata: { referrerSlug, indicadoSlug },
  });

  // update() com FieldPath, e não set({'referral.codes': ...}): no
  // Admin SDK só update() interpreta o ponto como CAMINHO. Em set(), a
  // chave vira um campo de nome literal "referral.codes" no topo do
  // doc, e o `referral.codes` que este mesmo arquivo lê logo acima
  // (`referrerSnap.data().referral?.codes`) ficaria sempre vazio — o
  // indicador nunca chegaria ao teto e ganharia código infinito, cada
  // um chamado INDICA-<slug>-1. Mesma armadilha do
  // usage.paginasCompradas, ver processarCompraAvulsa.
  //
  // criarConta.js já cria o doc com `referral: { codes: [], convertidas: 0 }`,
  // então o caminho existe; e o update() só roda depois do get() acima
  // ter confirmado que o doc existe.
  await referrerRef.update(
    new FieldPath('referral', 'codes'), FieldValue.arrayUnion(codigo),
    new FieldPath('referral', 'convertidas'), FieldValue.increment(1),
    'updatedAt', new Date(),
  );
  console.log(`[stripeWebhook] "${referrerSlug}" ganhou o código ${codigo} pela indicação de "${indicadoSlug}"`);
}

async function processarSubscription(subscription, stripe) {
  const slug = subscription.metadata?.brokerSlug
    || await acharSlugPorCustomer(subscription.customer);
  if (!slug) {
    console.warn('[stripeWebhook] subscription sem brokerSlug e sem match por customer:', subscription.id);
    return;
  }

  const brokerRef  = db.doc('brokers/' + slug);
  const brokerSnap = await brokerRef.get();
  const brokerAntes = brokerSnap.exists ? brokerSnap.data() : null;

  const lookupKey = subscription.items?.data?.[0]?.price?.lookup_key;
  const infoPlano = PLANOS[lookupKey];
  const status = STATUS_MAP[subscription.status];

  if (!infoPlano) {
    console.warn(`[stripeWebhook] lookup_key desconhecido "${lookupKey}" na subscription ${subscription.id} — plano não atualizado`);
  }

  const atualizacao = {
    stripeCustomerId:     subscription.customer,
    stripeSubscriptionId: subscription.id,
    updatedAt:            new Date(),
  };
  if (infoPlano) Object.assign(atualizacao, infoPlano);
  if (status)    atualizacao.status = status;

  // Carimbos de transição — o doc do broker só guarda o status ATUAL,
  // então sem isso o painel interno só consegue dizer "X assinantes
  // hoje", nunca "X assinaturas fechadas em julho" nem churn.
  // subscription.updated chega em qualquer mexida na assinatura (troca
  // de plano, renovação, cartão novo), quase sempre com o mesmo status
  // — por isso só carimba quando o status REALMENTE mudou, senão
  // statusChangedAt viraria "última vez que o Stripe mandou um evento".
  const statusMudou = status && status !== brokerAntes?.status;
  if (statusMudou) {
    atualizacao.statusChangedAt = atualizacao.updatedAt;
    // Primeira conversão trial → pagante. Só na primeira: se a pessoa
    // cancelar e voltar, o que interessa pro funil é a data em que ela
    // virou cliente, não a da reativação (essa fica no statusHistory).
    if (status === 'active' && !brokerAntes?.activatedAt) {
      atualizacao.activatedAt = atualizacao.updatedAt;
    }
    if (status === 'canceled') atualizacao.canceledAt = atualizacao.updatedAt;
  }

  await brokerRef.set(atualizacao, { merge: true });
  if (statusMudou) await registrarTransicao(brokerRef, brokerAntes?.status ?? null, status);
  console.log(`[stripeWebhook] "${slug}" atualizado via subscription: plan=${atualizacao.plan ?? '(sem mudança)'} status=${atualizacao.status ?? '(sem mudança)'}`);

  // Indique e ganhe: dispara a recompensa pro indicador quando o
  // INDICADO efetua pagamento de verdade (vira assinante pago) — não
  // em cada renovação mensal. Checa `referralRewarded` (não "status
  // mudou de X pra active") de propósito: se recompensarIndicador
  // falhar (erro do Stripe), o flag continua false, e a próxima
  // reentrega do webhook (Stripe reenvia em erro 5xx) tenta de novo —
  // uma checagem de transição de status quebraria esse retry, porque
  // o Firestore já teria sido escrito com status:'active' na tentativa
  // anterior, mesmo a recompensa tendo falhado.
  if (status === 'active' && brokerAntes?.referredBy && !brokerAntes?.referralRewarded) {
    await recompensarIndicador({ referrerSlug: brokerAntes.referredBy, indicadoSlug: slug, stripe });
    await brokerRef.set({ referralRewarded: true }, { merge: true });
  }
}

async function processarCompraAvulsa(session) {
  const slug = session.client_reference_id || session.metadata?.brokerSlug;
  if (!slug) {
    console.warn('[stripeWebhook] checkout payment sem client_reference_id:', session.id);
    return;
  }
  const produto = session.metadata?.product || 'desconhecido';

  // doc ID determinístico (session.id) — reentrega do mesmo evento
  // atualiza o mesmo doc em vez de duplicar a compra. Precisa saber se
  // já existia ANTES de gravar pra decidir se credita o saldo de
  // páginas — Stripe reentrega o mesmo evento às vezes (at-least-once),
  // e FieldValue.increment não é idempotente por si só.
  const ref = db.doc(`brokers/${slug}/purchases/${session.id}`);
  const jaExistia = (await ref.get()).exists;

  await ref.set({
    product:               produto,
    status:                 'paid',
    amountUsd:               (session.amount_total || 0) / 100,
    stripePaymentIntentId:   session.payment_intent || null,
    createdAt:               new Date(),
  }, { merge: true });
  console.log(`[stripeWebhook] compra avulsa registrada: ${slug}/${session.id}`);

  // Página de Emprendimento é pré-paga: cada compra credita um slot em
  // usage.paginasCompradas, que paginas.html usa pra liberar "+ Nova
  // página" — sem exigir conteúdo/slug no momento da compra.
  if (!jaExistia && produto === 'emprendimento_page') {
    // update() com FieldPath, e não set({'usage.paginasCompradas': ...}):
    // no Admin SDK só update() interpreta o ponto como CAMINHO. Em
    // set(), a chave vira um campo de nome literal "usage.paginasCompradas"
    // no topo do doc, e o `usage.paginasCompradas` que paginas.js lê
    // (`broker?.usage?.paginasCompradas`) fica undefined pra sempre —
    // ou seja, a página comprada nunca era creditada.
    await db.doc('brokers/' + slug).update(
      new FieldPath('usage', 'paginasCompradas'), FieldValue.increment(1),
      'updatedAt', new Date(),
    );
    console.log(`[stripeWebhook] "${slug}" +1 página comprada`);
  }
}

exports.stripeWebhook = onRequest(
  { region: 'southamerica-east1', secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    let event;
    try {
      // req.rawBody é preservado pelo Functions v2 — nenhum middleware
      // de parsing JSON pode entrar na frente disso, senão a
      // verificação de assinatura quebra.
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      console.error('[stripeWebhook] assinatura inválida:', err.message);
      res.status(400).send('assinatura inválida');
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode === 'payment') await processarCompraAvulsa(session);
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await processarSubscription(event.data.object, stripe);
          break;
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const slug = sub.metadata?.brokerSlug || await acharSlugPorCustomer(sub.customer);
          if (slug) {
            const brokerRef = db.doc('brokers/' + slug);
            const statusAntes = (await brokerRef.get()).data()?.status ?? null;
            const agora = new Date();
            await brokerRef.set({ status: 'canceled', updatedAt: agora }, { merge: true });
            // Mesmo carimbo de transição de processarSubscription — um
            // cancelamento pode chegar por aqui (deleted) sem nunca
            // passar por um subscription.updated com status canceled.
            if (statusAntes !== 'canceled') {
              await brokerRef.set({ statusChangedAt: agora, canceledAt: agora }, { merge: true });
              await registrarTransicao(brokerRef, statusAntes, 'canceled');
            }
            console.log(`[stripeWebhook] "${slug}" cancelado`);
          } else {
            console.warn('[stripeWebhook] subscription.deleted sem match de broker:', sub.id);
          }
          break;
        }
        default:
          break;
      }
      res.status(200).send('ok');
    } catch (err) {
      console.error('[stripeWebhook] erro processando evento', event.type, ':', err.message);
      res.status(500).send('erro interno'); // Stripe re-tenta em erro 5xx
    }
  }
);
