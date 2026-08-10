// ════════════════════════════════════════════════
// shell.js — sidebar + topbar compartilhados por toda página pós-
// login. Também centraliza o auth-gate (onAuthChange → tenantId →
// broker) que antes estava duplicado em painel.js/admin-imoveis.js/
// planos.js. Cada página chama initShell({active, title}) e recebe
// de volta { user, tenantId, broker } pra seguir com sua própria
// lógica de conteúdo.
// ════════════════════════════════════════════════
import { auth, db, logout, onAuthChange } from './firebase.js';
import {
  tenantIdAtual, buscarBroker, limiteEfetivo, trialExpirado,
  diasRestantesTrial, diasDecorridosTrial, textoRestanteTrial,
} from './tenant.js';
import { initProductTour } from './product-tour.js';
import { ehDaEquipe } from './equipe.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

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
// e Empreendimentos fica só no drawer/sidebar completa por enquanto pra
// não disputar espaço fixo com os itens de uso diário).
//
// O rótulo é "Empreendimentos", não "Páginas": um testador leu "Páginas"
// como "as páginas do meu site", concluiu que era ali que o site ia pro
// ar e achou que estava no ar sem nunca ter passado por Meu Site.
const NAV = [
  { key: 'dashboard', href: 'painel.html',              label: 'Dashboard',      icon: ICONS.dashboard, primary: true },
  { key: 'imoveis',   href: 'admin.html',                label: 'Meus Imóveis',   icon: ICONS.imoveis,   primary: true },
  { key: 'site',      href: 'meu-site.html',              label: 'Meu Site',       icon: ICONS.site,      primary: true },
  { key: 'paginas',   href: 'paginas.html',               label: 'Empreendimentos', icon: ICONS.paginas },
  { key: 'dominio',   href: 'dominio.html',               label: 'Domínio',        icon: ICONS.dominio },
  { key: 'plano',     href: 'planos.html',                label: 'Plano',          icon: ICONS.plano,      primary: true },
  { key: 'indicacoes', href: 'indicacoes.html',            label: 'Indique e ganhe', icon: ICONS.indicacoes },
];

