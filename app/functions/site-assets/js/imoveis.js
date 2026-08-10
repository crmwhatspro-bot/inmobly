// ════════════════════════════════════════════════
// site/js/imoveis.js — catálogo público (multi-tenant, versão
// enxuta). Adaptado de template/js/imoveis.js: paths viram
// brokers/{tenantId}/imoveis/..., o limite do plano vem da function
// perfilPublico em vez de plano.js, e os filtros avançados (preço,
// área, comodidades, estágio) ficam de fora por enquanto — só
// operação/tipo/cidade, essa última montada dinamicamente a partir
// das cidades que aparecem nos imóveis do corretor.
//
// Modo preview (?preview=1&t=slug): usado dentro de um <iframe> em
// meu-site.html pra mostrar o modelo da página antes mesmo de
// publicar. Nunca chama perfilPublico (que exige published:true) —
// recebe o perfil (rascunho ainda não salvo, ao vivo conforme o
// corretor digita) via postMessage do pai. Os imóveis são buscados
// direto do Firestore, igual ao modo normal (já são públicos de
// qualquer forma) — só cai pros 3 de exemplo fixos se o tenant ainda
// não tiver nenhum imóvel cadastrado.
// ════════════════════════════════════════════════
import { db } from './firebase.js';
import { collection, query, where, getDocs, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { tenantIdAtual, carregarPerfilPublico } from './public-tenant.js';
import { aplicarAccent } from './cores.js';
import { iniciarEventosContato } from './eventos.js';

const MODO_PREVIEW = new URLSearchParams(location.search).get('preview') === '1';

// Idioma escolhido em meu-site.html (brokers/{tenantId}.language) —
// todo texto visível da página, estático ou gerado por JS, vem daqui.
// STR é reatribuída (não é const) em aplicarIdioma(), então todo
// código abaixo que já lê STR.algumaCoisa continua funcionando sem
// precisar saber que o idioma mudou.
const IDIOMAS = {
  es: {
    portfolio: 'Portfolio', sobre: 'Sobre', todos: 'Todos',
    venda: 'Venta', aluguel: 'Alquiler', vendaAluguel: 'Venta / Alquiler',
    todosTipos: 'Todos los tipos', todasCidades: 'Todas las ciudades',
    apartamento: 'Departamento', casa: 'Casa', duplex: 'Dúplex',
    terreno: 'Terreno', comercial: 'Comercial', escritorio: 'Oficina',
    mes: '/mes', consulta: 'A consultar',
    quartos: 'dormitorios', banheiros: 'baños', vagas: 'cocheras',
    pronto: 'Listo', construcao: 'En construcción', planta: 'En pozo',
    vazio: 'No se encontraron inmuebles con esos filtros.',
    erro: 'No se pudieron cargar los inmuebles. Intentá de nuevo.',
    cargando: 'Cargando...',
    cta: 'Consultar por este inmueble', ref: 'Ref.',
    wa: (t) => `Hola, me interesa el inmueble: ${t}`,
    waHero: 'Hola, quiero más información sobre sus propiedades.',
    ctaTitulo: '¿No encontraste lo que buscabas?',
    ctaSub: 'Contame qué estás buscando y te ayudo a encontrarlo.',
    ctaBtn: 'Hablar por WhatsApp',
    footerDesc: 'Hablá directo por WhatsApp para más información.',
    footerRightsPrefix: 'Todos los derechos reservados a',
    tituloSufixo: 'Inmuebles',
    seleccionadosPor: (n) => `Seleccionados por ${n}.`,
    catalogoDe: (n) => `Catálogo de inmuebles de ${n}.`,
    keywordsDefault: (n) => `inmuebles, ${n}, Paraguay`,
    sobreDe: (n) => `Sobre ${n}`,
    derechos: 'Todos los derechos reservados.',
    comodidades: 'Comodidades',
    comsSelecionadas: (n) => (n === 1 ? '1 comodidad' : `${n} comodidades`),
    comsPronto: 'Listo',
    limparComodidades: 'Limpiar',
    maisComodidades: (n) => `+${n} más`,
    com: {
      piscina: 'Piscina', churrasqueira: 'Parrilla', academia: 'Gimnasio',
      mobiliado: 'Amoblado', ar: 'Aire acondicionado', varanda: 'Balcón',
      seguranca: 'Seguridad 24h', elevador: 'Ascensor', pets: 'Pet friendly',
      lavanderia: 'Lavandería', salao: 'Salón de fiestas', coworking: 'Coworking',
      jardim: 'Jardín', gerador: 'Generador', playground: 'Playground',
    },
  },
  pt: {
    portfolio: 'Portfólio', sobre: 'Sobre', todos: 'Todos',
    venda: 'Venda', aluguel: 'Aluguel', vendaAluguel: 'Venda / Aluguel',
    todosTipos: 'Todos os tipos', todasCidades: 'Todas as cidades',
    apartamento: 'Apartamento', casa: 'Casa', duplex: 'Duplex',
    terreno: 'Terreno', comercial: 'Comercial', escritorio: 'Escritório',
    mes: '/mês', consulta: 'Sob consulta',
    quartos: 'quartos', banheiros: 'banheiros', vagas: 'vagas',
    pronto: 'Pronto', construcao: 'Em construção', planta: 'Na planta',
    vazio: 'Nenhum imóvel encontrado com esses filtros.',
    erro: 'Não foi possível carregar os imóveis. Tente novamente.',
    cargando: 'Carregando...',
    cta: 'Falar sobre este imóvel', ref: 'Ref.',
    wa: (t) => `Olá, tenho interesse no imóvel: ${t}`,
    waHero: 'Olá, quero mais informações sobre seus imóveis.',
    ctaTitulo: 'Não encontrou o que procura?',
    ctaSub: 'Me conte o que você está buscando que eu te ajudo a encontrar.',
    ctaBtn: 'Falar no WhatsApp',
    footerDesc: 'Fale direto pelo WhatsApp para mais informações.',
    footerRightsPrefix: 'Todos os direitos reservados a',
    tituloSufixo: 'Imóveis',
    seleccionadosPor: (n) => `Selecionados por ${n}.`,
    catalogoDe: (n) => `Catálogo de imóveis de ${n}.`,
    keywordsDefault: (n) => `imóveis, ${n}, Paraguai`,
    sobreDe: (n) => `Sobre ${n}`,
    derechos: 'Todos os direitos reservados.',
    comodidades: 'Comodidades',
    comsSelecionadas: (n) => (n === 1 ? '1 comodidade' : `${n} comodidades`),
    comsPronto: 'Pronto',
    limparComodidades: 'Limpar',
    maisComodidades: (n) => `+${n} mais`,
    com: {
      piscina: 'Piscina', churrasqueira: 'Churrasqueira', academia: 'Academia',
      mobiliado: 'Mobiliado', ar: 'Ar-condicionado', varanda: 'Varanda',
      seguranca: 'Segurança 24h', elevador: 'Elevador', pets: 'Aceita pets',
      lavanderia: 'Lavanderia', salao: 'Salão de festas', coworking: 'Coworking',
      jardim: 'Jardim', gerador: 'Gerador', playground: 'Playground',
    },
  },
  en: {
    portfolio: 'Portfolio', sobre: 'About', todos: 'All',
    venda: 'For Sale', aluguel: 'For Rent', vendaAluguel: 'Sale / Rent',
    todosTipos: 'All types', todasCidades: 'All cities',
    apartamento: 'Apartment', casa: 'House', duplex: 'Duplex',
    terreno: 'Land', comercial: 'Commercial', escritorio: 'Office',
    mes: '/month', consulta: 'Price on request',
    quartos: 'bedrooms', banheiros: 'bathrooms', vagas: 'parking',
    pronto: 'Ready', construcao: 'Under construction', planta: 'Off-plan',
    vazio: 'No properties found with these filters.',
    erro: 'Could not load properties. Please try again.',
    cargando: 'Loading...',
    cta: 'Ask about this property', ref: 'Ref.',
    wa: (t) => `Hi, I'm interested in this property: ${t}`,
    waHero: "Hi, I'd like more information about your properties.",
    ctaTitulo: "Didn't find what you were looking for?",
    ctaSub: "Tell me what you're looking for and I'll help you find it.",
    ctaBtn: 'Chat on WhatsApp',
    footerDesc: 'Reach out directly on WhatsApp for more information.',
    footerRightsPrefix: 'All rights reserved to',
    tituloSufixo: 'Properties',
    seleccionadosPor: (n) => `Selected by ${n}.`,
    catalogoDe: (n) => `Property catalog by ${n}.`,
    keywordsDefault: (n) => `real estate, ${n}, Paraguay`,
    sobreDe: (n) => `About ${n}`,
    derechos: 'All rights reserved.',
    comodidades: 'Amenities',
    comsSelecionadas: (n) => (n === 1 ? '1 amenity' : `${n} amenities`),
    comsPronto: 'Done',
    limparComodidades: 'Clear',
    maisComodidades: (n) => `+${n} more`,
    com: {
      piscina: 'Pool', churrasqueira: 'BBQ area', academia: 'Gym',
      mobiliado: 'Furnished', ar: 'Air conditioning', varanda: 'Balcony',
      seguranca: '24h security', elevador: 'Elevator', pets: 'Pet friendly',
      lavanderia: 'Laundry', salao: 'Party room', coworking: 'Coworking',
      jardim: 'Garden', gerador: 'Power generator', playground: 'Playground',
    },
  },
};

// Ordem de exibição das comodidades — a mesma dos chips
// #imv-comodidades em admin.html (manter as duas em sincronia; um
// valor novo lá que não exista aqui cai no fallback de label crua).
const COMODIDADES = ['piscina', 'churrasqueira', 'academia', 'mobiliado', 'ar',
  'varanda', 'seguranca', 'elevador', 'pets', 'lavanderia', 'salao',
  'coworking', 'jardim', 'gerador', 'playground'];

let STR = IDIOMAS.es;

const comLabel = (c) => STR.com?.[c] || c;

// Aplica o idioma nos textos estáticos do HTML (os que não são
// gerados via cardHTML/etc, que já leem STR na hora de renderizar) —
// <html lang>, pills, opções dos selects, seção CTA, rodapé.
function aplicarIdioma(idiomaPedido) {
  const idioma = IDIOMAS[idiomaPedido] ? idiomaPedido : 'es';
  STR = IDIOMAS[idioma];
  document.documentElement.lang = idioma;

  document.getElementById('portfolio-label').textContent = STR.portfolio;
  document.getElementById('pill-todos').textContent = STR.todos;
  document.getElementById('pill-venda').textContent = STR.venda;
  document.getElementById('pill-aluguel').textContent = STR.aluguel;
  document.getElementById('opt-tipo-todos').textContent = STR.todosTipos;
  document.getElementById('opt-tipo-apartamento').textContent = STR.apartamento;
  document.getElementById('opt-tipo-casa').textContent = STR.casa;
  document.getElementById('opt-tipo-duplex').textContent = STR.duplex;
  document.getElementById('opt-tipo-terreno').textContent = STR.terreno;
  document.getElementById('opt-tipo-comercial').textContent = STR.comercial;
  document.getElementById('opt-tipo-escritorio').textContent = STR.escritorio;
  document.getElementById('opt-cidade-todas').textContent = STR.todasCidades;
  document.getElementById('cta-titulo').textContent = STR.ctaTitulo;
  document.getElementById('cta-sub').textContent = STR.ctaSub;
  document.getElementById('cta-whatsapp').textContent = STR.ctaBtn;
  document.getElementById('sobre-label').textContent = STR.sobre;
  document.getElementById('footer-desc').textContent = STR.footerDesc;
  document.getElementById('footer-rights-prefix').textContent = STR.footerRightsPrefix;
  atualizarComodidadesUI();
}

const ICONS = {
  pin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  bed:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9V5a1 1 0 011-1h18a1 1 0 011 1v4"/><path d="M2 11h20v8"/><path d="M2 19v-8"/><path d="M2 15h20"/></svg>',
  bath: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16a1 1 0 011 1 5 5 0 01-5 5H8a5 5 0 01-5-5 1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h1"/><path d="M7 19l-1 2"/><path d="M17 19l1 2"/></svg>',
  area: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/></svg>',
  car:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="1"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
};

// Só usados no modo preview quando o tenant ainda não tem nenhum
// imóvel cadastrado de verdade — nunca gravados/lidos do Firestore.
const IMOVEIS_EXEMPLO = [
  { id: 'exemplo-1', titulo: 'Departamento moderno de 2 dormitorios', operacao: 'venda', tipo: 'apartamento', precoVenda: 95000, quartos: 2, banheiros: 2, areaM2: 68, vagas: 1, cidade: 'Asunción', bairro: 'Villa Morra', capa: null, ativo: true, comodidades: ['piscina', 'academia', 'seguranca', 'elevador'] },
  { id: 'exemplo-2', titulo: 'Casa con jardín y pileta', operacao: 'venda', tipo: 'casa', precoVenda: 180000, quartos: 3, banheiros: 2, areaM2: 210, vagas: 2, cidade: 'Lambaré', bairro: '', capa: null, ativo: true, comodidades: ['piscina', 'churrasqueira', 'jardim', 'pets'] },
  { id: 'exemplo-3', titulo: 'Oficina lista para estrenar', operacao: 'aluguel', tipo: 'escritorio', precoAluguel: 650, quartos: 0, banheiros: 1, areaM2: 45, vagas: 1, cidade: 'Asunción', bairro: 'Centro', capa: null, ativo: true, comodidades: ['ar', 'coworking', 'seguranca'] },
];

// Idem — só pro preview, só quando o campo real está vazio, pra não
// deixar a página parecendo vazia enquanto o corretor ainda não
// escreveu nada. No site publicado de verdade nunca aparece isso.
const EXEMPLO_TEXTOS = {
  headline: 'Encontrá tu próxima casa en Asunción',
  subheadline: 'Más de 10 años ayudando familias a encontrar el hogar ideal — para vivir o invertir.',
  about: 'Somos un equipo dedicado a acompañarte en todo el proceso de compra, venta o alquiler de tu propiedad. Atención personalizada, conocimiento del mercado local y compromiso en cada paso.',
};

const esc = (s) => String(s || '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Só essas 3 moedas por enquanto (ver admin-imoveis.js — mesmo mapa).
const MOEDA = {
  USD: { simbolo: 'US$', locale: 'en-US' },
  PYG: { simbolo: 'Gs.', locale: 'es-PY' },
  BRL: { simbolo: 'R$',  locale: 'pt-BR' },
};
const fmtPreco = (v, moeda) => {
  const m = MOEDA[moeda] || MOEDA.USD;
  return `${m.simbolo} ${Number(v).toLocaleString(m.locale)}`;
};

function precoHTML(imv, detalhe = false) {
  const tag = detalhe ? 'p class="imv-detail__price"' : 'p class="imv-card__price"';
  const partes = [];
  if (imv.operacao !== 'aluguel' && imv.precoVenda) partes.push(`<${tag}>${fmtPreco(imv.precoVenda, imv.moeda)}</p>`);
  if (imv.operacao !== 'venda' && imv.precoAluguel) partes.push(`<${tag}>${fmtPreco(imv.precoAluguel, imv.moeda)} <small>${STR.mes}</small></p>`);
  if (!partes.length) partes.push(`<${tag}>${STR.consulta}</p>`);
  return partes.join('');
}

function badgesHTML(imv) {
  const op = imv.operacao === 'aluguel' ? 'aluguel' : 'venda';
  const opLabel = imv.operacao === 'venda-aluguel' ? STR.vendaAluguel : imv.operacao === 'aluguel' ? STR.aluguel : STR.venda;
  let html = `<span class="imv-badge imv-badge--${op}">${opLabel}</span>`;
  if (imv.estagio && imv.estagio !== 'pronto') html += `<span class="imv-badge imv-badge--estagio">${STR[imv.estagio] || imv.estagio}</span>`;
  return html;
}

function featsHTML(imv) {
  const itens = [];
  if (imv.quartos)   itens.push(`<li>${ICONS.bed}${imv.quartos} ${STR.quartos}</li>`);
  if (imv.banheiros) itens.push(`<li>${ICONS.bath}${imv.banheiros} ${STR.banheiros}</li>`);
  if (imv.areaM2)    itens.push(`<li>${ICONS.area}${imv.areaM2} m²</li>`);
  if (imv.vagas)     itens.push(`<li>${ICONS.car}${imv.vagas} ${STR.vagas}</li>`);
  return itens.length ? `<ul class="imv-feats">${itens.join('')}</ul>` : '';
}

// Comodidades marcadas no imóvel, sempre na ordem canônica de
// COMODIDADES (o admin grava na ordem em que os checkboxes aparecem no
// DOM, mas isso é detalhe dele) — valores desconhecidos, de uma versão
// mais nova do admin, vão pro fim em vez de sumirem da tela.
function comodidadesDe(imv) {
  const salvas = Array.isArray(imv.comodidades) ? imv.comodidades : [];
  return [
    ...COMODIDADES.filter(c => salvas.includes(c)),
    ...salvas.filter(c => !COMODIDADES.includes(c)),
  ];
}

// No card só cabem algumas — o resto vira "+N", e a lista completa
// aparece no modal de detalhe.
const COMS_NO_CARD = 3;

function comsCardHTML(imv) {
  const coms = comodidadesDe(imv);
  if (!coms.length) return '';
  const itens = coms.slice(0, COMS_NO_CARD)
    .map(c => `<li>${esc(comLabel(c))}</li>`).join('');
  const resto = coms.length - COMS_NO_CARD;
  const mais = resto > 0
    ? `<li class="imv-card__coms-mais">${esc(STR.maisComodidades(resto))}</li>` : '';
  return `<ul class="imv-card__coms">${itens}${mais}</ul>`;
}

function comsDetalheHTML(imv) {
  const coms = comodidadesDe(imv);
  if (!coms.length) return '';
  return `
    <h4 class="imv-detail__coms-titulo">${esc(STR.comodidades)}</h4>
    <div class="imv-detail__coms">${coms
      .map(c => `<span>${ICONS.check}${esc(comLabel(c))}</span>`).join('')}</div>`;
}

function localHTML(imv) {
  const loc = [imv.bairro, imv.cidade].filter(Boolean).join(', ');
  return loc ? `<p class="imv-card__loc">${ICONS.pin}${esc(loc)}</p>` : '';
}

// `i` vem do .map() em renderGrid — os primeiros cards são os que
// aparecem acima da dobra, e a capa de um deles é justamente o elemento
// de LCP da página. Marcá-los como lazy (todos eram) empurrava a imagem
// mais importante da tela pra depois do layout; eager + fetchpriority
// alta faz o navegador tratá-la como o que ela é. Do 4º em diante lazy
// segue valendo — aí sim é imagem que ninguém vê sem rolar.
const CARDS_ACIMA_DA_DOBRA = 3;

function cardHTML(imv, i = 0) {
  const prioritaria = i < CARDS_ACIMA_DA_DOBRA;
  const carregamento = prioritaria
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy"';
  const img = imv.capa
    ? `<img src="${imv.capa}" alt="${esc(imv.titulo)}" ${carregamento} width="600" height="450">`
    : `<div class="imv-noimg">${ICONS.home}</div>`;
  return `
    <article class="imv-card" data-id="${imv.id}" tabindex="0" role="button" aria-label="${esc(imv.titulo)}">
      <div class="imv-card__media">${img}${badgesHTML(imv)}</div>
      <div class="imv-card__body">
        ${precoHTML(imv)}
        <h3 class="imv-card__title">${esc(imv.titulo)}</h3>
        ${localHTML(imv)}
        ${featsHTML(imv)}
        ${comsCardHTML(imv)}
      </div>
    </article>`;
}

// ── Estado / elementos ────────────────────────────
let tenantId = null;
let perfil = null;
let cache = null;

const grid = document.getElementById('imv-grid');
const conteudoEl = document.getElementById('site-conteudo');
const indisponivelEl = document.getElementById('site-indisponivel');
const carregandoEl = document.getElementById('site-carregando');
// comodidades é um Set porque o filtro é múltiplo e cumulativo (E, não
// OU): marcar "piscina" e "academia" mostra só quem tem as duas.
const filtros = { operacao: 'todos', tipo: 'todos', cidade: 'todas', comodidades: new Set() };

function colImoveis()        { return collection(db, 'brokers', tenantId, 'imoveis'); }
function colFotos(id)        { return collection(db, 'brokers', tenantId, 'imoveis', id, 'fotos'); }

async function carregarImoveis() {
  if (cache) return cache;
  const snap = await getDocs(query(colImoveis(), where('ativo', '==', true)));
  const todos = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const limite = perfil?.imoveisLimit;
  cache = Number.isFinite(limite) ? todos.slice(0, limite) : todos;
  return cache;
}

function montarFiltroCidade(lista) {
  const sel = document.getElementById('imv-filtro-cidade');
  sel.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  const cidades = [...new Set(lista.map(i => (i.cidade || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  cidades.forEach(c => {
    const opt = document.createElement('option');
    opt.value = normalizar(c);
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

// Opções do dropdown de comodidades — montadas a partir das
// comodidades que os imóveis do corretor realmente têm, igual ao filtro
// de cidade. Um catálogo sem nenhuma comodidade marcada não ganha o
// dropdown (e um filtro que nunca acha nada é pior do que filtro nenhum).
function montarFiltroComodidades(lista) {
  const wrap = document.getElementById('imv-filtro-coms-wrap');
  const row = document.getElementById('imv-filtro-comodidades');
  if (!wrap || !row) return;

  const presentes = new Set();
  lista.forEach(i => comodidadesDe(i).forEach(c => presentes.add(c)));

  // seleção que não existe mais no catálogo atual sai junto, senão o
  // grid ficaria vazio por causa de uma opção que nem está mais na lista
  filtros.comodidades.forEach(c => { if (!presentes.has(c)) filtros.comodidades.delete(c); });

  if (!presentes.size) {
    row.innerHTML = '';
    wrap.hidden = true;
    fecharComodidades();
    return;
  }

  const ordenadas = [
    ...COMODIDADES.filter(c => presentes.has(c)),
    ...[...presentes].filter(c => !COMODIDADES.includes(c)).sort(),
  ];
  row.innerHTML = ordenadas.map(c => {
    const ativa = filtros.comodidades.has(c);
    return `<label class="imv-drop__opt"><input type="checkbox" data-com="${esc(c)}"
      ${ativa ? 'checked' : ''}><span>${esc(comLabel(c))}</span></label>`;
  }).join('');
  wrap.hidden = false;
  atualizarComodidadesUI();
}

// Textos que dependem do idioma + estado do botão e do "limpar", que só
// faz sentido com algo marcado.
//
// Fechado, o botão precisa responder sozinho "esse filtro está ligado e
// pega quantas coisas?" — daí o próprio rótulo virar "2 comodidades" em
// vez de "Comodidades" + um selo numérico ao lado. Listar os nomes das
// escolhidas não cabe: são até 15, de largura variável, e o botão tem
// 220px no desktop; a contagem cabe sempre, em qualquer idioma.
function atualizarComodidadesUI() {
  const n = filtros.comodidades.size;
  const label = document.getElementById('imv-coms-label');
  if (label) label.textContent = n ? STR.comsSelecionadas(n) : STR.comodidades;
  const toggle = document.getElementById('imv-coms-toggle');
  if (toggle) toggle.classList.toggle('imv-drop__toggle--ativo', !!n);
  // Cabeçalho da folha do celular: título fixo (o do botão vira contagem)
  const titulo = document.getElementById('imv-coms-titulo');
  if (titulo) titulo.textContent = STR.comodidades;
  const pronto = document.getElementById('imv-coms-pronto');
  if (pronto) pronto.textContent = STR.comsPronto;
  const limpar = document.getElementById('imv-coms-limpar');
  if (limpar) {
    limpar.textContent = STR.limparComodidades;
    limpar.hidden = !n;
  }
  const foot = document.getElementById('imv-coms-foot');
  if (foot) foot.hidden = !n;
}

// Abrir/fechar move menu e backdrop juntos. O backdrop só é visível no
// celular (@media em css/imoveis.css), mas alternar sempre mantém uma
// verdade só — nada de checar largura de tela em JS pra decidir isso.
function definirComodidadesAberto(aberto) {
  const menu = document.getElementById('imv-coms-menu');
  const backdrop = document.getElementById('imv-coms-backdrop');
  const toggle = document.getElementById('imv-coms-toggle');
  if (menu) menu.hidden = !aberto;
  if (backdrop) backdrop.hidden = !aberto;
  if (toggle) toggle.setAttribute('aria-expanded', String(aberto));
}

function fecharComodidades() { definirComodidadesAberto(false); }

// Usado pelo "limpar" do dropdown e pelo atalho do estado vazio.
function limparComodidades() {
  filtros.comodidades.clear();
  document.querySelectorAll('#imv-filtro-comodidades input[data-com]')
    .forEach(i => { i.checked = false; });
  atualizarComodidadesUI();
  renderGrid();
}

function aplicarFiltros(lista) {
  return lista.filter(i => {
    if (filtros.operacao !== 'todos' && i.operacao !== filtros.operacao && i.operacao !== 'venda-aluguel') return false;
    if (filtros.tipo !== 'todos' && i.tipo !== filtros.tipo) return false;
    if (filtros.cidade !== 'todas' && normalizar(i.cidade) !== filtros.cidade) return false;
    if (filtros.comodidades.size) {
      const coms = comodidadesDe(i);
      for (const c of filtros.comodidades) if (!coms.includes(c)) return false;
    }
    return true;
  });
}

function renderGrid() {
  if (!grid || !cache) return;
  const lista = aplicarFiltros(cache);
  if (!lista.length) {
    // com comodidades marcadas dá pra cair no vazio sem entender por
    // quê — o atalho de limpar evita que o visitante desista aqui
    const atalho = filtros.comodidades.size
      ? `<button type="button" class="imv-empty__clear" id="imv-empty-limpar">${esc(STR.limparComodidades)}</button>`
      : '';
    grid.innerHTML = `<div class="imv-empty">${ICONS.home}<p>${STR.vazio}</p>${atalho}</div>`;
    return;
  }
  grid.innerHTML = lista.map(cardHTML).join('');
}

function renderErro() {
  grid.innerHTML = `<div class="imv-empty"><p>${STR.erro}</p></div>`;
}

function initFiltros() {
  const pills = document.querySelectorAll('.imv-pills button');
  const tipo = document.getElementById('imv-filtro-tipo');
  const cidade = document.getElementById('imv-filtro-cidade');
  pills.forEach(btn => btn.addEventListener('click', () => {
    pills.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtros.operacao = btn.dataset.op;
    renderGrid();
  }));
  tipo?.addEventListener('change', () => { filtros.tipo = tipo.value; renderGrid(); });
  cidade?.addEventListener('change', () => { filtros.cidade = cidade.value; renderGrid(); });

  // delegado: as opções só existem depois de montarFiltroComodidades()
  const coms = document.getElementById('imv-filtro-comodidades');
  coms?.addEventListener('change', e => {
    const input = e.target.closest('input[data-com]');
    if (!input) return;
    const v = input.dataset.com;
    if (input.checked) filtros.comodidades.add(v);
    else filtros.comodidades.delete(v);
    atualizarComodidadesUI();
    renderGrid();
  });
  document.getElementById('imv-coms-limpar')?.addEventListener('click', limparComodidades);

  // abre/fecha; fica aberto enquanto o visitante marca várias
  // comodidades e fecha no backdrop, no "Listo", em clique fora ou Esc.
  const comsToggle = document.getElementById('imv-coms-toggle');
  const comsMenu = document.getElementById('imv-coms-menu');
  const comsWrap = document.getElementById('imv-filtro-coms-wrap');
  const comsBackdrop = document.getElementById('imv-coms-backdrop');
  comsToggle?.addEventListener('click', () => {
    definirComodidadesAberto(comsMenu.hidden);
  });

  // O backdrop mora DENTRO de .imv-drop (pra ficar junto do resto do
  // componente), então o "clique fora" abaixo não o alcança — precisa
  // do seu próprio fechamento.
  comsBackdrop?.addEventListener('click', fecharComodidades);
  document.getElementById('imv-coms-pronto')?.addEventListener('click', () => {
    fecharComodidades();
    comsToggle?.focus();
  });

  // pointerdown, não click: no Safari do iOS um toque em elemento que
  // não é interativo NÃO gera clique que borbulhe até o document, e o
  // menu ficava sem jeito de fechar tocando fora. pointerdown chega em
  // todo navegador atual e ainda fecha um quadro antes.
  document.addEventListener('pointerdown', e => {
    if (comsWrap && !comsWrap.contains(e.target)) fecharComodidades();
  });
  comsWrap?.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || comsMenu.hidden) return;
    fecharComodidades();
    comsToggle.focus();
  });
}

// ── Modal de detalhe ──────────────────────────────
const detailBackdrop = document.getElementById('imv-modal');
let galeria = [];
let galeriaIdx = 0;
const fotosCache = {};

async function carregarFotos(id) {
  if (fotosCache[id]) return fotosCache[id];
  const snap = await getDocs(query(colFotos(id), orderBy('ordem')));
  fotosCache[id] = snap.docs.map(d => d.data().data);
  return fotosCache[id];
}

function renderGaleria() {
  const main = detailBackdrop.querySelector('.imv-detail__main img');
  const count = detailBackdrop.querySelector('.imv-gal-count');
  const thumbs = detailBackdrop.querySelector('.imv-thumbs');
  if (!galeria.length) return;
  main.src = galeria[galeriaIdx];
  count.textContent = `${galeriaIdx + 1} / ${galeria.length}`;
  thumbs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === galeriaIdx));
}

function montarThumbs() {
  const thumbs = detailBackdrop.querySelector('.imv-thumbs');
  const navs = detailBackdrop.querySelectorAll('.imv-gal-nav');
  thumbs.innerHTML = galeria.map((src, i) =>
    `<button type="button" data-idx="${i}" aria-label="Foto ${i + 1}"><img src="${src}" alt=""></button>`).join('');
  const multi = galeria.length > 1;
  thumbs.style.display = multi ? '' : 'none';
  navs.forEach(n => n.style.display = multi ? '' : 'none');
}

async function abrirDetalhe(id) {
  const imv = cache?.find(i => i.id === id);
  if (!imv || !detailBackdrop) return;

  const loc = [imv.bairro, imv.cidade].filter(Boolean).join(', ');
  const tipoLabel = imv.tipo ? (STR[imv.tipo] || imv.tipo) : '';
  const waMsg = encodeURIComponent(STR.wa(imv.titulo + (imv.ref ? ` (${STR.ref} ${imv.ref})` : '')));

  detailBackdrop.querySelector('.imv-detail__info').innerHTML = `
    <div class="imv-detail__badges">${badgesHTML(imv)}</div>
    <h3 id="imv-modal-title">${esc(imv.titulo)}</h3>
    ${loc ? `<p class="imv-card__loc">${ICONS.pin}${esc(loc)}${tipoLabel ? ' · ' + tipoLabel : ''}</p>` : ''}
    ${precoHTML(imv, true)}
    ${featsHTML(imv)}
    ${comsDetalheHTML(imv)}
    ${imv.descricao ? `<p class="imv-detail__desc">${esc(imv.descricao)}</p>` : ''}
    ${imv.ref ? `<p class="imv-detail__ref">${STR.ref} ${esc(imv.ref)}</p>` : ''}
    <a class="btn btn--whatsapp btn--md imv-detail__cta" target="_blank" rel="noopener"
       data-ev-imovel="${esc(imv.id)}"
       href="https://wa.me/${perfil?.whatsapp || ''}?text=${waMsg}">
      ${STR.cta}
    </a>`;

  galeria = imv.capa ? [imv.capa] : [];
  galeriaIdx = 0;
  detailBackdrop.querySelector('.imv-detail__gallery').style.display = galeria.length ? '' : 'none';
  montarThumbs();
  renderGaleria();

  detailBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';

  // só os 3 de exemplo não têm fotos reais no Firestore — imóveis de
  // verdade mostrados no preview (ver iniciarPreview) buscam normal
  if (id.startsWith('exemplo-')) return;

  try {
    const fotos = await carregarFotos(id);
    if (fotos.length) {
      galeria = fotos;
      galeriaIdx = 0;
      detailBackdrop.querySelector('.imv-detail__gallery').style.display = '';
      montarThumbs();
      renderGaleria();
    }
  } catch (e) {
    console.error('Erro ao carregar fotos:', e);
  }
}

function fecharDetalhe() {
  detailBackdrop.classList.remove('open');
  document.body.style.overflow = '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function initDetalhe() {
  if (!detailBackdrop) return;
  detailBackdrop.querySelector('.modal__close').addEventListener('click', fecharDetalhe);
  detailBackdrop.addEventListener('click', e => { if (e.target === detailBackdrop) fecharDetalhe(); });
  document.addEventListener('keydown', e => {
    if (!detailBackdrop.classList.contains('open')) return;
    if (e.key === 'Escape') fecharDetalhe();
    if (e.key === 'ArrowRight') { galeriaIdx = (galeriaIdx + 1) % galeria.length; renderGaleria(); }
    if (e.key === 'ArrowLeft')  { galeriaIdx = (galeriaIdx - 1 + galeria.length) % galeria.length; renderGaleria(); }
  });
  detailBackdrop.querySelector('.imv-gal-nav--prev').addEventListener('click', () => {
    galeriaIdx = (galeriaIdx - 1 + galeria.length) % galeria.length; renderGaleria();
  });
  detailBackdrop.querySelector('.imv-gal-nav--next').addEventListener('click', () => {
    galeriaIdx = (galeriaIdx + 1) % galeria.length; renderGaleria();
  });
  detailBackdrop.querySelector('.imv-thumbs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-idx]');
    if (btn) { galeriaIdx = Number(btn.dataset.idx); renderGaleria(); }
  });

  let touchX = null;
  const main = detailBackdrop.querySelector('.imv-detail__main');
  main.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  main.addEventListener('touchend', e => {
    if (touchX === null || galeria.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) {
      galeriaIdx = (galeriaIdx + (dx < 0 ? 1 : -1) + galeria.length) % galeria.length;
      renderGaleria();
    }
    touchX = null;
  }, { passive: true });
}

// site-carregando também tem display:flex fixo inline no HTML (pro
// spinner já aparecer centralizado antes do JS carregar) — mesmo motivo
// do comentário abaixo sobre indisponivelEl, precisa zerar o inline
// style aqui também, senão o spinner nunca some de verdade, só o
// [hidden] é setado (sem efeito visual nenhum contra um style inline).
function esconderCarregando() {
  carregandoEl.style.display = 'none';
  carregandoEl.hidden = true;
}

// ── Indisponível (tenant não existe / não publicado) ──────────
function mostrarIndisponivel() {
  esconderCarregando();
  conteudoEl.hidden = true;
  // display setado aqui, não fixo no HTML — um <div hidden> com
  // display:flex fixo no style continua visível de qualquer jeito,
  // porque o inline style tem mais especificidade que o [hidden] do
  // navegador (era exatamente o bug: aparecia sempre, escondido ou não).
  indisponivelEl.style.display = 'flex';
  indisponivelEl.hidden = false;
}

// Revela o site só depois que aplicarPerfil() já rodou com dados de
// verdade — antes disso fica o spinner, nunca o texto padrão estático
// do HTML (que já não existe mais, mas por segurança).
function mostrarConteudo() {
  esconderCarregando();
  conteudoEl.hidden = false;
}

// Container do Google Tag Manager do próprio corretor (opcional,
// configurado em meu-site.html). Só injeta no site publicado de
// verdade — nunca no preview (senão cada tecla digitada no formulário
// dispararia visita de teste no GTM do corretor) — e só uma vez, caso
// aplicarPerfil() seja chamado de novo por qualquer motivo. Réplica em
// JS do snippet oficial de instalação do GTM (que normalmente vai
// direto no HTML) — aqui precisa ser via JS porque o bundle é o mesmo
// pra qualquer tenant, o id só existe em tempo de execução.
const GTM_ID_REGEX = /^GTM-[A-Z0-9]+$/;
function injetarGTM(id) {
  if (!GTM_ID_REGEX.test(id || '') || document.getElementById('pa-gtm-script')) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.id = 'pa-gtm-script';
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
  document.head.appendChild(script);

  const noscript = document.createElement('noscript');
  const iframe = document.createElement('iframe');
  iframe.src = 'https://www.googletagmanager.com/ns.html?id=' + encodeURIComponent(id);
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  noscript.appendChild(iframe);
  document.body.insertBefore(noscript, document.body.firstChild);
}

// ── Aplica campos do perfil no DOM — usado tanto no fluxo normal
// (perfilPublico) quanto no preview (postMessage), sempre com o
// mesmo shape { name, whatsapp, logo, headline, subheadline, about,
// keywords, email, instagramUrl, accentColor, gtmId }. Tudo opcional
// exceto name/whatsapp — sem os outros campos, cai num texto padrão
// razoável.
function aplicarPerfil(p) {
  perfil = p;
  aplicarIdioma(p.language);
  aplicarAccent(p.accentColor);
  if (!MODO_PREVIEW && p.gtmId) injetarGTM(p.gtmId);

  const nome = p.name || STR.tituloSufixo;
  document.title = nome + ' — ' + STR.tituloSufixo;
  document.getElementById('meta-description').setAttribute('content', p.subheadline || STR.catalogoDe(nome));
  document.getElementById('meta-keywords').setAttribute('content', p.keywords || STR.keywordsDefault(nome));

  // Navbar: nome/logo do corretor sempre visíveis no topo, mesmo
  // rolando a página — sem isso o site inteiro parecia um template
  // genérico, sem nenhuma identidade fixa na tela.
  const navLogoEl = document.getElementById('nav-logo');
  if (p.logo) { navLogoEl.src = p.logo; navLogoEl.alt = nome; navLogoEl.hidden = false; }
  else { navLogoEl.hidden = true; }
  document.getElementById('nav-nome').textContent = nome;

  document.getElementById('imoveis-titulo').textContent = p.headline
    || (MODO_PREVIEW ? EXEMPLO_TEXTOS.headline : STR.tituloSufixo + ' disponibles');
  document.getElementById('imoveis-sub').textContent = p.subheadline
    || (MODO_PREVIEW ? EXEMPLO_TEXTOS.subheadline : STR.seleccionadosPor(nome));

  // "Sobre" fica escondida se vazia no site publicado de verdade — mas
  // no preview mostra um texto de exemplo, pra dar pro corretor uma
  // ideia real de como a seção fica preenchida antes de escrever a dele.
  const sobreSec = document.getElementById('sobre-section');
  const sobreTexto = p.about || (MODO_PREVIEW ? EXEMPLO_TEXTOS.about : '');
  if (sobreTexto) {
    document.getElementById('sobre-titulo').textContent = STR.sobreDe(nome);
    document.getElementById('sobre-texto').textContent = sobreTexto;
    sobreSec.hidden = false;
  } else {
    sobreSec.hidden = true;
  }

  const msgPadrao = encodeURIComponent(STR.waHero);
  const waHref = p.whatsapp ? `https://wa.me/${p.whatsapp}?text=${msgPadrao}` : '#';
  document.getElementById('nav-whatsapp').href = waHref;
  document.getElementById('cta-whatsapp').href = waHref;
  document.getElementById('footer-whatsapp').href = waHref;
  document.getElementById('footer-nome').textContent = nome;
  document.getElementById('footer-copy').textContent = `© ${new Date().getFullYear()} ${nome}. ${STR.derechos}`;

  const emailEl = document.getElementById('footer-email');
  if (p.email) { emailEl.href = `mailto:${p.email}`; emailEl.textContent = p.email; emailEl.hidden = false; }
  else { emailEl.hidden = true; }

  const instaEl = document.getElementById('footer-instagram');
  if (p.instagramUrl) { instaEl.href = p.instagramUrl; instaEl.hidden = false; }
  else { instaEl.hidden = true; }

  // idioma pode ter mudado depois da 1ª renderização (preview) — os
  // chips de comodidade também são texto traduzido, então remontam
  // junto (montarFiltroComodidades preserva o que já estava marcado)
  if (cache) { montarFiltroComodidades(cache); renderGrid(); }
}

function initComum() {
  initFiltros();
  initDetalhe();
  grid.addEventListener('click', e => {
    if (e.target.closest('#imv-empty-limpar')) { limparComodidades(); return; }
    const card = e.target.closest('.imv-card');
    if (card) abrirDetalhe(card.dataset.id);
  });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.imv-card');
    if (card) { e.preventDefault(); abrirDetalhe(card.dataset.id); }
  });
}

