// ════════════════════════════════════════════════
// shell.js — sidebar + topbar compartilhados por toda página pós-
// login. Também centraliza o auth-gate (onAuthChange → tenantId →
// broker) que antes estava duplicado em painel.js/admin-imoveis.js/
// planos.js. Cada página chama initShell({active, title}) e recebe
// de volta { user, tenantId, broker } pra seguir com sua própria
// lógica de conteúdo.
// ════════════════════════════════════════════════
import { logout, onAuthChange } from './firebase.js';
import { tenantIdAtual, buscarBroker, limiteEfetivo } from './tenant.js';

const ICONS = {
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  imoveis: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  site: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z"/></svg>',
  leads: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  dominio: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  plano: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  hamburger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
};

// `primary: true` marca os itens que também aparecem na bottombar do
// mobile (só os 4 que já têm UI de verdade — Leads/Domínio são stub
// "Em breve", não merecem espaço fixo permanente na tela).
const NAV = [
  { key: 'dashboard', href: 'painel.html',              label: 'Dashboard',      icon: ICONS.dashboard, primary: true },
  { key: 'imoveis',   href: 'admin.html',                label: 'Meus Imóveis',   icon: ICONS.imoveis,   primary: true },
  { key: 'site',      href: 'meu-site.html',              label: 'Meu Site',       icon: ICONS.site,      primary: true },
  { key: 'leads',     href: 'em-breve.html?f=leads',     label: 'Leads',          icon: ICONS.leads,   soon: true },
  { key: 'dominio',   href: 'em-breve.html?f=dominio',   label: 'Domínio',        icon: ICONS.dominio, soon: true },
  { key: 'plano',     href: 'planos.html',                label: 'Plano',          icon: ICONS.plano,      primary: true },
];

// Changelog do produto — mostrado no card "Novidades" do rodapé da
// sidebar. Adicionar um item no topo a cada mudança relevante pro
// usuário final (não é changelog técnico interno).
const UPDATES = [
  { date: '2026-08-07', title: 'Meu Site', desc: 'Configure seu WhatsApp e publique o catálogo público dos seus imóveis.' },
  { date: '2026-08-07', title: 'Painel reorganizado', desc: 'Menu lateral novo com todas as áreas do sistema, mais fácil de navegar.' },
  { date: '2026-08-07', title: 'Cadastro mais confiável', desc: 'Corrigido um caso raro que podia travar a criação de conta.' },
  { date: '2026-08-06', title: 'Gerenciador de imóveis', desc: 'Cadastre, edite e adicione fotos aos seus imóveis direto do painel.' },
];
const UPDATES_SEEN_KEY = 'pa-updates-seen';

const initials = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function avatarHTML(user, size) {
  const cls = size === 'sm' ? 'admin-avatar admin-avatar--sm' : 'admin-avatar';
  if (user?.photoURL) return `<span class="${cls}"><img src="${user.photoURL}" alt="" referrerpolicy="no-referrer"></span>`;
  return `<span class="${cls}">${initials(user?.displayName || user?.email)}</span>`;
}

