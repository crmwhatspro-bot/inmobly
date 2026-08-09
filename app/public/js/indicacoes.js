// ════════════════════════════════════════════════
// indicacoes.html — "Indique e ganhe". Lê direto do doc do broker (já
// carregado pelo shell), sem function nova: os códigos são gerados
// pelo webhook do Stripe quando uma indicação converte (ver
// functions/webhook.js), essa página só precisa exibir o que já está
// gravado em broker.referral.
// ════════════════════════════════════════════════
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);
const indicacaoLinkEl = $('indicacaoLink');
const indicacaoCopiarBtn = $('indicacaoCopiarLink');
const indicacoesStatusEl = $('indicacoesStatus');
const indicacoesCodigosEl = $('indicacoesCodigos');

const MAX_INDICACOES_RECOMPENSADAS = 5;

initShell({ active: 'indicacoes', title: 'Indique e ganhe' }).then(({ broker, tenantId }) => {
  renderIndicacoes(broker, tenantId);
});

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