// Changelog do produto — mostrado no card "Novidades" do rodapé da
// sidebar. Adicionar um item no topo a cada mudança relevante pro
// usuário final (não é changelog técnico interno).
const UPDATES = [
  { date: '2026-08-09', title: 'Dados do perfil', desc: 'No menu da sua foto, em "Dados do perfil", agora dá pra preencher seu nome, telefone de contato, documento e cidade — é por esses dados que falamos com você sobre cobrança e suporte.' },
  { date: '2026-08-09', title: 'Você no controle da sua assinatura', desc: 'Na página Plano dá pra cancelar sozinho (o acesso continua até o fim do período já pago, e dá pra voltar atrás), trocar o cartão e baixar suas faturas.' },
  { date: '2026-08-09', title: 'Contador do teste grátis agora é regressivo', desc: 'O prazo no menu lateral desconta sozinho enquanto você usa o painel — e passa a contar em horas nos últimos dois dias, pra não ser surpresa quando acabar.' },
  { date: '2026-08-09', title: 'Ficou mais claro quando o site está no ar', desc: 'O menu avisa "Offline" enquanto seu catálogo não estiver publicado, e o Dashboard mostra o caminho pra publicar. A aba "Páginas" agora se chama "Empreendimentos" — o que muda é só o nome.' },
  { date: '2026-08-09', title: 'Indique e ganhe', desc: 'Indique outros corretores e acumule desconto na sua assinatura (até 50%). Agora dá pra aplicar o cupom de indicação na sua assinatura ativa com um clique, direto pelo painel.' },
  { date: '2026-08-08', title: 'Sitemob é o novo nome', desc: 'A plataforma mudou de nome — o sistema e seus dados continuam os mesmos, só a marca ficou nova.' },
  { date: '2026-08-08', title: 'Mais estabilidade no Meu Site', desc: 'Corrigido um caso em que a pré-visualização do site podia ficar carregando pra sempre, e um ajuste no tour de boas-vindas no celular.' },
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
    <a class="admin-nav__btn${item.key === active ? ' active' : ''}${item.soon ? ' admin-nav__btn--soon' : ''}${item.key === 'site' ? ' admin-nav__btn--tagged' : ''}" href="${item.href}" data-nav-key="${item.key}" data-tour="nav-desktop-${item.key}">
      <span class="admin-nav__btn-main">
        <span class="admin-nav__icon" aria-hidden="true">${item.icon}</span>
        <span class="admin-nav__label">${item.label}</span>
      </span>
      ${item.soon ? '<span class="admin-nav__soon-tag">Em breve</span>' : ''}
      ${item.key === 'site' ? '<span class="admin-nav__offline-tag" id="shellSiteOfflineTag" hidden>Offline</span>' : ''}
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
            <div class="admin-sidebar__updates-panel-head">
              <h4>Novidades</h4>
              <button type="button" class="admin-sidebar__updates-close" id="shellUpdatesCloseBtn" aria-label="Fechar novidades">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
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
          <a href="perfil.html" class="admin-user-menu__item">Dados do perfil</a>
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
      ${item.key === 'site' ? '<span class="admin-bottombar__offline-dot" id="shellSiteOfflineDot" hidden></span>' : ''}
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
  const closeBtn = document.getElementById('shellUpdatesCloseBtn');
  if (!btn || !panel) return;

  const seen = localStorage.getItem(UPDATES_SEEN_KEY);
  const latest = UPDATES[0]?.date;
  if (latest && seen !== latest) dot.hidden = false;

  // position:fixed (a sidebar tem overflow-y:auto e cortaria um
  // painel absolute que estoura a altura dela) — por isso calculamos
  // top/left aqui em vez de deixar só no CSS.
  function posicionar() {
    const r = btn.getBoundingClientRect();
    const espacoAcima = r.top - 16;
    panel.style.left = `${Math.round(r.left)}px`;
    panel.style.bottom = `${Math.round(window.innerHeight - r.top + 8)}px`;
    panel.style.maxHeight = `${Math.max(160, Math.round(espacoAcima))}px`;
  }

  function fechar() {
    panel.hidden = true;
    if (latest) {
      localStorage.setItem(UPDATES_SEEN_KEY, latest);
      dot.hidden = true;
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      posicionar();
      panel.hidden = false;
    } else {
      fechar();
    }
  });
  closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); fechar(); });
  document.addEventListener('click', () => { if (!panel.hidden) fechar(); });
  window.addEventListener('resize', () => { if (!panel.hidden) posicionar(); });
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

// "trial · trialing" não dizia nada pro corretor, e o contador de dias
// só existia em planos.html — página que quem não pensa em assinar
// nunca abre. Durante o teste o rótulo da sidebar vira o contador, que
// é o único lugar do painel visto todo dia.
// Exportado pra perfil.html mostrar o mesmo rótulo de plano do menu
// lateral — dois textos diferentes pro mesmo status seria o tipo de
// divergência que ninguém nota até um corretor perguntar qual dos dois
// está certo.
export function rotuloPlano(broker) {
  if (!broker) return '—';
  if (broker.status !== 'trialing') return `${broker.plan || 'trial'} · ${broker.status || 'trialing'}`;
  if (trialExpirado(broker)) return 'Teste grátis encerrado';

  const restante = textoRestanteTrial(broker);
  if (restante === null) return 'Teste grátis';
  return `Teste grátis · ${restante}`;
}

/* ── Relógio do trial ─────────────────────────────────────────
   O rótulo era calculado uma única vez, quando a página montava. Numa
   aba deixada aberta (o normal: o corretor volta ao painel horas
   depois) o número congelava no valor da montagem — de fora, um
   contador que "não anda". Agora um tick reescreve o rótulo a partir do
   MESMO broker em memória: trialEndsAt não muda, só o "agora" muda, então
   não custa leitura nenhuma no Firestore.

   Meio minuto porque a última hora é exibida em minutos; acima disso o
   texto simplesmente repete o mesmo valor, sem custo perceptível. */
const TICK_TRIAL_MS = 30 * 1000;
let brokerAtual = null;
let relogioTrial = null;

function tickTrial() {
  const alvo = document.getElementById('shellBrokerPlan');
  if (!alvo || !brokerAtual) return;
  alvo.textContent = rotuloPlano(brokerAtual);

  // O trial pode vencer com a aba aberta. Quando isso acontece, o
  // paywall precisa aparecer na hora — senão o corretor segue clicando
  // num painel que o servidor já está recusando, e o erro que ele vê é
  // "permission denied" em vez da tela que explica o que houve.
  if (trialExpirado(brokerAtual)) {
    pararRelogioTrial();
    if (paginaAtualLivreNoPaywall) return;
    montarPaywall(brokerAtual);
  }
}

