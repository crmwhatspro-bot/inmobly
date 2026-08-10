// ════════════════════════════════════════════════
// dominio.html — conectar/verificar/remover um domínio próprio no
// catálogo público do tenant, via as functions de functions/dominio.js
// (conectarDominio/verificarDominio/removerDominio — Cloudflare for
// SaaS, recurso Custom Hostnames da zona sitemob.app). Ao contrário do
// esquema antigo (Hosting REST API, vários IPs de registro A por
// domínio), agora é sempre o mesmo CNAME fixo (cnameTarget) pra
// qualquer corretor. broker.customDomain/customDomainStatus
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
const statusSanfona   = $('dmStatusSanfona');
const statusToggle    = $('dmStatusToggle');
const dominioTituloEl = $('dmDominioTitulo');
const statusBadgeEl   = $('dmStatusBadge');
const statusExplicEl  = $('dmStatusExplicacao');
const dnsWrap         = $('dmDns');
const dnsHostEl       = $('dmDnsHost');
const dnsHostHintEl   = $('dmDnsHostHint');
const dnsValorEl      = $('dmDnsValor');
const diagEl          = $('dmDiag');
const statusMsg       = $('dmStatusMsg');
const verificarBtn    = $('dmVerificarBtn');
const removerBtn      = $('dmRemoverBtn');

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

// Painéis de DNS quase sempre pedem no campo "Nome/Host" só o rótulo do
// subdomínio ("catalogo"), completando o resto sozinhos — colar o domínio
// inteiro ali gera catalogo.suaempresa.com.py.suaempresa.com.py, que não
// resolve. Como não dá pra carregar a Public Suffix List inteira no
// client, basta reconhecer os sufixos de 2 níveis que aparecem no
// mercado que a gente atende (PY, e os vizinhos mais comuns).
const SUFIXOS_COMPOSTOS = [
  'com.py', 'net.py', 'org.py', 'edu.py', 'gov.py',
  'com.br', 'net.br', 'org.br',
  'com.ar', 'com.uy', 'com.bo', 'com.co', 'com.mx', 'co.uk',
];

function partesDominio(dominio) {
  const labels = dominio.split('.');
  const raizLen = SUFIXOS_COMPOSTOS.includes(labels.slice(-2).join('.')) ? 3 : 2;
  if (labels.length <= raizLen) return { host: '@', raiz: dominio, apex: true };
  return {
    host: labels.slice(0, labels.length - raizLen).join('.'),
    raiz: labels.slice(-raizLen).join('.'),
    apex: false,
  };
}

// ── Sanfona do bloco de status ──────────────────────────────────
// Domínio ativo = nada a fazer aqui: as instruções de DNS, o
// diagnóstico e os botões são material de quem ainda está configurando.
// Então ela nasce recolhida nesse caso (sobram o endereço do site, logo
// acima, e o selo "Ativo") e nasce aberta enquanto o status for
// pendente, que é exatamente quando o conteúdo lá dentro importa.
function definirSanfona(aberta) {
  statusSanfona.dataset.aberta = String(aberta);
  statusToggle.setAttribute('aria-expanded', String(aberta));
  statusSec.classList.toggle('dm-sec--fechada', !aberta);
  // overflow:hidden esconde, mas não tira do Tab: sem o inert, quem
  // navega por teclado cairia nos botões "Copiar"/"Remover" dentro de um
  // painel de altura zero, sem ver onde está o foco.
  statusSanfona.querySelector('.dm-sanfona__inner').inert = !aberta;
}

statusToggle.addEventListener('click', () => {
  definirSanfona(statusSanfona.dataset.aberta !== 'true');
});

// renderConectado roda várias vezes na mesma visita (cache do Firestore,
// depois a resposta real da function, depois cada "Verificar novamente")
// e não pode fechar na cara de quem acabou de abrir a sanfona na mão. O
// padrão só é reaplicado quando o STATUS muda — aí a tela tem assunto
// novo e recolher/expandir volta a ser informação, não interrupção.
let statusRenderizado = null;

function renderConectado(resumo) {
  formSec.hidden = true;
  statusSec.hidden = false;

  if (resumo.status !== statusRenderizado) {
    definirSanfona(resumo.status !== 'active');
    statusRenderizado = resumo.status;
  }

  dominioTituloEl.textContent = resumo.dominio;
  const sit = SITUACAO[resumo.status] || SITUACAO.requested;
  statusBadgeEl.textContent = sit.texto;
  statusBadgeEl.className = 'dm-status-badge dm-status-badge--' + sit.badge;
  statusExplicEl.textContent = sit.explicacao;

  const { host, raiz, apex } = partesDominio(resumo.dominio);
  dnsWrap.hidden = false;
  dnsHostEl.textContent = host;
  dnsValorEl.textContent = resumo.cnameTarget;
  dnsHostHintEl.textContent = apex
    ? `Você conectou o domínio raiz. A maioria dos provedores não aceita CNAME na raiz — se o seu não aceitar, use um subdomínio (ex.: catalogo.${raiz}) ou procure a opção "ALIAS"/"ANAME"/"CNAME flattening".`
    : `A maioria dos painéis completa o domínio sozinha, então basta "${host}". Se o seu pedir o nome inteiro, use "${resumo.dominio}" — nunca as duas coisas juntas.`;
}