function renderSidebar(active) {
  const navHTML = NAV.map(item => `
    <a class="admin-nav__btn${item.key === active ? ' active' : ''}${item.soon ? ' admin-nav__btn--soon' : ''}" href="${item.href}">
      <span class="admin-nav__btn-main">
        <span class="admin-nav__icon" aria-hidden="true">${item.icon}</span>
        <span class="admin-nav__label">${item.label}</span>
      </span>
      ${item.soon ? '<span class="admin-nav__soon-tag">Em breve</span>' : ''}
    </a>`).join('');

  return `
    <aside class="admin-sidebar">
      <div class="admin-sidebar__logo">Inmobly<span>Painel</span></div>
      <nav class="admin-nav">${navHTML}</nav>
      <div class="admin-sidebar__foot">
        <div class="admin-sidebar__updates" id="shellUpdates">
          <button type="button" class="admin-sidebar__updates-btn" id="shellUpdatesBtn">
            <span class="admin-sidebar__updates-dot" id="shellUpdatesDot" hidden></span>
            <span>Novidades</span>
          </button>
          <div class="admin-sidebar__updates-panel" id="shellUpdatesPanel" hidden>
            <h4>Novidades</h4>
            ${UPDATES.map(u => `
              <div class="admin-update-item">
                <p class="admin-update-item__date">${new Date(u.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                <p class="admin-update-item__title">${u.title}</p>
                <p class="admin-update-item__desc">${u.desc}</p>
              </div>`).join('')}
          </div>
        </div>
        <div class="admin-sidebar__profile">
          <span id="shellSidebarAvatarWrap">${avatarHTML(null, 'md')}</span>
          <div class="admin-sidebar__profile-info">
            <p class="admin-sidebar__profile-name" id="shellBrokerName">—</p>
            <p class="admin-sidebar__profile-plan" id="shellBrokerPlan">—</p>
            <a href="planos.html" class="admin-sidebar__assinar" id="shellAssinarLink" hidden>
              <span id="shellAssinarTexto">Assinar</span><span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
        <div class="admin-sidebar__usage">
          <div class="admin-sidebar__usage-row"><span id="shellUsageLabel">—</span></div>
          <div class="admin-sidebar__usage-bar"><div class="admin-sidebar__usage-fill" id="shellUsageFill" style="width:0%"></div></div>
        </div>
      </div>
    </aside>`;
}

function renderTopbar(title) {
  return `
    <header class="admin-topbar">
      <div class="admin-topbar__left">
        <button type="button" class="admin-topbar__hamburger" id="shellHamburgerBtn" aria-label="Abrir menu" aria-expanded="false">
          ${ICONS.hamburger}
        </button>
        <h1 class="admin-topbar__title">${title}</h1>
      </div>
      <div class="admin-user-menu">
        <button class="admin-topbar__user" id="shellUserBtn" aria-haspopup="true" aria-expanded="false" aria-label="Menu da conta">
          <span id="shellTopAvatarWrap">${avatarHTML(null, 'sm')}</span>
          ${ICONS.chevron.replace('width="14" height="14"', 'width="14" height="14" class="admin-topbar__chevron"')}
        </button>
        <div class="admin-user-menu__panel" id="shellUserPanel" hidden>
          <div class="admin-user-menu__head">
            <p id="shellUserName">—</p>
            <p id="shellUserEmail">—</p>
          </div>
          <a href="em-breve.html?f=perfil" class="admin-user-menu__item">Meu perfil</a>
          <a href="em-breve.html?f=configuracoes" class="admin-user-menu__item">Configurações</a>
          <button type="button" class="admin-user-menu__item admin-user-menu__item--danger" id="shellLogoutBtn">Sair</button>
        </div>
      </div>
    </header>`;
}

// Barra fixa no rodapé, só mobile — apenas os itens `primary`. O menu
// completo (com Leads/Domínio e o rodapé de perfil/plano) mora no
// drawer da sidebar, aberto pelo hambúrguer da topbar.
function renderBottomBar(active) {
  const itens = NAV.filter(item => item.primary).map(item => `
    <a class="admin-bottombar__btn${item.key === active ? ' active' : ''}" href="${item.href}" aria-label="${item.label}">
      ${item.icon}
    </a>`).join('');
  return `<nav class="admin-bottombar" aria-label="Navegação principal">${itens}</nav>`;
}

function renderDrawerBackdrop() {
  return `<div class="admin-drawer-backdrop" id="shellDrawerBackdrop"></div>`;
}

function wireDrawer() {
  const hamburgerBtn = document.getElementById('shellHamburgerBtn');
  const sidebar = document.querySelector('.admin-sidebar');
  const backdrop = document.getElementById('shellDrawerBackdrop');
  if (!hamburgerBtn || !sidebar || !backdrop) return;

  function abrir() {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function fechar() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', () => {
    sidebar.classList.contains('is-open') ? fechar() : abrir();
  });
  backdrop.addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
}

function wireUpdatesCard() {
  const btn = document.getElementById('shellUpdatesBtn');
  const panel = document.getElementById('shellUpdatesPanel');
  const dot = document.getElementById('shellUpdatesDot');
  if (!btn || !panel) return;

  const seen = localStorage.getItem(UPDATES_SEEN_KEY);
  const latest = UPDATES[0]?.date;
  if (latest && seen !== latest) dot.hidden = false;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrindo = panel.hidden;
    panel.hidden = !panel.hidden;
    if (abrindo && latest) {
      localStorage.setItem(UPDATES_SEEN_KEY, latest);
      dot.hidden = true;
    }
  });
  document.addEventListener('click', () => { panel.hidden = true; });
  panel.addEventListener('click', (e) => e.stopPropagation());
}