function pararRelogioTrial() {
  if (relogioTrial) { clearInterval(relogioTrial); relogioTrial = null; }
}

function iniciarRelogioTrial() {
  pararRelogioTrial();
  if (brokerAtual?.status !== 'trialing' || trialExpirado(brokerAtual)) return;
  relogioTrial = setInterval(tickTrial, TICK_TRIAL_MS);
}

// Aba em segundo plano: o browser estrangula o setInterval (e o celular
// costuma congelar a página inteira). Voltar pra aba é justamente o
// momento em que o número velho estaria na cara do usuário — recalcula
// antes que ele leia.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tickTrial();
});

function preencherPerfil(user, broker, tenantId) {
  document.getElementById('shellTopAvatarWrap').innerHTML = avatarHTML(user, 'sm');
  document.getElementById('shellSidebarAvatarWrap').innerHTML = avatarHTML(user, 'md');
  // ownerName na frente do displayName do Google: é o nome que o
  // próprio corretor digitou em perfil.html, então ganha do que veio da
  // conta Google (que pode ser um apelido, ou o nome de outra pessoa da
  // equipe que criou a conta).
  document.getElementById('shellUserName').textContent = broker?.ownerName || user.displayName || broker?.name || 'Minha conta';
  document.getElementById('shellUserEmail').textContent = user.email || '';

  document.getElementById('shellBrokerName').textContent = broker?.name || tenantId;
  document.getElementById('shellBrokerPlan').textContent = rotuloPlano(broker);

  // CTA discreto — some quando já é pagante (status active), aparece
  // com texto diferente conforme a urgência do motivo.
  const assinarLink = document.getElementById('shellAssinarLink');
  const assinarTexto = document.getElementById('shellAssinarTexto');
  const textoPorStatus = { past_due: 'Regularizar', canceled: 'Reativar' };
  assinarTexto.textContent = trialExpirado(broker)
    ? 'Assinar com 50% OFF'
    : (textoPorStatus[broker?.status] || 'Assinar');
  assinarLink.hidden = broker?.status === 'active';

  atualizarUso(broker);
  atualizarStatusSite(broker);
  iniciarRelogioTrial();
}

// Selo "Offline" no item Meu Site, visível em TODAS as páginas enquanto
// o catálogo não estiver publicado. Mora no shell de propósito: um aviso
// dentro de meu-site.html só é visto por quem já entendeu que é ali que
// o site vai pro ar — e é justamente esse o entendimento que falta.
//
// Exportado (como atualizarUso) pra meu-site.js poder chamar logo depois
// de publicar/despublicar: com o router SPA a sidebar não remonta, então
// sem isso o selo só sumiria no próximo carregamento de página.
export function atualizarStatusSite(broker) {
  const offline = broker?.published !== true;
  const tag = document.getElementById('shellSiteOfflineTag');
  const dot = document.getElementById('shellSiteOfflineDot');
  if (tag) tag.hidden = !offline;
  if (dot) dot.hidden = !offline;
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
  'perfil.html':   'js/perfil.js',
  'em-breve.html': 'js/em-breve.js',
};

let navToken = 0;

// `cleanUrls: true` no hosting faz o Firebase redirecionar
// /meu-site.html → /meu-site, então o pathname REAL do documento quase
// nunca tem extensão — mas os links do menu e as chaves de
// PAGE_SCRIPTS têm. Normaliza pros dois lados baterem (sem isso, o
// popstate do botão "voltar" caía sempre no fallback de recarregar a
// página inteira).
function nomeDaPagina(pathname) {
  const nome = pathname.split('/').pop() || 'painel.html';
  return nome.includes('.') ? nome : `${nome}.html`;
}

// A página que carregou de verdade já trouxe seu <style> inline no
// <head>, só que sem marca de origem. Carimba agora pra o router não
// injetar uma segunda cópia quando o usuário sair e voltar pra ela.
document.head.querySelectorAll('style').forEach((s) => {
  if (!s.dataset.pageStyle) s.dataset.pageStyle = nomeDaPagina(location.pathname);
});

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

