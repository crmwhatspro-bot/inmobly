// ════════════════════════════════════════════════
// shell.js — sidebar + topbar compartilhados por toda página pós-
// login. Também centraliza o auth-gate (onAuthChange → tenantId →
// broker) que antes estava duplicado em painel.js/admin-imoveis.js/
// planos.js. Cada página chama initShell({active, title}) e recebe
// de volta { user, tenantId, broker } pra seguir com sua própria
// lógica de conteúdo.
// ════════════════════════════════════════════════
import { db, logout, onAuthChange } from './firebase.js';
import { tenantIdAtual, buscarBroker, limiteEfetivo } from './tenant.js';
import { initProductTour } from './product-tour.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const ICONS = {
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  imoveis: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  site: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z"/></svg>',
  paginas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  dominio: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  plano: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  indicacoes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C9 2 12 7 12 7z"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  hamburger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
};

// `primary: true` marca os itens que também aparecem na bottombar do
// mobile (só os 4 que já têm UI de verdade — Domínio é stub "Em breve",
// e Páginas fica só no drawer/sidebar completa por enquanto pra não
// disputar espaço fixo com os itens de uso diário).
const NAV = [
  { key: 'dashboard', href: 'painel.html',              label: 'Dashboard',      icon: ICONS.dashboard, primary: true },
  { key: 'imoveis',   href: 'admin.html',                label: 'Meus Imóveis',   icon: ICONS.imoveis,   primary: true },
  { key: 'site',      href: 'meu-site.html',              label: 'Meu Site',       icon: ICONS.site,      primary: true },
  { key: 'paginas',   href: 'paginas.html',               label: 'Páginas',        icon: ICONS.paginas },
  { key: 'dominio',   href: 'dominio.html',               label: 'Domínio',        icon: ICONS.dominio },
  { key: 'plano',     href: 'planos.html',                label: 'Plano',          icon: ICONS.plano,      primary: true },
  { key: 'indicacoes', href: 'indicacoes.html',            label: 'Indique e ganhe', icon: ICONS.indicacoes },
];

