// ════════════════════════════════════════════════
// planos.html — mostra o status atual do trial e cria a Checkout
// Session do Stripe ao clicar em assinar. Mesma project agora, então
// a function criarCheckoutSession é onCall (auth automático via SDK,
// sem o idToken manual que a versão antiga do control-plane precisava).
// ════════════════════════════════════════════════
import { auth } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('statusAtual');
const msg = $('planosMsg');
const indicacaoLinkEl = $('indicacaoLink');
const indicacaoCopiarBtn = $('indicacaoCopiarLink');
const indicacoesStatusEl = $('indicacoesStatus');
const indicacoesCodigosEl = $('indicacoesCodigos');

const MAX_INDICACOES_RECOMPENSADAS = 5;

const functions = getFunctions(auth.app, 'southamerica-east1');
const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');

initShell({ active: 'plano', title: 'Plano' }).then(({ broker, tenantId }) => {
  if (broker.status === 'trialing') {
    const fim = broker.trialEndsAt?.toDate ? broker.trialEndsAt.toDate() : new Date(broker.trialEndsAt);
    const dias = Math.max(0, Math.ceil((fim - Date.now()) / (1000 * 60 * 60 * 24)));
    statusEl.textContent = `Seu trial termina em ${dias} dia(s) — assine antes pra não perder o catálogo publicado.`;
  } else if (broker.status === 'active') {
    statusEl.textContent = `Plano atual: ${broker.plan}. Assinar um plano diferente troca automaticamente.`;
  } else {
    statusEl.textContent = 'Regularize sua assinatura pra manter o catálogo completo visível.';
  }

  renderIndicacoes(broker, tenantId);
});

// Indique e ganhe — lê direto do doc do broker (já carregado pelo
// shell), sem function nova: os códigos são gerados pelo webhook do
// Stripe quando uma indicação converte (ver functions/webhook.js), o
// painel só precisa exibir o que já está gravado em broker.referral.
function renderIndicacoes(broker, tenantId) {
  indicacaoLinkEl.value = `${location.origin}/criar-conta.html?ref=${tenantId}`;

  const codigos = broker.referral?.codes || [];
  const convertidas = broker.referral?.convertidas || 0;
  indicacoesStatusEl.textContent = codigos.length
    ? `${convertidas} de ${MAX_INDICACOES_RECOMPENSADAS} indicações premiadas — você tem ${codigos.length} cupom(ns) de 10% pra usar, sem prazo.`
    : 'Ainda sem indicações premiadas. Compartilhe seu link — o cupom aparece aqui assim que quem você indicou assinar um plano pago.';

  if (!codigos.length) return;
  indicacoesCodigosEl.hidden = false;
  indicacoesCodigosEl.innerHTML = codigos.map((codigo) => `
    <div class="indicacoes-codigo">
      <span>${codigo}</span>
      <button type="button" class="btn btn--outline-light btn--sm" data-copiar-codigo="${codigo}">Copiar</button>
    </div>`).join('');

  indicacoesCodigosEl.querySelectorAll('[data-copiar-codigo]').forEach((btn) => {
    btn.addEventListener('click', () => copiar(btn, btn.dataset.copiarCodigo));
  });
}

async function copiar(btn, texto) {
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    btn.textContent = 'Copiado!';
  } catch {
    btn.textContent = 'Copie manualmente';
  }
  setTimeout(() => { btn.textContent = original; }, 1800);
}

indicacaoCopiarBtn.addEventListener('click', () => copiar(indicacaoCopiarBtn, indicacaoLinkEl.value));

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