// Cada página do painel declara suas próprias folhas de estilo no
// <head> (admin.html/meu-site.html usam admin.css, planos.html e
// indicacoes.html usam planos.css, em-breve.html não usa nenhuma das
// duas) — mas o router só troca o <main>, então o <head> continua
// sendo o da PRIMEIRA página que carregou de verdade. Sem sincronizar,
// abrir Planos vindo do Dashboard (ou voltar pra Imóveis vindo de
// Planos) monta o HTML novo sem o CSS dele e a tela aparece crua. Como
// o usuário entra no painel por páginas diferentes conforme o dia
// (login manda pro painel, um link do e-mail manda pra planos, o
// histórico do browser restaura a última visitada), o sintoma parecia
// aleatório — "às vezes o CSS não carrega".
//
// Estratégia: ACUMULAR, nunca remover. As folhas específicas de página
// não compartilham nenhum seletor entre si, então deixar planos.css
// carregado enquanto se está em Imóveis é inofensivo — e evita que
// voltar pra uma página já visitada pisque sem estilo de novo.
function estilosDaPagina(doc) {
  return [...doc.querySelectorAll('link[rel="stylesheet"][href]')]
    // Resolve relativo ao documento atual (e não ao doc do DOMParser,
    // que não tem base URL própria e devolveria href quebrado).
    .map((l) => new URL(l.getAttribute('href'), document.baseURI).href);
}

// Nem todo CSS de página está num arquivo: meu-site.html, dominio.html
// e em-breve.html declaram o seu num <style> inline no <head>. Esse
// bloco não tem href pra deduplicar, então cada cópia injetada leva a
// página de origem no data-attribute — era exatamente o CSS que
// faltava ao abrir Meu Site ou Domínio pelo menu (e que voltava ao dar
// F5, porque aí o <head> vinha inteiro do servidor).
function sincronizarEstilosInline(doc, page) {
  const jaAplicados = [...document.head.querySelectorAll('style[data-page-style]')]
    .some((s) => s.dataset.pageStyle === page);
  if (jaAplicados) return;

  doc.head.querySelectorAll('style').forEach((origem) => {
    const style = document.createElement('style');
    style.dataset.pageStyle = page;
    style.textContent = origem.textContent;
    document.head.appendChild(style);
  });
}

function sincronizarEstilos(doc, page) {
  sincronizarEstilosInline(doc, page);

  const jaAplicados = new Set(estilosDaPagina(document));
  const novos = estilosDaPagina(doc).filter((href) => !jaAplicados.has(href));

  return Promise.all(novos.map((href) => new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // Resolve nos dois casos: um CSS que falhou não pode travar a
    // navegação — página meio torta ainda é melhor que página nenhuma.
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.appendChild(link);
  })));
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
  const page = nomeDaPagina(url.pathname);
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

  // Antes de injetar o markup: com o CSS da página nova já aplicado o
  // conteúdo nunca chega a aparecer cru nem por um frame.
  await sincronizarEstilos(doc, page);
  if (token !== navToken) return; // outra navegação passou na frente enquanto o CSS carregava

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

    const page = nomeDaPagina(url.pathname);
    if (!(page in PAGE_SCRIPTS)) return; // fora do shell (login, criar-conta...) — navegação normal

    // Já está nessa página: engole o clique em vez de remontar tudo
    // (compara normalizado, senão o /meu-site do cleanUrls nunca bate
    // com o meu-site.html do href e o menu recarregava a própria tela).
    if (page === nomeDaPagina(location.pathname) && url.search === location.search) { e.preventDefault(); return; }

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

/* ── Paywall de trial vencido ─────────────────────────────────
   Trial vencido tranca o PAINEL, não o catálogo: o site público do
   corretor continua no ar exatamente como estava (ver limiteEfetivo em
   tenant.js). O que ele perde é a capacidade de editar.

   Bloqueio de UI só: as regras do Firestore (firestore.rules,
   trialVencido()) e as functions de escrita (publicarSite,
   conectarDominio) recusam do lado do servidor mesmo se alguém pular
   esta tela pelo console.

   Planos fica DE FORA do bloqueio — é a saída. Trancar a página onde se
   assina seria trancar a porta e jogar a chave dentro. */
const PAGINA_LIVRE_NO_PAYWALL = 'plano';
const CUPOM_VITALICIO = '50OFF';

// Qual página o initShell mais recente montou — o relógio do trial
// precisa saber disso pra decidir se pode subir o paywall quando o
// prazo vence com a aba aberta (em Planos, nunca).
let paginaAtualLivreNoPaywall = false;

