// ════════════════════════════════════════════════
// site/js/emprendimiento.js — página pública de UMA Página de
// Empreendimento (brokers/{tenantId}/paginas/{id}), acessada via
// emprendimiento.html?id=<paginaId> no domínio/site do tenant (mesma
// resolução de tenant de imoveis.js — hostname *.web.app, meta
// pa-tenant gravada por publicarSite.js, ou ?t= pra testar). Lê o doc
// direto do Firestore (leitura pública já liberada em firestore.rules)
// e só mostra conteúdo se `publicada === true` — rascunho não publicado
// cai no mesmo estado "indisponível" de um tenant/slug inexistente.
// ════════════════════════════════════════════════
import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { tenantIdAtual, carregarPerfilPublico } from './public-tenant.js';
import { aplicarAccent } from './cores.js';

const esc = (s) => String(s || '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUSD = (v) => 'US$ ' + Number(v).toLocaleString('en-US');

const IDIOMAS = {
  es: {
    pronto: 'Listo', construcao: 'En construcción', planta: 'En planta',
    desde: 'Desde', consulta: 'A consultar',
    unidades: (n) => `${n} unidad${n === 1 ? '' : 'es'} disponible${n === 1 ? '' : 's'}`,
    entrega: (t) => `Entrega: ${t}`,
    sobre: 'Sobre el emprendimiento',
    comodidades: 'Comodidades',
    tour: 'Ver tour virtual',
    cta: 'Hablar por WhatsApp',
    volver: '← Volver al catálogo',
    wa: (nome) => `¡Hola! Me interesa el emprendimiento "${nome}", ¿me podés dar más información?`,
  },
  pt: {
    pronto: 'Pronto', construcao: 'Em construção', planta: 'Na planta',
    desde: 'A partir de', consulta: 'Sob consulta',
    unidades: (n) => `${n} unidade${n === 1 ? '' : 's'} dispon${n === 1 ? 'ível' : 'íveis'}`,
    entrega: (t) => `Entrega: ${t}`,
    sobre: 'Sobre o empreendimento',
    comodidades: 'Comodidades',
    tour: 'Ver tour virtual',
    cta: 'Falar no WhatsApp',
    volver: '← Voltar ao catálogo',
    wa: (nome) => `Olá! Tenho interesse no empreendimento "${nome}", pode me passar mais informações?`,
  },
  en: {
    pronto: 'Ready', construcao: 'Under construction', planta: 'Pre-construction',
    desde: 'From', consulta: 'Contact us',
    unidades: (n) => `${n} unit${n === 1 ? '' : 's'} available`,
    entrega: (t) => `Delivery: ${t}`,
    sobre: 'About this project',
    comodidades: 'Amenities',
    tour: 'View virtual tour',
    cta: 'Chat on WhatsApp',
    volver: '← Back to catalog',
    wa: (nome) => `Hi! I'm interested in "${nome}", could you share more details?`,
  },
};
let STR = IDIOMAS.es;

const COMODIDADE_LABEL = {
  piscina: 'Piscina', churrasqueira: 'Parrilla', academia: 'Gimnasio',
  mobiliado: 'Amoblado', ar: 'Aire acondicionado', varanda: 'Balcón',
  seguranca: 'Seguridad 24h', elevador: 'Ascensor', pets: 'Pet friendly',
  lavanderia: 'Lavandería', salao: 'Salón de fiestas', coworking: 'Coworking',
  jardim: 'Jardín', gerador: 'Generador', playground: 'Playground',
};
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

const carregandoEl   = document.getElementById('ep-carregando');
const conteudoEl     = document.getElementById('ep-conteudo');
const indisponivelEl = document.getElementById('ep-indisponivel');

function mostrarIndisponivel() {
  carregandoEl.hidden = true;
  conteudoEl.hidden = true;
  // display setado via JS, não fixo no HTML — mesmo motivo do bug já
  // corrigido em site/js/imoveis.js (inline style vence [hidden]).
  indisponivelEl.style.display = 'flex';
  indisponivelEl.hidden = false;
}
function mostrarConteudo() {
  carregandoEl.hidden = true;
  conteudoEl.hidden = false;
}

function aplicarPerfilBasico(p, tenantId) {
  STR = IDIOMAS[p?.language] || IDIOMAS.es;
  document.documentElement.lang = p?.language || 'es';
  aplicarAccent(p?.accentColor);

  const nome = p?.name || tenantId;
  const navLogoEl = document.getElementById('nav-logo');
  if (p?.logo) { navLogoEl.src = p.logo; navLogoEl.alt = nome; navLogoEl.hidden = false; }
  document.getElementById('nav-nome').textContent = nome;

  const waHref = p?.whatsapp ? `https://wa.me/${p.whatsapp}` : '#';
  document.getElementById('nav-whatsapp').href = waHref;
  document.getElementById('footer-whatsapp').href = waHref;
  document.getElementById('footer-nome').textContent = nome;
  document.getElementById('footer-copy').textContent = `© ${new Date().getFullYear()} ${nome}`;

  const emailEl = document.getElementById('footer-email');
  if (p?.email) { emailEl.href = `mailto:${p.email}`; emailEl.textContent = p.email; emailEl.hidden = false; }
  const instaEl = document.getElementById('footer-instagram');
  if (p?.instagramUrl) { instaEl.href = p.instagramUrl; instaEl.hidden = false; }
}

function aplicarPagina(pg, perfil) {
  const nomeCorretor = perfil?.name || '';
  document.title = pg.nome + (nomeCorretor ? ' — ' + nomeCorretor : '');
  document.getElementById('meta-description').setAttribute('content', pg.descricao || pg.nome);

  const capaEl = document.getElementById('emp-capa');
  if (pg.capa) { capaEl.src = pg.capa; capaEl.alt = pg.nome; capaEl.hidden = false; }

  const badgeEl = document.getElementById('emp-estagio-badge');
  if (pg.estagio && STR[pg.estagio]) {
    badgeEl.textContent = STR[pg.estagio];
    badgeEl.hidden = false;
  }

  document.getElementById('emp-nome').textContent = pg.nome;
  const loc = [pg.bairro, pg.cidade].filter(Boolean).join(', ');
  if (loc) {
    document.getElementById('emp-loc-texto').textContent = loc;
    document.getElementById('emp-loc').hidden = false;
  }

  const factsEl = document.getElementById('emp-facts');
  const facts = [];
  if (pg.unidadesDisponiveis) facts.push(STR.unidades(pg.unidadesDisponiveis));
  if (pg.previsaoEntrega) facts.push(STR.entrega(pg.previsaoEntrega));
  if (pg.endereco) facts.push(pg.endereco);
  if (facts.length) {
    factsEl.innerHTML = facts.map(f => `<span class="emp-fact">${esc(f)}</span>`).join('');
    factsEl.hidden = false;
  }

  if (pg.descricao) {
    document.getElementById('emp-descricao').textContent = pg.descricao;
    document.getElementById('emp-descricao-wrap').hidden = false;
  }

  const coms = pg.comodidades || [];
  if (coms.length) {
    document.getElementById('emp-comodidades').innerHTML = coms
      .map(c => `<li>${ICON_CHECK}${esc(COMODIDADE_LABEL[c] || c)}</li>`).join('');
    document.getElementById('emp-comodidades-wrap').hidden = false;
  }

  document.getElementById('emp-valor-label').textContent = STR.desde;
  document.getElementById('emp-valor').textContent = pg.valorDesde ? fmtUSD(pg.valorDesde) : STR.consulta;

  const waMsg = encodeURIComponent(STR.wa(pg.nome));
  const waHref = perfil?.whatsapp ? `https://wa.me/${perfil.whatsapp}?text=${waMsg}` : '#';
  const waBtn = document.getElementById('emp-whatsapp');
  waBtn.href = waHref;
  waBtn.textContent = STR.cta;

  if (pg.tourUrl) {
    const tourEl = document.getElementById('emp-tour');
    tourEl.href = pg.tourUrl;
    tourEl.textContent = STR.tour;
    tourEl.hidden = false;
  }

  document.getElementById('emp-sobre-titulo').textContent = STR.sobre;
  document.getElementById('emp-comodidades-titulo').textContent = STR.comodidades;
  document.getElementById('emp-voltar').textContent = STR.volver;
}

async function iniciar() {
  const tenantId = tenantIdAtual();
  const paginaId = new URLSearchParams(location.search).get('id');
  if (!tenantId || !paginaId) { mostrarIndisponivel(); return; }

  let pagina = null;
  try {
    const snap = await getDoc(doc(db, 'brokers', tenantId, 'paginas', paginaId));
    if (snap.exists()) pagina = { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error('Erro ao carregar página de empreendimento:', e);
  }
  if (!pagina || pagina.publicada !== true) { mostrarIndisponivel(); return; }

  // Perfil do corretor é só pra identidade (navbar/rodapé/WhatsApp) —
  // pode vir null se o catálogo principal nunca foi publicado, o que
  // não deve bloquear uma Página de Empreendimento (produto pago à
  // parte, independente do plano de assinatura).
  const perfil = await carregarPerfilPublico(tenantId);
  aplicarPerfilBasico(perfil, tenantId);
  aplicarPagina(pagina, perfil);
  mostrarConteudo();
}

iniciar();