// Changelog do produto — mostrado no card "Novidades" do rodapé da
// sidebar. Adicionar um item no topo a cada mudança relevante pro
// usuário final (não é changelog técnico interno).
const UPDATES = [
  { date: '2026-08-07', title: 'Domínio próprio', desc: 'Conecte seu domínio (ex.: catalogo.suaempresa.com.py) ao seu catálogo direto pelo painel.' },
  { date: '2026-08-07', title: 'Páginas de Empreendimento', desc: 'Compre e crie páginas institucionais para seus empreendimentos, com preço de lançamento.' },
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
    <a class="admin-nav__btn${item.key === active ? ' active' : ''}${item.soon ? ' admin-nav__btn--soon' : ''}" href="${item.href}" data-nav-key="${item.key}" data-tour="nav-desktop-${item.key}">
      <span class="admin-nav__btn-main">
        <span class="admin-nav__icon" aria-hidden="true">${item.icon}</span>
        <span class="admin-nav__label">${item.label}</span>
      </span>
      ${item.soon ? '<span class="admin-nav__soon-tag">Em breve</span>' : ''}
    </a>`).join('');

  return `
    <aside class="admin-sidebar">
      <div class="admin-sidebar__logo">Sitemob<span>Painel</span></div>
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
    <a class="admin-bottombar__btn${item.key === active ? ' active' : ''}" href="${item.href}" data-nav-key="${item.key}" aria-label="${item.label}" data-tour="nav-mobile-${item.key}">
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

// ── Navegação entre páginas do painel sem full reload ──────────
// Cada página continua sendo um HTML standalone (com seu próprio
// <script type="module">), mas os cliques em links internos são
// interceptados: buscamos a página via fetch, trocamos só o
// conteúdo de `<main class="admin-main">` e reexecutamos o script
// daquela página (com um query-param único, pra forçar o browser a
// tratá-lo como um módulo novo e rodar o top-level de novo) — sidebar,
// topbar e CSS ficam intactos na tela. Ver initShell() abaixo pra
// como isso se encaixa com a montagem/auth-gate únicos.
const PAGE_SCRIPTS = {
  'painel.html':   'js/painel.js',
  'admin.html':    'js/admin-imoveis.js',
  'meu-site.html': 'js/meu-site.js',
  'paginas.html':  'js/paginas.js',
  'dominio.html':  'js/dominio.js',
  'planos.html':   'js/planos.js',
  'indicacoes.html': 'js/indicacoes.js',
  'em-breve.html': 'js/em-breve.js',
};

let navToken = 0;

// Algumas páginas (admin.html, meu-site.html) têm markup fora de
// <main> de propósito — modal-backdrop cobrindo a tela inteira, não
// pode ficar preso no padding/max-width de .admin-main. Fica dentro
// de #page-extra (quando existe) só pra o router saber trocar isso
// junto do <main> ao navegar; páginas sem esse bloco (a maioria) não
// precisam do wrapper.
function swapPageExtra(doc) {
  document.getElementById('page-extra')?.remove();
  const fetched = doc.getElementById('page-extra');
  if (!fetched) return;
  const imported = document.importNode(fetched, true);
  document.querySelector('.admin-dashboard')?.insertAdjacentElement('afterend', imported);
}

function fecharChromeAberto() {
  document.querySelector('.admin-sidebar')?.classList.remove('is-open');
  document.getElementById('shellDrawerBackdrop')?.classList.remove('is-open');
  document.getElementById('shellHamburgerBtn')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  const userPanel = document.getElementById('shellUserPanel');
  if (userPanel) userPanel.hidden = true;
  const updatesPanel = document.getElementById('shellUpdatesPanel');
  if (updatesPanel) updatesPanel.hidden = true;
}

async function navigateTo(url, { push }) {
  const page = url.pathname.split('/').pop();
  const scriptSrc = PAGE_SCRIPTS[page];
  const main = document.querySelector('main.admin-main');
  if (!main || !scriptSrc) { location.href = url.href; return; }

  const token = ++navToken;
  main.classList.add('admin-main--loading');

  let html;
  try {
    const res = await fetch(url.pathname + url.search, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    html = await res.text();
  } catch {
    location.href = url.href; // fetch falhou (offline etc.) — navegação normal como fallback
    return;
  }
  if (token !== navToken) return; // uma navegação mais nova já começou

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const newMain = doc.querySelector('main.admin-main');
  if (!newMain) { location.href = url.href; return; }

  fecharChromeAberto();
  main.innerHTML = newMain.innerHTML;
  main.classList.remove('admin-main--loading');
  swapPageExtra(doc);
  document.title = doc.title;
  window.scrollTo(0, 0);
  if (push) history.pushState({}, '', url.pathname + url.search);

  // Reseta o AbortController ANTES de importar o script da página —
  // algumas páginas (admin-imoveis.js, meu-site.js) registram
  // listeners globais via pageSignal() no top-level do módulo, antes
  // até de chamar initShell(); se o reset acontecesse só dentro de
  // initShell() (chamado depois, no fim do script), ele abortaria o
  // signal na hora em que a própria página que acabou de montar
  // ainda estava usando. Resetando aqui, o controller já está
  // estável e correto pra qualquer código que rodar no import abaixo.
  resetNavController();

  // Resolve relativo ao documento (`document.baseURI`), igual um
  // `<script src="js/x.js">` faria — um specifier "js/x.js" cru não
  // resolve dentro de import(), que segue as regras de módulo ES
  // (relativo ao MÓDULO ATUAL, aqui shell.js, e só aceita specifiers
  // bare/relativos/absolutos, nunca um caminho tipo HTML). Query-param
  // único força o browser a executar o módulo de novo (um import() do
  // mesmo caminho reaproveitaria a instância já rodada e não repetiria
  // o top-level). Os imports estáticos desse módulo (shell.js,
  // firebase.js, tenant.js...) continuam resolvendo pra a mesma
  // instância de sempre — só o bootstrap da página roda de novo.
  const scriptUrl = new URL(scriptSrc, document.baseURI);
  scriptUrl.search = `spa=${Date.now()}`;
  await import(scriptUrl.href);
}

function initRouter() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;

    const page = url.pathname.split('/').pop();
    if (!(page in PAGE_SCRIPTS)) return; // fora do shell (login, criar-conta...) — navegação normal

    if (url.pathname === location.pathname && url.search === location.search) { e.preventDefault(); return; }

    e.preventDefault();
    navigateTo(url, { push: true });
  });

  window.addEventListener('popstate', () => navigateTo(new URL(location.href), { push: false }));
}

function setActiveNav(active) {
  document.querySelectorAll('[data-nav-key]').forEach((el) => {
    el.classList.toggle('active', el.dataset.navKey === active);
  });
}

function setTopbarTitle(title) {
  const el = document.querySelector('.admin-topbar__title');
  if (el) el.textContent = title;
}

let shellMounted = false;
let authPromise = null;
let navController = null;

