/* ══════════════════════════════════════════════════════
   Inmobly — Painel interno da Punto Alto
   Lista todos os brokers (clientes do Inmobly), com filtro por
   status, estimativa de uso do plano Spark e detalhe com links
   diretos pro site/admin/Firebase Console/Stripe de cada um.

   ⚠️ TEAM_EMAILS precisa ficar em sincronia com a função isTeam()
   em control-plane/firestore.rules — mesma lista dos dois lados.
   ══════════════════════════════════════════════════════ */
import { db, loginWithGoogle, logoutAdmin, onAuthChange } from './firebase.js';
import { collection, getDocs, orderBy, query }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const TEAM_EMAILS = [
  'crmwhatspro@gmail.com',
  // adicionar outros e-mails da equipe Punto Alto aqui
];

// Tamanho médio estimado de um doc de imóvel com fotos (capa + galeria
// comprimidas), usado só pra dar uma noção de quanto falta pro teto de
// 1GiB do Firestore no plano Spark — não é medição real de uso.
const TAMANHO_MEDIO_IMOVEL_BYTES = 700 * 1024;
const TETO_FIRESTORE_BYTES       = 1024 * 1024 * 1024;

const $ = (id) => document.getElementById(id);

let brokers = [];
let filtroAtivo = 'all';
let brokerSelecionado = null;

// ── Auth ───────────────────────────────────────────────
$('btnLogin').addEventListener('click', async () => {
  $('gateMsg').textContent = '';
  try {
    await loginWithGoogle();
  } catch (e) {
    $('gateMsg').textContent = 'Erro ao entrar: ' + e.message;
  }
});
$('btnLogout').addEventListener('click', () => logoutAdmin());

onAuthChange(async (user) => {
  if (user && TEAM_EMAILS.includes(user.email)) {
    $('gate').classList.add('hidden');
    $('painel').classList.remove('hidden');
    $('userEmail').textContent = user.email;
    await carregarBrokers();
  } else {
    $('painel').classList.add('hidden');
    $('gate').classList.remove('hidden');
    if (user) {
      $('gateMsg').textContent = `"${user.email}" não tem acesso a este painel.`;
      await logoutAdmin();
    }
  }
});

// ── Carregar brokers ─────────────────────────────────────
async function carregarBrokers() {
  const snap = await getDocs(query(collection(db, 'brokers'), orderBy('name')));
  brokers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTabela();
}

// ── Derivações ────────────────────────────────────────────
function diasRestantesTrial(trialEndsAt) {
  if (!trialEndsAt) return null;
  const fim = trialEndsAt.toDate ? trialEndsAt.toDate() : new Date(trialEndsAt);
  const ms  = fim.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function passaNoFiltro(broker) {
  if (filtroAtivo === 'all') return true;
  if (filtroAtivo === 'trial-vencendo') {
    if (broker.status !== 'trialing') return false;
    const dias = diasRestantesTrial(broker.trialEndsAt);
    return dias !== null && dias <= 3;
  }
  return broker.status === filtroAtivo;
}

function estimativaStorage(broker) {
  const count = broker.usage?.imoveisCount || 0;
  const bytes = count * TAMANHO_MEDIO_IMOVEL_BYTES;
  const pct   = Math.min(100, Math.round((bytes / TETO_FIRESTORE_BYTES) * 100));
  return { bytes, pct };
}

// ── Render tabela ─────────────────────────────────────────
function renderTabela() {
  const corpo = $('brokersBody');
  const visiveis = brokers.filter(passaNoFiltro);

  $('emptyMsg').classList.toggle('hidden', visiveis.length > 0);
  corpo.innerHTML = visiveis.map(b => {
    const dias = diasRestantesTrial(b.trialEndsAt);
    const trialLabel = b.status === 'trialing'
      ? (dias === null ? '—' : (dias <= 0 ? 'venceu' : dias + ' dia(s)'))
      : '—';

    const limite = b.imoveisLimit ?? null;
    const usados  = b.usage?.imoveisCount ?? 0;
    const pctUso  = limite ? Math.min(100, Math.round((usados / limite) * 100)) : 0;
    const isOver  = limite ? usados >= limite : false;

    return `
      <tr data-id="${b.id}" class="${brokerSelecionado?.id === b.id ? 'is-selected' : ''}">
        <td>${b.name || b.id}<small>${b.id}</small></td>
        <td>${b.plan || '—'}</td>
        <td><span class="badge badge--${b.status}">${labelStatus(b.status)}</span></td>
        <td>${trialLabel}</td>
        <td>
          ${usados} / ${limite ?? '∞'}
          ${limite ? `<div class="usage-bar ${isOver ? 'is-over' : ''}"><div style="width:${pctUso}%"></div></div>` : ''}
        </td>
        <td>${b.domainIncluded ? (b.customDomainStatus === 'active' ? 'ativo' : b.customDomainStatus || 'pendente') : '—'}</td>
      </tr>`;
  }).join('');
}

function labelStatus(status) {
  return {
    trialing: 'Trial',
    active:   'Ativo',
    past_due: 'Inadimplente',
    canceled: 'Cancelado',
  }[status] || status || '—';
}

$('brokersBody').addEventListener('click', (e) => {
  const linha = e.target.closest('tr');
  if (!linha) return;
  const broker = brokers.find(b => b.id === linha.dataset.id);
  if (broker) selecionarBroker(broker);
});

$('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter');
  if (!btn) return;
  document.querySelectorAll('.filter').forEach(f => f.classList.remove('is-active'));
  btn.classList.add('is-active');
  filtroAtivo = btn.dataset.filter;
  renderTabela();
});