function paywallHTML(broker) {
  const nome = String(broker?.name || '').split(/\s+/)[0] || '';
  return `
  <div class="modal-backdrop open" id="shellPaywall" role="dialog" aria-modal="true" aria-labelledby="shellPaywallTitulo">
    <div class="modal shell-paywall">
      <h2 id="shellPaywallTitulo" class="shell-paywall__titulo">${nome ? nome + ', seu' : 'Seu'} teste grátis terminou</h2>
      <p class="shell-paywall__texto">
        <strong>Seu catálogo continua no ar</strong> — ninguém que acessar seu site vai notar nada.
        O que ficou bloqueado é o painel: pra cadastrar, editar ou publicar de novo, é só assinar.
      </p>

      <div class="shell-paywall__cupom">
        <div class="shell-paywall__cupom-info">
          <p class="shell-paywall__cupom-label">50% OFF vitalício</p>
          <p class="shell-paywall__cupom-codigo">${CUPOM_VITALICIO}</p>
        </div>
        <button type="button" class="btn btn--outline btn--sm" id="shellPaywallCopiar">Copiar</button>
      </div>

      <button type="button" class="btn btn--accent btn--md shell-paywall__cta" id="shellPaywallAssinar">Assinar agora com 50% OFF</button>
      <a href="planos.html" class="shell-paywall__link" id="shellPaywallPlanos">Ver todos os planos</a>

      <p id="shellPaywallMsg" class="imv-form-msg" role="alert" hidden></p>
      <button type="button" class="shell-paywall__sair" id="shellPaywallSair">Sair da conta</button>
    </div>
  </div>`;
}

function montarPaywall(broker) {
  if (document.getElementById('shellPaywall')) return; // já está na tela
  document.body.insertAdjacentHTML('beforeend', paywallHTML(broker));
  document.body.style.overflow = 'hidden';

  const msg = document.getElementById('shellPaywallMsg');

  document.getElementById('shellPaywallCopiar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(CUPOM_VITALICIO);
      btn.textContent = 'Copiado!';
    } catch {
      btn.textContent = 'Copie manualmente'; // o código já está visível na tela
    }
    setTimeout(() => { btn.textContent = original; }, 1800);
  });

  document.getElementById('shellPaywallAssinar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Abrindo checkout...';
    try {
      const functions = getFunctions(auth.app, 'southamerica-east1');
      const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');
      const { data } = await criarCheckoutSession({ priceLookupKey: 'sitemob_starter_monthly', promo: 'trialExpirado' });
      location.href = data.url;
    } catch (err) {
      msg.textContent = 'Não foi possível abrir o checkout: ' + err.message;
      msg.className = 'imv-form-msg imv-form-msg--erro';
      msg.hidden = false;
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  // Navegação normal (não o router SPA): o paywall precisa sair do DOM
  // e liberar o scroll do body, e planos.html monta o shell do zero.
  document.getElementById('shellPaywallPlanos').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    location.href = 'planos.html';
  });

  document.getElementById('shellPaywallSair')
    .addEventListener('click', () => logout().then(() => location.href = 'login.html'));
}

/* ── Lembrete de conversão durante o trial ────────────────────
   A cada 4 dias de teste o corretor vê uma vez o convite pra assinar
   com o 50OFF — os mesmos 50% vitalícios do paywall e dos popups de
   imóvel (ver PROMOS em functions/checkout.js). Num trial de 14 dias
   isso dá três aparições, nos dias 4, 8 e 12: a última cai já com o
   prazo curto o bastante pra a urgência ser real.

   Diferente do paywall, este é DISPENSÁVEL — nada está bloqueado
   ainda, e um modal que não fecha durante o teste faria o corretor
   fugir do painel em vez de assinar.

   O ciclo já mostrado fica no localStorage por tenant (mesmo padrão do
   "Novidades visto" e dos popups de admin-imoveis.js). Consequência
   assumida: é por navegador, então quem troca de máquina pode ver o
   mesmo ciclo duas vezes — preferível a gastar uma escrita no doc do
   broker a cada exibição. */
const PROMO_INTERVALO_DIAS = 4;
const promoVistaKey = (tenantId) => `sitemob-promo-trial-${tenantId}`;

