/* ══════════════════════════════════════════════════════
   trial.js — a única regra de "esse trial venceu?" do lado servidor.

   `status` NUNCA vira 'expired': quem escreve status é o stripeWebhook,
   e ele só conhece estado de assinatura (active/past_due/canceled).
   Uma conta que passou dos 14 dias sem assinar continua 'trialing' no
   doc pra sempre — então a expiração é sempre DERIVADA de trialEndsAt
   vs. agora, nunca um campo que alguém teria que virar (não existe job
   agendado neste projeto, e não vale criar um só pra isso).

   Doc sem trialEndsAt (contas anteriores ao campo) nunca expira, de
   propósito: liberar demais é preferível a trancar quem não deveria.

   ⚠️  Esta regra existe em três lugares, e os três precisam concordar:
     · aqui                        — Cloud Functions (CommonJS)
     · public/js/tenant.js         — painel (módulo ES, browser)
     · firestore.rules#trialVencido — escrita direta do client
   Sem um passo de build não dá pra compartilhar arquivo entre eles, e
   rules nem é JavaScript. Ao mudar a regra, mudar nos três.
   ══════════════════════════════════════════════════════ */

const { HttpsError } = require('firebase-functions/v2/https');

function trialVencido(broker) {
  if (!broker || broker.status !== 'trialing') return false;
  const bruto = broker.trialEndsAt;
  if (!bruto) return false;
  const fim = bruto.toDate ? bruto.toDate() : new Date(bruto);
  return !Number.isNaN(fim.getTime()) && fim.getTime() <= Date.now();
}

// Guarda pra qualquer function que ESCREVE em nome do corretor. Não
// usar em leitura, nem no checkout: assinar é justamente a saída do
// bloqueio, e o catálogo público não depende de trial nenhum.
function exigirTrialAtivo(broker) {
  if (trialVencido(broker)) {
    throw new HttpsError(
      'failed-precondition',
      'Seu teste grátis terminou. Assine um plano para voltar a editar seu site.'
    );
  }
}

module.exports = { trialVencido, exigirTrialAtivo };