function renderDesconectado() {
  formSec.hidden = false;
  statusSec.hidden = true;
  diagEl.hidden = true;
  dominioInput.value = '';
  // Zera o padrão da sanfona: se o corretor conectar outro domínio na
  // mesma visita, ela precisa abrir de novo no status pendente.
  statusRenderizado = null;
}

// Copiar host/valor — sem isso o corretor tem que selecionar texto
// monoespaçado na mão no celular, que era metade do problema.
document.querySelectorAll('[data-copiar]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText($(btn.dataset.copiar).textContent);
      btn.textContent = 'Copiado!';
    } catch {
      btn.textContent = 'Copie manualmente';
    }
    setTimeout(() => { btn.textContent = original; }, 1800);
  });
});

/* ── Diagnóstico de DNS visto de fora ─────────────────────────
   A function verificarDominio() só devolve o que a Cloudflare acha do
   Custom Hostname ("requested"/"configuring"), o que na prática vira
   "Aguardando DNS" tanto pra quem ainda não mexeu no DNS quanto pra quem
   mexeu e errou — e o corretor fica sem saber qual dos dois é. Aqui a
   própria página consulta um resolver público (DNS-over-HTTPS do
   1.1.1.1) e diz exatamente o que está no ar agora. É só diagnóstico:
   quem decide o status de verdade continua sendo a function. */
const DOH = 'https://cloudflare-dns.com/dns-query';

async function consultarDns(nome, tipo) {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(nome)}&type=${tipo}`, {
    headers: { accept: 'application/dns-json' },
  });
  if (!res.ok) throw new Error('DoH ' + res.status);
  return res.json();
}

async function diagnosticarDns(dominio, alvo) {
  let r;
  try {
    r = await consultarDns(dominio, 'CNAME');
  } catch {
    return null; // resolver fora do ar/bloqueado — melhor não dizer nada
  }

  const cnames = (r.Answer || [])
    .filter((a) => a.type === 5)
    .map((a) => String(a.data).replace(/\.$/, '').toLowerCase());

  if (cnames.includes(alvo)) {
    // Nessa janela (CNAME no ar, Custom Hostname ainda não ativado) o
    // domínio pode responder "Error 522" no navegador por alguns
    // minutos — ver cloudflare-worker.js. É esperado, e sem esse aviso
    // o corretor acha que configurou errado e mexe no DNS de novo.
    return { tipo: 'ok', texto: `CNAME encontrado e apontando para ${alvo} — o DNS está correto. Falta só a ativação do certificado. Enquanto isso, é normal o endereço abrir com erro por alguns minutos; não mexa mais no DNS.` };
  }
  if (cnames.length) {
    return { tipo: 'erro', texto: `O CNAME existe, mas está apontando para "${cnames[0]}" em vez de "${alvo}". Corrija o valor do registro no seu provedor.` };
  }

  const a = await consultarDns(dominio, 'A').catch(() => null);
  const temA = (a?.Answer || []).some((x) => x.type === 1);
  if (temA) {
    return { tipo: 'erro', texto: `"${dominio}" está resolvendo por um registro A (IP fixo), não pelo CNAME. Apague esse registro A e crie o CNAME acima — os dois não podem existir com o mesmo nome. Se o domínio está na Cloudflare, verifique também se o proxy (nuvem laranja) está desligado.` };
  }

  return { tipo: 'erro', texto: `Nenhum registro DNS foi encontrado para "${dominio}" — para o resto do mundo esse endereço ainda não existe. Confira se o registro foi realmente salvo no painel do seu provedor e se o campo "Nome/Host" está exatamente como indicado acima.` };
}

async function mostrarDiagnostico(dominio, alvo) {
  diagEl.hidden = false;
  diagEl.className = 'dm-diag dm-diag--info';
  diagEl.textContent = 'Consultando o DNS público...';

  const d = await diagnosticarDns(dominio, alvo);
  if (!d) { diagEl.hidden = true; return; }

  diagEl.className = 'dm-diag dm-diag--' + (d.tipo === 'ok' ? 'ok' : 'erro');
  diagEl.textContent = d.texto;
}

function atualizarUrlAtual() {
  const ativo = broker?.customDomain && broker?.customDomainStatus === 'active';
  const url = ativo ? `https://${broker.customDomain}` : `https://${tenantId}.sitemob.app`;
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
    mostrarDiagnostico(data.dominio, data.cnameTarget);
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
    await mostrarDiagnostico(data.dominio, data.cnameTarget);
  } catch (err) {
    mostrarMsg(statusMsg, err.message || 'Não foi possível verificar agora.', true);
  } finally {
    verificarBtn.disabled = false;
  }
});

removerBtn.addEventListener('click', async () => {
  if (!confirm(`Remover o domínio "${broker.customDomain}"? Seu catálogo volta a ficar disponível só em ${tenantId}.sitemob.app.`)) return;

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
      cnameTarget: 'tenants.sitemob.app',
    });
    mostrarDiagnostico(broker.customDomain, 'tenants.sitemob.app');
    // busca o status real (o cache do Firestore não tem status atualizado)
    verificarDominioFn().then(({ data }) => {
      broker.customDomainStatus = data.status;
      renderConectado(data);
      atualizarUrlAtual();
    }).catch(() => {}); // se falhar, fica com o que já tinha em cache
  } else {
    renderDesconectado();
  }
});