function cicloPromoAtual(broker) {
  const decorridos = diasDecorridosTrial(broker);
  if (decorridos === null) return 0;
  return Math.floor(decorridos / PROMO_INTERVALO_DIAS);
}

function lerCicloPromoVisto(tenantId) {
  try {
    return Number(localStorage.getItem(promoVistaKey(tenantId))) || 0;
  } catch {
    return 0; // modo privado / quota — trata como "nunca viu"
  }
}

function marcarCicloPromoVisto(tenantId, ciclo) {
  try {
    localStorage.setItem(promoVistaKey(tenantId), String(ciclo));
  } catch {
    // Sem persistência o popup voltaria a cada carregamento de página,
    // que é pior do que não aparecer — por isso a exibição também é
    // travada em memória (promoMostradaNaSessao) logo abaixo.
  }
}

let promoMostradaNaSessao = false;

function verificarPromoTrial(broker, tenantId, active) {
  if (promoMostradaNaSessao) return;
  if (broker?.status !== 'trialing' || trialExpirado(broker)) return;
  if (active === PAGINA_LIVRE_NO_PAYWALL) return; // já está na página de assinar
  // Tour de boas-vindas na tela: dois cards disputando atenção no
  // primeiro acesso não converte ninguém — o tour termina primeiro.
  if (document.querySelector('.pa-tour-card')) return;
  if (document.querySelector('.modal-backdrop.open')) return;

  const ciclo = cicloPromoAtual(broker);
  if (ciclo < 1) return; // ainda nos 4 primeiros dias
  if (ciclo <= lerCicloPromoVisto(tenantId)) return;

  promoMostradaNaSessao = true;
  marcarCicloPromoVisto(tenantId, ciclo);
  montarPromoTrial(broker);
}

// Reusa o visual do paywall (.shell-paywall) de propósito: é o mesmo
// cartão de conversão, com o mesmo cupom. O que muda é o tom — aqui
// ainda não há nada bloqueado — e o botão de dispensar.
function promoTrialHTML(broker) {
  const nome = String(broker?.name || '').split(/\s+/)[0] || '';
  const restante = textoRestanteTrial(broker) || 'poucos dias';
  const dias = diasRestantesTrial(broker);
  return `
  <div class="modal-backdrop open" id="shellPromoTrial" role="dialog" aria-modal="true" aria-labelledby="shellPromoTitulo">
    <div class="modal shell-paywall shell-promo">
      <p class="shell-promo__prazo">Faltam ${restante} de teste grátis</p>
      <h2 id="shellPromoTitulo" class="shell-paywall__titulo">${nome ? nome + ', garanta' : 'Garanta'} 50% OFF vitalício</h2>
      <p class="shell-paywall__texto">
        ${dias !== null && dias <= PROMO_INTERVALO_DIAS
          ? 'Quando o teste acabar, o painel trava e você não consegue mais cadastrar nem editar imóveis.'
          : 'Assinando agora você não perde nada do que já montou — e trava o desconto pra sempre.'}
        O cupom <strong>${CUPOM_VITALICIO}</strong> dá 50% de desconto em todas as mensalidades, enquanto a assinatura durar.
      </p>

      <div class="shell-paywall__cupom">
        <div class="shell-paywall__cupom-info">
          <p class="shell-paywall__cupom-label">50% OFF vitalício</p>
          <p class="shell-paywall__cupom-codigo">${CUPOM_VITALICIO}</p>
        </div>
        <button type="button" class="btn btn--outline btn--sm" id="shellPromoCopiar">Copiar</button>
      </div>

      <button type="button" class="btn btn--accent btn--md shell-paywall__cta" id="shellPromoAssinar">Assinar agora com 50% OFF</button>
      <a href="planos.html" class="shell-paywall__link" id="shellPromoPlanos">Ver todos os planos</a>

      <p id="shellPromoMsg" class="imv-form-msg" role="alert" hidden></p>
      <button type="button" class="shell-promo__dispensar" id="shellPromoDispensar">Continuar no teste grátis</button>
    </div>
  </div>`;
}

