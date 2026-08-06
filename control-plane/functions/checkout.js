/* ══════════════════════════════════════════════════════
   criarCheckoutSession — cria a Checkout Session do Stripe
   ------------------------------------------------------
   Chamada pelo /admin de cada broker (projeto Spark, sem Functions
   próprias) via fetch cross-project — por isso mora no central.

   Autenticação sem segundo login: o broker já está logado no /admin
   dele (Google Auth do PRÓPRIO projeto Firebase). O /admin manda o
   idToken desse login + o slug; aqui a gente verifica esse token
   contra o projeto Firebase DAQUELE broker especificamente (não o
   projeto central) e confere que o e-mail bate com
   brokers/{slug}.email. Sem isso, qualquer um poderia pagar um
   checkout carimbando o slug de outro broker — com o PRÓPRIO cartão,
   mas controlando (e podendo depois cancelar) a assinatura de quem
   não pediu.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const Stripe = require('stripe');
const { db } = require('./admin');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

// lookup_key → coupon aplicado automaticamente na sessão. Só existe
// pra Página de Emprendimento, enquanto o Inmobly valida o produto
// (ver docs/REGRAS-DE-NEGOCIO.md, seção 5) — nunca nos planos
// recorrentes. Tirar essa linha quando o desconto de lançamento acabar.
const COUPON_LANCAMENTO = {
  inmobly_emprendimento_page: 'LANCAMENTO50',
};

// Verifica o idToken contra o Firebase Auth do PROJETO DAQUELE BROKER
// — verificação de assinatura JWT, não precisa de credencial de
// service account, só do projectId (um app por broker, nomeado, pra
// não colidir com o app default do projeto central).
async function verificarTokenDoBroker(idToken, firebaseProjectId, slug) {
  const nomeApp = 'verify-' + slug;
  const app = getApps().find(a => a.name === nomeApp)
    || initializeApp({ projectId: firebaseProjectId }, nomeApp);
  return getAuth(app).verifyIdToken(idToken);
}

exports.criarCheckoutSession = onRequest(
  { region: 'southamerica-east1', cors: true, secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }

    const { slug, idToken, priceLookupKey } = req.body || {};
    if (!slug || !idToken || !priceLookupKey) {
      res.status(400).json({ error: 'slug, idToken e priceLookupKey são obrigatórios' });
      return;
    }

    const brokerSnap = await db.doc('brokers/' + slug).get();
    if (!brokerSnap.exists) {
      res.status(404).json({ error: 'broker não encontrado' });
      return;
    }
    const broker = brokerSnap.data();

    let decoded;
    try {
      decoded = await verificarTokenDoBroker(idToken, broker.firebaseProjectId, slug);
    } catch (err) {
      res.status(401).json({ error: 'token inválido: ' + err.message });
      return;
    }
    if (decoded.email !== broker.email) {
      res.status(403).json({ error: 'e-mail do token não corresponde ao admin deste broker' });
      return;
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    let price;
    try {
      const precos = await stripe.prices.list({ lookup_keys: [priceLookupKey], limit: 1 });
      price = precos.data[0];
    } catch (err) {
      res.status(500).json({ error: 'erro ao buscar price no Stripe: ' + err.message });
      return;
    }
    if (!price) {
      res.status(400).json({ error: 'priceLookupKey desconhecido: ' + priceLookupKey });
      return;
    }

    // mode vem do tipo real do Price, não do que o cliente manda
    const mode = price.type === 'recurring' ? 'subscription' : 'payment';
    const produto = priceLookupKey.replace(/^inmobly_/, '').replace(/_monthly$/, '');

    const params = {
      mode,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: slug,
      success_url: `${broker.siteUrl}/admin?checkout=sucesso`,
      cancel_url:  `${broker.siteUrl}/admin?checkout=cancelado`,
    };

    if (broker.stripeCustomerId) params.customer = broker.stripeCustomerId;
    else params.customer_email = broker.email;

    if (mode === 'subscription') {
      // metadata na subscription, não só na session — é o que
      // customer.subscription.updated usa depois pra achar o broker
      params.subscription_data = { metadata: { brokerSlug: slug } };
    } else {
      params.metadata = { brokerSlug: slug, product: produto };
      const coupon = COUPON_LANCAMENTO[priceLookupKey];
      if (coupon) params.discounts = [{ coupon }];
    }

    try {
      const session = await stripe.checkout.sessions.create(params);
      res.json({ url: session.url });
    } catch (err) {
      console.error('[criarCheckoutSession] erro Stripe:', err.message);
      res.status(500).json({ error: 'não foi possível criar a sessão de pagamento' });
    }
  }
);
