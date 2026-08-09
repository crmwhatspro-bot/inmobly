// ════════════════════════════════════════════════
// indicacoes.html — "Indique e ganhe". Lê direto do doc do broker (já
// carregado pelo shell), sem function nova: os códigos são gerados
// pelo webhook do Stripe quando uma indicação converte (ver
// functions/webhook.js), essa página só precisa exibir o que já está
// gravado em broker.referral.
// ════════════════════════════════════════════════
import { auth } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);
const indicacaoLinkEl = $('indicacaoLink');
const indicacaoCopiarBtn = $('indicacaoCopiarLink');
const indicacoesStatusEl = $('indicacoesStatus');
const indicacoesCodigosEl = $('indicacoesCodigos');
const aplicarBtn = $('indicacaoAplicarBtn');
const aplicarMsg = $('indicacoesAplicarMsg');

const MAX_INDICACOES_RECOMPENSADAS = 5;

const functions = getFunctions(auth.app, 'southamerica-east1');
const aplicarCupomIndicacao = httpsCallable(functions, 'aplicarCupomIndicacao');

let brokerAtual = null;
let tenantIdAtual = null;

initShell({ active: 'indicacoes', title: 'Indique e ganhe' }).then(({ broker, tenantId }) => {
  brokerAtual = broker;
  tenantIdAtual = tenantId;
  renderIndicacoes(broker, tenantId);
});

function renderIndicacoes(broker, tenantId) {
  indicacaoLinkEl.value = `${location.origin}/criar-conta.html?ref=${tenantId}`;

  const codigos = broker.referral?.codes || [];
  const convertidas = broker.referral?.convertidas || 0;
  const economiaAcumulada = codigos.length * 10;
  indicacoesStatusEl.textContent = codigos.length
    ? `${convertidas} de ${MAX_INDICACOES_RECOMPENSADAS} indicações premiadas — você tem ${codigos.length} cupom(ns) de 10% pra usar (um por vez, sem prazo), até ${economiaAcumulada}% de economia acumulada.`
    : 'Ainda sem indicações premiadas. Compartilhe seu link — o cupom aparece aqui assim que quem você indicou assinar um plano pago.';

  // Aplicar só faz sentido pra quem já é assinante ativo — mesma regra
  // que aplicarCupomIndicacao valida no backend (ver functions/indicacoes.js).
  // Escondido aqui pra não deixar clicar em vão quem está no trial.
  aplicarBtn.hidden = !(codigos.length && broker.status === 'active');

  if (!codigos.length) {
    indicacoesCodigosEl.hidden = true;
    return;
  }
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

aplicarBtn.addEventListener('click', async () => {
  aplicarBtn.disabled = true;
  const original = aplicarBtn.textContent;
  aplicarBtn.textContent = 'Aplicando...';
  aplicarMsg.hidden = true;

  try {
    const { data } = await aplicarCupomIndicacao();
    // Reflete localmente sem esperar recarregar a página — o código
    // usado já foi removido no backend (referral.codes), aqui só
    // espelha o mesmo estado pra lista/contador não ficarem
    // desatualizados até a próxima navegação.
    brokerAtual.referral = {
      ...brokerAtual.referral,
      codes: (brokerAtual.referral?.codes || []).filter(c => c !== data.code),
    };
    renderIndicacoes(brokerAtual, tenantIdAtual);
    aplicarMsg.textContent = `Cupom ${data.code} aplicado — o desconto entra na sua próxima fatura.`;
    aplicarMsg.className = 'indicacoes-status msg--ok';
    aplicarMsg.hidden = false;
  } catch (err) {
    aplicarMsg.textContent = 'Não foi possível aplicar o cupom: ' + err.message;
    aplicarMsg.className = 'indicacoes-status msg--err';
    aplicarMsg.hidden = false;
  } finally {
    aplicarBtn.disabled = false;
    aplicarBtn.textContent = original;
  }
});