function wireUserMenu() {
  const btn = document.getElementById('shellUserBtn');
  const panel = document.getElementById('shellUserPanel');
  const logoutBtn = document.getElementById('shellLogoutBtn');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrindo = panel.hidden;
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(abrindo));
  });
  document.addEventListener('click', () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  panel.addEventListener('click', (e) => e.stopPropagation());

  logoutBtn?.addEventListener('click', () => logout().then(() => location.href = 'login.html'));
}

function preencherPerfil(user, broker, tenantId) {
  document.getElementById('shellTopAvatarWrap').innerHTML = avatarHTML(user, 'sm');
  document.getElementById('shellSidebarAvatarWrap').innerHTML = avatarHTML(user, 'md');
  document.getElementById('shellUserName').textContent = user.displayName || broker?.name || 'Minha conta';
  document.getElementById('shellUserEmail').textContent = user.email || '';

  document.getElementById('shellBrokerName').textContent = broker?.name || tenantId;
  const planoLabel = broker ? `${broker.plan || 'trial'} · ${broker.status || 'trialing'}` : '—';
  document.getElementById('shellBrokerPlan').textContent = planoLabel;

  // CTA discreto — some quando já é pagante (status active), aparece
  // com texto diferente conforme a urgência do motivo.
  const assinarLink = document.getElementById('shellAssinarLink');
  const assinarTexto = document.getElementById('shellAssinarTexto');
  const textoPorStatus = { past_due: 'Regularizar', canceled: 'Reativar' };
  assinarTexto.textContent = textoPorStatus[broker?.status] || 'Assinar';
  assinarLink.hidden = broker?.status === 'active';

  atualizarUso(broker);
}

// Separado de preencherPerfil() pra dar pra chamar de novo depois de
// uma mutação na mesma página (ex.: admin-imoveis.js criando/excluindo
// um imóvel) sem precisar recarregar — senão a barra só atualizava no
// próximo carregamento da página, mesmo o Firestore já tendo o número
// certo.
export function atualizarUso(broker) {
  const usados = broker?.usage?.imoveisCount ?? 0;
  const limite = broker ? limiteEfetivo(broker) : null;
  const limiteLabel = Number.isFinite(limite) ? limite : '∞';
  const label = document.getElementById('shellUsageLabel');
  const fill = document.getElementById('shellUsageFill');
  if (!label || !fill) return; // sidebar pode não estar montada ainda
  label.textContent = `${usados} de ${limiteLabel} imóveis`;
  if (Number.isFinite(limite) && limite > 0) {
    const pct = Math.min(100, Math.round((usados / limite) * 100));
    fill.style.width = pct + '%';
    fill.classList.toggle('is-full', pct >= 100);
  } else {
    fill.style.width = '4%'; // ilimitado — trilho quase vazio, só de referência visual
  }
}

/**
 * Monta a sidebar/topbar e resolve o auth-gate. Espera que a página
 * já tenha `<div id="shell-sidebar-mount"></div>` dentro de
 * `.admin-dashboard` e `<div id="shell-topbar-mount"></div>` dentro
 * de `.admin-content`, antes do `<main class="admin-main">`.
 * Redireciona e nunca resolve se o usuário não estiver logado / não
 * tiver tenant — igual ao que cada página fazia sozinha antes.
 */
export function initShell({ active, title }) {
  const sidebarMount = document.getElementById('shell-sidebar-mount');
  const topbarMount = document.getElementById('shell-topbar-mount');
  if (sidebarMount) sidebarMount.outerHTML = renderSidebar(active);
  if (topbarMount) topbarMount.outerHTML = renderTopbar(title);

  // Bottombar + backdrop do drawer — só existem/aparecem em mobile
  // (ver @media em shell.css), mas ficam sempre no DOM.
  document.body.insertAdjacentHTML('beforeend', renderBottomBar(active) + renderDrawerBackdrop());

  wireUpdatesCard();
  wireUserMenu();
  wireDrawer();

  return new Promise((resolve) => {
    onAuthChange(async (user) => {
      if (!user) { location.href = 'login.html'; return; }

      const tenantId = await tenantIdAtual();
      if (!tenantId) { location.href = 'criar-conta.html'; return; }

      const broker = await buscarBroker(tenantId);
      if (!broker) { location.href = 'criar-conta.html'; return; }

      preencherPerfil(user, broker, tenantId);
      resolve({ user, tenantId, broker });
    });
  });
}
