// ════════════════════════════════════════════════
// planos.html — mostra o status atual do trial e cria a Checkout
// Session do Stripe ao clicar em assinar. Mesma project agora, então
// a function criarCheckoutSession é onCall (auth automático via SDK,
// sem o idToken manual que a versão antiga do control-plane precisava).
// ════════════════════════════════════════════════
import { auth } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';
import { trialExpirado, diasRestantesTrial } from './tenant.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('statusAtual');
const msg = $('planosMsg');

const functions = getFunctions(auth.app, 'southamerica-east1');
const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');

initShell({ active: 'plano', title: 'Plano' }).then(({ broker }) => {
  // Planos é a única página que o paywall de trial vencido deixa
  // passar (ver PAGINA_LIVRE_NO_PAYWALL em shell.js) — então é aqui que
  // o estado "venceu" precisa aparecer por escrito.
  if (trialExpirado(broker)) {
    statusEl.textContent = 'Seu teste grátis terminou. Seu catálogo continua no ar, mas o painel fica bloqueado até você assinar — use o cupom 50OFF para 50% de desconto vitalício.';
  } else if (broker.status === 'trialing') {
    const dias = diasRestantesTrial(broker);
    statusEl.textContent = dias === 1
      ? 'Último dia do seu teste grátis — assine para não perder o acesso ao painel.'
      : `Seu teste grátis termina em ${dias} dias — assine antes para não perder o acesso ao painel.`;
  } else if (broker.status === 'active') {
    statusEl.textContent = `Plano atual: ${broker.plan}. Assinar um plano diferente troca automaticamente.`;
  } else {
    statusEl.textContent = 'Regularize sua assinatura pra manter o catálogo completo visível.';
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
      if (data.updated) {
        msg.textContent = `Plano trocado para ${data.plan}! A cobrança já foi ajustada proporcionalmente.`;
        msg.className = 'msg msg--ok';
        btn.disabled = false;
        btn.textContent = textoOriginal;
        return;
      }
      location.href = data.url;
    } catch (err) {
      msg.textContent = 'Não foi possível abrir o checkout: ' + err.message;
      msg.className = 'msg msg--err';
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });
});
