// ════════════════════════════════════════════════
// planos.html — mostra o status atual do trial e cria a Checkout
// Session do Stripe ao clicar em assinar. Mesma project agora, então
// a function criarCheckoutSession é onCall (auth automático via SDK,
// sem o idToken manual que a versão antiga do control-plane precisava).
// ════════════════════════════════════════════════
import { auth, onAuthChange } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { tenantIdAtual, buscarBroker } from './tenant.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('statusAtual');
const msg = $('planosMsg');

const functions = getFunctions(auth.app, 'southamerica-east1');
const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');

let tenantId = null;

onAuthChange(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  tenantId = await tenantIdAtual();
  if (!tenantId) { location.href = 'criar-conta.html'; return; }

  const broker = await buscarBroker(tenantId);
  if (broker) {
    if (broker.status === 'trialing') {
      const fim = broker.trialEndsAt?.toDate ? broker.trialEndsAt.toDate() : new Date(broker.trialEndsAt);
      const dias = Math.max(0, Math.ceil((fim - Date.now()) / (1000 * 60 * 60 * 24)));
      statusEl.textContent = `Seu trial termina em ${dias} dia(s) — assine antes pra não perder o catálogo publicado.`;
    } else if (broker.status === 'active') {
      statusEl.textContent = `Plano atual: ${broker.plan}. Assinar um plano diferente troca automaticamente.`;
    } else {
      statusEl.textContent = 'Regularize sua assinatura pra manter o catálogo completo visível.';
    }
  }
});

document.querySelectorAll('[data-plano]').forEach(btn => {
  btn.addEventListener('click', async () => {
    msg.textContent = '';
    msg.className = 'msg';
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'Abrindo checkout...';

    try {
      const { data } = await criarCheckoutSession({ priceLookupKey: btn.dataset.plano });
      location.href = data.url;
    } catch (err) {
      msg.textContent = 'Não foi possível abrir o checkout: ' + err.message;
      msg.className = 'msg msg--err';
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });
});