function montarPromoTrial(broker) {
  if (document.getElementById('shellPromoTrial')) return;
  document.body.insertAdjacentHTML('beforeend', promoTrialHTML(broker));
  document.body.style.overflow = 'hidden';

  const modal = document.getElementById('shellPromoTrial');
  const msg = document.getElementById('shellPromoMsg');

  const fechar = () => {
    modal.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e) => { if (e.key === 'Escape') fechar(); };

  document.getElementById('shellPromoDispensar').addEventListener('click', fechar);
  modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
  document.addEventListener('keydown', onEsc);

  document.getElementById('shellPromoCopiar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(CUPOM_VITALICIO);
      btn.textContent = 'Copiado!';
    } catch {
      btn.textContent = 'Copie manualmente'; // o código já está visível na tela
    }
    setTimeout(() => { btn.textContent = original; }, 1800);
  });

  document.getElementById('shellPromoAssinar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Abrindo checkout...';
    try {
      const functions = getFunctions(auth.app, 'southamerica-east1');
      const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');
      const { data } = await criarCheckoutSession({ priceLookupKey: 'sitemob_starter_monthly', promo: 'trialEmAndamento' });
      location.href = data.url;
    } catch (err) {
      msg.textContent = 'Não foi possível abrir o checkout: ' + err.message;
      msg.className = 'imv-form-msg imv-form-msg--erro';
      msg.hidden = false;
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  // Fecha o modal antes de sair da página: o router SPA não recarrega o
  // documento, então sem isso o backdrop ficaria por cima de Planos.
  document.getElementById('shellPromoPlanos').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fechar();
    location.href = 'planos.html';
  });
}

// Sinal de analytics: quem está usando o painel e se é da casa.
//
// O GTM dispara o `page_view` lá no <head>, muito antes do Firebase
// Auth resolver — naquele instante não dá pra saber se quem abriu é
// cliente ou alguém da Punto Alto testando. Por isso o veredito fica
// gravado no localStorage e o bloco no <head> das páginas do app lê
// essa chave de forma SÍNCRONA no carregamento seguinte. O primeiro
// pageview de um navegador novo escapa; a regra de IP interno do GA4
// cobre esse caso. Ver docs/ANALYTICS-JORNADA.md.
//
// O push daqui não conserta o `page_view` que já saiu, mas classifica
// todo evento posterior — inclusive os `page_view` das rotas SPA, que
// só acontecem depois (navigateTo → pushState).
const CHAVE_SINAL_GA = 'sitemob_ga';

function marcarSinalAnalytics(user, tenantId) {
  // user_id é o tenantId, NUNCA o e-mail: mandar dado que identifica a
  // pessoa direto viola a política do Google e a LGPD, e derruba a
  // propriedade se o Google perceber. O tenantId é opaco pra eles e
  // casa com `brokers/{tenantId}` do nosso lado.
  const sinal = {
    traffic_type: ehDaEquipe(user.email) ? 'internal' : 'external',
    user_id: tenantId,
  };

  try {
    localStorage.setItem(CHAVE_SINAL_GA, JSON.stringify(sinal));
  } catch {
    // Modo privado / quota estourada. Analytics não é motivo pra
    // quebrar o painel — segue sem classificar.
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(sinal);
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

  paginaAtualLivreNoPaywall = active === PAGINA_LIVRE_NO_PAYWALL;

  return getAuthState().then(async ({ user, tenantId }) => {
    const broker = await buscarBroker(tenantId);
    if (!broker) { location.href = 'criar-conta.html'; return new Promise(() => {}); }

    // Guardado pro relógio do trial poder reescrever o rótulo sem
    // precisar reler o Firestore (ver tickTrial).
    brokerAtual = broker;

    preencherPerfil(user, broker, tenantId);
    marcarSinalAnalytics(user, tenantId);
    // Antes do paywall de propósito: saber que um trial vencido ainda
    // abre o painel é justamente o sinal de quem está a um empurrão de
    // assinar (a regra do Firestore libera lastActiveAt sozinho mesmo
    // com o trial vencido, só pra isso continuar funcionando).
    tocarLastActiveAt(tenantId, broker);

    if (trialExpirado(broker) && active !== PAGINA_LIVRE_NO_PAYWALL) {
      montarPaywall(broker);
      // Nunca resolve: o script da página não chega a rodar, então
      // nenhuma tela do painel monta atrás do backdrop. Mesmo padrão
      // do redirect de "broker não existe" logo acima.
      return new Promise(() => {});
    }

    initProductTour({ tenantId, active });
    // Depois do tour de propósito: verificarPromoTrial() checa se um
    // card do tour está na tela e se cala quando está.
    verificarPromoTrial(broker, tenantId, active);
    return { user, tenantId, broker };
  });
}
