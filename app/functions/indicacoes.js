/* ══════════════════════════════════════════════════════
   aplicarCupomIndicacao — aplica um cupom ganho em "Indique e ganhe"
   direto na assinatura ativa do próprio corretor (indicador).
   ------------------------------------------------------
   Ação sob demanda (o corretor clica), não automática — evita o risco
   de concorrência que "aplicar sozinho a cada indicação convertida"
   teria (ver docs/REGRAS-DE-NEGOCIO.md, seção 8: por isso a recompensa
   em si só gera o Promotion Code, nunca mexe na assinatura sozinha).

   O cupom (duration: 'once' no Stripe) desconta a PRÓXIMA fatura a ser
   gerada, não retroage sobre uma fatura do ciclo atual que já foi
   emitida/paga — daí o texto do botão falar em "próxima fatura", não
   "mensalidade atual".

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const { db } = require('./admin');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

exports.aplicarCupomIndicacao = onCall(
  { region: 'southamerica-east1', secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
    const tenantId = request.auth.token.tenantId;
    if (!tenantId) throw new HttpsError('failed-precondition', 'Conta ainda não tem um tenant associado.');

    const brokerRef = db.doc('brokers/' + tenantId);
    const brokerSnap = await brokerRef.get();
    if (!brokerSnap.exists) throw new HttpsError('not-found', 'Broker não encontrado.');
    const broker = brokerSnap.data();

    if (broker.status !== 'active' || !broker.stripeSubscriptionId) {
      throw new HttpsError('failed-precondition', 'Você precisa ter uma assinatura ativa pra aplicar um cupom.');
    }

    // Sempre o primeiro da lista — o frontend não escolhe qual, só pede
    // "o próximo disponível" (mantém a UI de um botão só, sem precisar
    // expor qual código específico está sendo consumido).
    const codigos = broker.referral?.codes || [];
    const codigo = codigos[0];
    if (!codigo) {
      throw new HttpsError('failed-precondition', 'Você não tem nenhum cupom disponível.');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const sub = await stripe.subscriptions.retrieve(broker.stripeSubscriptionId);
    if (sub.discounts && sub.discounts.length > 0) {
      throw new HttpsError('failed-precondition', 'Sua assinatura já tem um desconto ativo — aguarde ele ser usado antes de aplicar outro cupom.');
    }

    const promos = await stripe.promotionCodes.list({ code: codigo, limit: 1 });
    const promo = promos.data[0];
    if (!promo || !promo.active) {
      // código sumiu ou já foi consumido de outro jeito (ex.: digitado
      // manualmente num checkout antigo) — tira da lista pra não ficar
      // oferecendo algo que não existe mais.
      await brokerRef.set({
        'referral.codes': FieldValue.arrayRemove(codigo),
        updatedAt: new Date(),
      }, { merge: true });
      throw new HttpsError('failed-precondition', 'Esse cupom não está mais disponível — pode já ter sido usado. Tente de novo.');
    }

    try {
      await stripe.subscriptions.update(broker.stripeSubscriptionId, {
        discounts: [{ promotion_code: promo.id }],
      });
    } catch (err) {
      console.error('[aplicarCupomIndicacao] erro Stripe:', err.message);
      throw new HttpsError('internal', 'Não foi possível aplicar o cupom agora. Tente de novo em instantes.');
    }

    await brokerRef.set({
      'referral.codes':     FieldValue.arrayRemove(codigo),
      'referral.usedCodes': FieldValue.arrayUnion(codigo),
      updatedAt: new Date(),
    }, { merge: true });

    return { ok: true, code: codigo };
  }
);
