// ════════════════════════════════════════════════
// dominio.html — conectar/verificar/remover um domínio próprio no
// catálogo público do tenant, via as functions de functions/dominio.js
// (conectarDominio/verificarDominio/removerDominio — Hosting REST API
// v1beta1, recurso sites.domains). broker.customDomain/customDomainStatus
// (brokers/{tenantId}) são só um CACHE do último status conhecido — a
// fonte de verdade é sempre a resposta da function, nunca escrita
// direto pelo client (ver firestore.rules: esses campos não estão na
// lista de campos que o tenant pode gravar sozinho).
// ════════════════════════════════════════════════
import { auth } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);

const urlAtualEl   = $('dmUrlAtual');
const formSec      = $('dmFormSec');
const dominioInput = $('dm-dominio');
const formMsg      = $('dmFormMsg');
const conectarBtn  = $('dmConectarBtn');

const statusSec       = $('dmStatusSec');
const dominioTituloEl = $('dmDominioTitulo');
const statusBadgeEl   = $('dmStatusBadge');
const statusExplicEl  = $('dmStatusExplicacao');
const dnsTable         = $('dmDnsTable');
const dnsBody          = $('dmDnsBody');
const statusMsg         = $('dmStatusMsg');
const verificarBtn      = $('dmVerificarBtn');
const removerBtn         = $('dmRemoverBtn');

const functions = getFunctions(auth.app, 'southamerica-east1');
const conectarDominioFn  = httpsCallable(functions, 'conectarDominio');
const verificarDominioFn = httpsCallable(functions, 'verificarDominio');
const removerDominioFn   = httpsCallable(functions, 'removerDominio');

let tenantId = null;
let broker = null;

function mostrarMsg(el, texto, erro = false) {
  if (!texto) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = texto;
  el.className = 'imv-form-msg ' + (erro ? 'imv-form-msg--erro' : 'imv-form-msg--ok');
}

// `resumo.status` já vem reduzido a um desses 4 valores (ver
// functions/dominio.js#statusResumido) — o client só traduz pra texto,
// nunca interpreta enum bruto da Hosting API.
const SITUACAO = {
  requested:   { badge: 'pendente', texto: 'Aguardando DNS', explicacao: 'Ainda não encontramos os registros abaixo no DNS do seu domínio. Configure-os no painel do seu provedor e clique em "Verificar novamente".' },
  configuring: { badge: 'pendente', texto: 'Verificando', explicacao: 'DNS encontrado, aguardando propagação e emissão do certificado SSL. Isso pode levar algumas horas.' },
  active:      { badge: 'ativo', texto: 'Ativo', explicacao: 'Seu domínio já está ativo e servindo o catálogo com certificado SSL válido.' },
};

function renderConectado(resumo) {
  formSec.hidden = true;
  statusSec.hidden = false;

  dominioTituloEl.textContent = resumo.dominio;
  const sit = SITUACAO[resumo.status] || SITUACAO.requested;
  statusBadgeEl.textContent = sit.texto;
  statusBadgeEl.className = 'dm-status-badge dm-status-badge--' + sit.badge;
  statusExplicEl.textContent = sit.explicacao;

  if (resumo.expectedIps?.length) {
    dnsTable.hidden = false;
    dnsBody.innerHTML = resumo.expectedIps.map(ip => `
      <tr><td>A</td><td>${resumo.dominio}</td><td>${ip}</td></tr>
    `).join('');
  } else {
    dnsTable.hidden = true;
  }
}

function renderDesconectado() {
  formSec.hidden = false;
  statusSec.hidden = true;
  dominioInput.value = '';
}

function atualizarUrlAtual() {
  const ativo = broker?.customDomain && broker?.customDomainStatus === 'active';
  const url = ativo ? `https://${broker.customDomain}` : `https://${tenantId}.web.app`;
  urlAtualEl.href = url;
  urlAtualEl.textContent = url;
}

conectarBtn.addEventListener('click', async () => {
  const dominio = dominioInput.value.trim().toLowerCase();
  if (!dominio) { mostrarMsg(formMsg, 'Digite um domínio.', true); return; }

  conectarBtn.disabled = true;
  mostrarMsg(formMsg, 'Conectando...');
  try {
    const { data } = await conectarDominioFn({ dominio });
    broker.customDomain = data.dominio;
    broker.customDomainStatus = data.status;
    mostrarMsg(formMsg, null);
    renderConectado(data);
    atualizarUrlAtual();
  } catch (err) {
    mostrarMsg(formMsg, err.message || 'Não foi possível conectar o domínio.', true);
  } finally {
    conectarBtn.disabled = false;
  }
});

verificarBtn.addEventListener('click', async () => {
  verificarBtn.disabled = true;
  mostrarMsg(statusMsg, 'Verificando...');
  try {
    const { data } = await verificarDominioFn();
    broker.customDomainStatus = data.status;
    mostrarMsg(statusMsg, null);
    renderConectado(data);
    atualizarUrlAtual();
  } catch (err) {
    mostrarMsg(statusMsg, err.message || 'Não foi possível verificar agora.', true);
  } finally {
    verificarBtn.disabled = false;
  }
});

removerBtn.addEventListener('click', async () => {
  if (!confirm(`Remover o domínio "${broker.customDomain}"? Seu catálogo volta a ficar disponível só em ${tenantId}.web.app.`)) return;

  removerBtn.disabled = true;
  try {
    await removerDominioFn();
    broker.customDomain = null;
    broker.customDomainStatus = null;
    renderDesconectado();
    atualizarUrlAtual();
  } catch (err) {
    mostrarMsg(statusMsg, err.message || 'Não foi possível remover agora.', true);
  } finally {
    removerBtn.disabled = false;
  }
});

initShell({ active: 'dominio', title: 'Domínio' }).then((resultado) => {
  tenantId = resultado.tenantId;
  broker = resultado.broker;
  atualizarUrlAtual();

  if (broker?.customDomain) {
    renderConectado({
      dominio: broker.customDomain,
      status: broker.customDomainStatus || 'requested',
      expectedIps: [],
    });
    // busca o status real (os expectedIps não vêm do cache do Firestore)
    verificarDominioFn().then(({ data }) => {
      broker.customDomainStatus = data.status;
      renderConectado(data);
      atualizarUrlAtual();
    }).catch(() => {}); // se falhar, fica com o que já tinha em cache
  } else {
    renderDesconectado();
  }
});