// ── Detalhe ───────────────────────────────────────────────
async function selecionarBroker(broker) {
  brokerSelecionado = broker;
  renderTabela();

  const est = estimativaStorage(broker);
  const siteUrl    = broker.siteUrl || `https://${broker.firebaseProjectId}.web.app`;
  const adminUrl    = siteUrl.replace(/\/$/, '') + '/admin';
  const consoleUrl = `https://console.firebase.google.com/project/${broker.firebaseProjectId}/overview`;
  const stripeUrl  = broker.stripeCustomerId
    ? `https://dashboard.stripe.com/customers/${broker.stripeCustomerId}`
    : null;

  let comprasHtml = '<p style="color:var(--muted); font-size:0.8rem;">Carregando...</p>';
  $('detail').innerHTML = montarDetalheHtml(broker, siteUrl, adminUrl, consoleUrl, stripeUrl, est, comprasHtml);

  // busca o histórico de produtos avulsos à parte, pra não travar o
  // primeiro render do detalhe
  try {
    const snap = await getDocs(collection(db, 'brokers', broker.id, 'purchases'));
    const compras = snap.docs.map(d => d.data());
    comprasHtml = compras.length
      ? compras.map(c => `
          <div class="purchase-item">
            <span>${c.product}</span>
            <span>${c.status} · $${c.amountUsd ?? '—'}</span>
          </div>`).join('')
      : '<p style="color:var(--muted); font-size:0.8rem;">Nenhum produto avulso comprado.</p>';
  } catch (e) {
    comprasHtml = '<p style="color:var(--muted); font-size:0.8rem;">Erro ao carregar compras.</p>';
  }
  $('detail').innerHTML = montarDetalheHtml(broker, siteUrl, adminUrl, consoleUrl, stripeUrl, est, comprasHtml);
}

function montarDetalheHtml(b, siteUrl, adminUrl, consoleUrl, stripeUrl, est, comprasHtml) {
  return `
    <h2>${b.name || b.id}</h2>
    <p class="detail__sub">${b.email || 'sem e-mail cadastrado'}</p>

    <dl>
      <dt>Plano</dt><dd>${b.plan || '—'} · <span class="badge badge--${b.status}">${labelStatus(b.status)}</span></dd>
      <dt>Imóveis</dt><dd>${b.usage?.imoveisCount ?? 0} de ${b.imoveisLimit ?? 'ilimitado'}</dd>
      <dt>Estimativa de armazenamento (Firestore, plano Spark)</dt>
      <dd>~${(est.bytes / (1024 * 1024)).toFixed(1)} MB de 1024 MB (${est.pct}%)<br>
        <small style="color:var(--muted);">estimativa por contagem de imóveis, não é medição real</small></dd>
      <dt>Assinatura Stripe</dt><dd>${b.stripeSubscriptionId || 'não sincronizado ainda'}</dd>
    </dl>

    <div class="links">
      <a href="${siteUrl}" target="_blank" rel="noopener">Ver site →</a>
      <a href="${adminUrl}" target="_blank" rel="noopener">Abrir /admin do broker →</a>
      <a href="${consoleUrl}" target="_blank" rel="noopener">Projeto no Firebase Console →</a>
      ${stripeUrl ? `<a href="${stripeUrl}" target="_blank" rel="noopener">Cliente no Stripe →</a>` : ''}
    </div>

    <div class="purchases">
      <h3>Produtos avulsos</h3>
      ${comprasHtml}
    </div>
  `;
}