// ── Modo preview: nunca chama perfilPublico (mostra rascunho ainda
// não salvo/publicado, via postMessage do meu-site.html) — mas os
// imóveis já são reais e já são públicos de qualquer forma, então
// busca eles direto do Firestore igual ao modo normal. Só cai pros 3
// de exemplo se o tenant realmente não tiver nenhum imóvel ainda —
// sem isso, um corretor que já cadastrou imóveis via Meus Imóveis via
// só os de exemplo no preview e achava que não tinha salvo de verdade.
async function iniciarPreview() {
  initComum();
  tenantId = tenantIdAtual();

  let recebeuPerfil = false;
  window.addEventListener('message', (e) => {
    if (e.data?.tipo !== 'pa-preview-perfil') return;
    recebeuPerfil = true;
    aplicarPerfil(e.data.perfil);
    mostrarConteudo();
  });
  window.parent?.postMessage({ tipo: 'pa-preview-pronto' }, '*');

  // Se o handshake com meu-site.html não completar em tempo (aba/iframe
  // em segundo plano no mobile, rede lenta, mensagem perdida), mostra o
  // conteúdo de exemplo mesmo assim — sem isso o spinner ficava girando
  // pra sempre esperando um postMessage que talvez nunca chegasse.
  setTimeout(() => {
    if (!recebeuPerfil) { aplicarPerfil({}); mostrarConteudo(); }
  }, 6000);

  let reais = [];
  if (tenantId) {
    try { reais = await carregarImoveis(); }
    catch (e) { console.error('Erro ao carregar imóveis no preview:', e); }
  }
  cache = reais.length ? reais : IMOVEIS_EXEMPLO;
  montarFiltroCidade(cache);
  montarFiltroComodidades(cache);
  renderGrid();
}

// ── Modo normal: perfilPublico + Firestore de verdade.
async function iniciarNormal() {
  tenantId = tenantIdAtual();
  if (!tenantId) { mostrarIndisponivel(); return; }

  const p = await carregarPerfilPublico(tenantId);
  if (!p) { mostrarIndisponivel(); return; }
  aplicarPerfil(p);
  mostrarConteudo();

  initComum();

  try {
    const lista = await carregarImoveis();
    montarFiltroCidade(lista);
    montarFiltroComodidades(lista);
    renderGrid();
    const id = location.hash.slice(1);
    if (id && lista.some(i => i.id === id)) abrirDetalhe(id);
  } catch (e) {
    console.error('Erro ao carregar imóveis:', e);
    renderErro();
  }
}

// Antes do início: o listener é delegado no document, então já cobre
// os CTAs que ainda vão ser renderizados. iniciarEventosContato()
// não faz nada em modo preview (ver eventos.js).
iniciarEventosContato();

if (MODO_PREVIEW) iniciarPreview();
else iniciarNormal();
