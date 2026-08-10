/* ══════════════════════════════════════════════════════
   assinatura.js — o que o corretor faz com a assinatura que já tem:
   cancelar, voltar atrás, e abrir o portal do Stripe pra trocar
   cartão / ver faturas.

   Cancelar é sempre AGENDADO pro fim do período pago
   (cancel_at_period_end), nunca imediato: o mês já foi cobrado, e
   derrubar o catálogo no meio dele criaria uma conversa de reembolso
   que ninguém quer ter. Consequência importante: o Stripe manda um
   customer.subscription.updated com `status` ainda 'active' — quem
   marca o doc como cancelado de fato é o subscription.deleted, lá na
   virada do período. Por isso existe o campo `cancelAtPeriodEnd`
   separado do `status`: sem ele o painel não teria como saber que há
   um cancelamento a caminho.

   O motivo do cancelamento usa o enum do PRÓPRIO Stripe
   (cancellation_details.feedback) em vez de uma lista nossa — assim ele
   aparece nos relatórios de churn do Stripe além de ficar no nosso doc.

   ⚠️  O portal exige uma configuração salva em Settings → Billing →
   Customer portal, POR MODO (test e live são separadas). Sem isso a
   API responde erro de configuração ausente e o botão não abre nada.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Stripe = require('stripe');
const { db } = require('./admin');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

const REGIAO = 'southamerica-east1';
const BASE_URL = 'https://painel.sitemob.app';

// Valores aceitos por cancellation_details.feedback. Qualquer coisa
// fora disso o Stripe recusa a chamada inteira — por isso o que vem do
// client é validado contra esta lista e cai em 'other' se não bater,
// em vez de derrubar o cancelamento por causa do campo de pesquisa.
const FEEDBACKS = [
  'too_expensive',
  'missing_features',
  'switched_service',
  'unused',
  'customer_service',
  'low_quality',
  'too_complex',
  'other',
];

// current_period_end mudou de lugar entre versões da API do Stripe: era
// campo da subscription, passou a viver no item da subscription. Lê dos
// dois lados pra não depender de qual versão a conta está fixada — e
// devolve null em vez de uma data inventada se nenhum existir, porque
// esse valor vira texto na tela ("sua assinatura vai até ...").
function fimDoPeriodo(subscription) {
  const bruto = subscription?.current_period_end
    ?? subscription?.items?.data?.[0]?.current_period_end
    ?? null;
  return bruto ? new Date(bruto * 1000) : null;
}

// Auth + doc do broker, que os três handlers precisam igual.
async function contexto(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
  const tenantId = request.auth.token.tenantId;
  if (!tenantId) throw new HttpsError('failed-precondition', 'Conta ainda não tem um tenant associado.');

  const ref = db.doc('brokers/' + tenantId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Broker não encontrado.');

  return { tenantId, ref, broker: snap.data() };
}

exports.cancelarAssinatura = onCall(
  { region: REGIAO, secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const { tenantId, ref, broker } = await contexto(request);

    // Não exige status 'active' de propósito: quem está em past_due
    // também tem direito de cancelar — aliás é quem mais tenta.
    if (!broker.stripeSubscriptionId) {
      throw new HttpsError('failed-precondition', 'Não há assinatura ativa para cancelar.');
    }

    const motivo = String(request.data?.motivo || '');
    const feedback = FEEDBACKS.includes(motivo) ? motivo : 'other';
    const comentario = String(request.data?.comentario || '').trim().slice(0, 500);

    let sub;
    try {
      sub = await stripeClient().subscriptions.update(broker.stripeSubscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: {
          feedback,
          // string vazia é recusada pelo Stripe — manda o campo só se
          // o corretor escreveu algo de verdade.
          ...(comentario ? { comment: comentario } : {}),
        },
      });
    } catch (err) {
      console.error(`[cancelarAssinatura] falha no Stripe (tenant="${tenantId}"):`, err.message);
      throw new HttpsError('internal', 'Não foi possível cancelar agora. Tente de novo em instantes.');
    }

    const terminaEm = fimDoPeriodo(sub);

    // Grava já, sem esperar o webhook: o corretor acabou de clicar e
    // vai recarregar a tela em segundos — se o estado só chegasse pelo
    // evento, ele veria a assinatura "ainda ativa" e clicaria de novo.
    // O webhook depois reescreve os mesmos campos com o mesmo valor.
    await ref.set({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: terminaEm,
      cancellationFeedback: feedback,
      cancellationComment: comentario || null,
      cancellationRequestedAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    console.log(`[cancelarAssinatura] "${tenantId}" agendou cancelamento (motivo=${feedback})`);
    return { terminaEm: terminaEm ? terminaEm.toISOString() : null };
  }
);

exports.reativarAssinatura = onCall(
  { region: REGIAO, secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const { tenantId, ref, broker } = await contexto(request);

    if (!broker.stripeSubscriptionId) {
      throw new HttpsError('failed-precondition', 'Não há assinatura para reativar.');
    }

    let sub;
    try {
      sub = await stripeClient().subscriptions.update(broker.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (err) {
      console.error(`[reativarAssinatura] falha no Stripe (tenant="${tenantId}"):`, err.message);
      // Assinatura que JÁ virou o período não dá pra "desagendar" — ela
      // não existe mais, e o caminho certo é assinar de novo.
      throw new HttpsError('failed-precondition', 'Não foi possível reativar. Se o período já terminou, assine um plano novamente.');
    }

    await ref.set({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: fimDoPeriodo(sub),
      cancellationRequestedAt: null,
      updatedAt: new Date(),
    }, { merge: true });

    console.log(`[reativarAssinatura] "${tenantId}" desfez o cancelamento`);
    return { ok: true };
  }
);

// Portal do Stripe — trocar cartão, ver/baixar faturas. Existe porque
// hoje o corretor com cobrança falhando não tem NENHUMA forma de
// corrigir o cartão pelo painel; a carência de inadimplência
// (docs/REGRAS-DE-NEGOCIO.md) pressupõe que ele tenha.
exports.criarPortalSession = onCall(
  { region: REGIAO, secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const { tenantId, broker } = await contexto(request);

    if (!broker.stripeCustomerId) {
      throw new HttpsError('failed-precondition', 'Sua conta ainda não tem histórico de pagamento.');
    }

    try {
      const sessao = await stripeClient().billingPortal.sessions.create({
        customer: broker.stripeCustomerId,
        return_url: `${BASE_URL}/planos.html`,
      });
      return { url: sessao.url };
    } catch (err) {
      console.error(`[criarPortalSession] falha no Stripe (tenant="${tenantId}"):`, err.message);
      throw new HttpsError('internal', 'Não foi possível abrir a área de pagamento agora.');
    }
  }
);

// Instanciado por chamada, não no topo do módulo: STRIPE_SECRET_KEY.value()
// só pode ser lido durante a execução de uma function que declarou o
// secret — no carregamento do módulo ele ainda não existe.
function stripeClient() {
  return new Stripe(STRIPE_SECRET_KEY.value());
}

module.exports.fimDoPeriodo = fimDoPeriodo;
