/* ══════════════════════════════════════════════════════
   stripeWebhook — recebe eventos do Stripe e atualiza brokers/{slug}
   ------------------------------------------------------
   checkout.session.completed, mode:payment  → grava em purchases/
     (único jeito de saber que um pagamento único/avulso aconteceu)
   customer.subscription.created|updated     → grava plan/status
     (chega com o price já resolvido — checkout.session.completed
     em mode:subscription não faz nada, esse evento cobre o caso)
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

async function processarSubscription(subscription) {
  const slug = subscription.metadata?.brokerSlug
    || await acharSlugPorCustomer(subscription.customer);
  if (!slug) {
    console.warn('[stripeWebhook] subscription sem brokerSlug e sem match por customer:', subscription.id);
    return;
  }

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

  await db.doc('brokers/' + slug).set(atualizacao, { merge: true });
  console.log(`[stripeWebhook] "${slug}" atualizado via subscription: plan=${atualizacao.plan ?? '(sem mudança)'} status=${atualizacao.status ?? '(sem mudança)'}`);
}

async function processarCompraAvulsa(session) {
  const slug = session.client_reference_id || session.metadata?.brokerSlug;
  if (!slug) {
    console.warn('[stripeWebhook] checkout payment sem client_reference_id:', session.id);
    return;
  }
  // doc ID determinístico (session.id) — reentrega do mesmo evento
  // atualiza o mesmo doc em vez de duplicar a compra
  await db.doc(`brokers/${slug}/purchases/${session.id}`).set({
    product:               session.metadata?.product || 'desconhecido',
    status:                 'paid',
    amountUsd:               (session.amount_total || 0) / 100,
    stripePaymentIntentId:   session.payment_intent || null,
    createdAt:               new Date(),
  }, { merge: true });
  console.log(`[stripeWebhook] compra avulsa registrada: ${slug}/${session.id}`);
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
          await processarSubscription(event.data.object);
          break;
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const slug = sub.metadata?.brokerSlug || await acharSlugPorCustomer(sub.customer);
          if (slug) {
            await db.doc('brokers/' + slug).set({ status: 'canceled', updatedAt: new Date() }, { merge: true });
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