// Listeners globais (document/window) que uma página registra fora do
// <main> — ex.: keydown de Escape pra fechar modal — devem usar esse
// signal em vez de ficar soltos, senão se acumulam a cada navegação
// SPA (o <main> é recriado e limpa seus próprios listeners sozinho,
// mas document/window não). Abortado a cada troca de página — ver
// resetNavController(), chamado pelo router antes de importar o
// script da próxima página.
export function pageSignal() {
  if (!navController) navController = new AbortController();
  return navController.signal;
}

function resetNavController() {
  if (navController) navController.abort();
  navController = new AbortController();
}

function getAuthState() {
  if (!authPromise) {
    authPromise = new Promise((resolve) => {
      onAuthChange(async (user) => {
        if (!user) { location.href = 'login.html'; return; }
        const tenantId = await tenantIdAtual();
        if (!tenantId) { location.href = 'criar-conta.html'; return; }
        resolve({ user, tenantId });
      });
    });
  }
  return authPromise;
}

/**
 * Monta a sidebar/topbar e resolve o auth-gate. Espera que a página
 * já tenha `<div id="shell-sidebar-mount"></div>` dentro de
 * `.admin-dashboard` e `<div id="shell-topbar-mount"></div>` dentro
 * de `.admin-content`, antes do `<main class="admin-main">`.
 * Redireciona e nunca resolve se o usuário não estiver logado / não
 * tiver tenant — igual ao que cada página fazia sozinha antes.
 *
 * Chamada em toda página (inclusive nas trocas via SPA, já que o
 * script de cada página roda de novo) — mas a montagem do chrome
 * (sidebar/topbar/drawer) e a inscrição no auth-gate só acontecem
 * uma vez por sessão; nas chamadas seguintes só atualiza o item
 * ativo do menu e o título da topbar. O AbortController de
 * pageSignal() já foi resetado pelo router antes desta chamada (ver
 * navigateTo()) — não mexer nele aqui de novo, senão listeners que a
 * própria página acabou de registrar no top-level do módulo (antes
 * de chamar initShell) seriam abortados na hora.
 */
// Sinal de vida do tenant — alimenta o "contas ativas nos últimos
// 7/30 dias" do painel interno (interno-metricas.html), que é o número
// que antecipa churn: `status` só vira 'canceled' quando a pessoa já
// desistiu, `lastActiveAt` mostra quem parou de aparecer meses antes.
//
// Escrita separada de `updatedAt` de propósito: aquele campo significa
// "o corretor editou alguma coisa", e carimbá-lo a cada abertura de
// página apagaria essa informação.
//
// Só grava se o carimbo atual já passou de 12h — sem isso seria uma
// escrita por page load, por usuário, pra uma métrica cuja
// granularidade é em DIAS. Doze horas em vez de 24 pra não depender de
// a pessoa abrir sempre no mesmo horário e acabar pulando um dia.
const INTERVALO_TOQUE_MS = 12 * 60 * 60 * 1000;
let lastActiveTocado = false;

function tocarLastActiveAt(tenantId, broker) {
  // initShell() roda de novo a cada navegação do router SPA, e o
  // buscarBroker() logo antes pode devolver o doc com lastActiveAt
  // ainda null (serverTimestamp só resolve quando o servidor confirma)
  // — sem esta trava, uma sequência rápida de cliques no menu viraria
  // uma escrita por clique. Uma vez por carregamento de página basta.
  if (lastActiveTocado) return;

  const ultimo = broker?.lastActiveAt?.toDate?.() ?? null;
  if (ultimo && Date.now() - ultimo.getTime() < INTERVALO_TOQUE_MS) return;
  lastActiveTocado = true;

  // Fire-and-forget: é telemetria interna, nunca pode atrasar nem
  // derrubar a montagem do painel de quem está usando o produto.
  updateDoc(doc(db, 'brokers', tenantId), { lastActiveAt: serverTimestamp() })
    .catch((err) => console.warn('[shell] não foi possível carimbar lastActiveAt:', err));
}

export function initShell({ active, title }) {
  if (!shellMounted) {
    shellMounted = true;
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
    initRouter();
  } else {
    setActiveNav(active);
    setTopbarTitle(title);
  }

  return getAuthState().then(async ({ user, tenantId }) => {
    const broker = await buscarBroker(tenantId);
    if (!broker) { location.href = 'criar-conta.html'; return new Promise(() => {}); }

    preencherPerfil(user, broker, tenantId);
    tocarLastActiveAt(tenantId, broker);
    initProductTour({ tenantId, active });
    return { user, tenantId, broker };
  });
}
