// ════════════════════════════════════════════════
// IMÓVEIS — renderização pública (listagem + destaques na home)
// Lê a coleção `imoveis` do Firestore. Fotos da galeria ficam
// na subcoleção `imoveis/{id}/fotos` e só são baixadas ao abrir o detalhe.
// ════════════════════════════════════════════════
import { db } from './firebase.js';
import { collection, query, where, getDocs, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { carregarConfigPlano, limiteEfetivo } from './plano.js';

// ── Strings traduzidas para conteúdo gerado via JS ──
const STR = {
  pt: {
    venda: 'Venda', aluguel: 'Aluguel', vendaAluguel: 'Venda / Aluguel',
    mes: '/mês', consulta: 'Sob consulta',
    quartos: 'quartos', banheiros: 'banheiros', vagas: 'vagas',
    pronto: 'Pronto', construcao: 'Em construção', planta: 'Na planta',
    apartamento: 'Apartamento', casa: 'Casa', duplex: 'Duplex',
    terreno: 'Terreno', comercial: 'Comercial', escritorio: 'Escritório',
    vazio: 'Nenhum imóvel encontrado com esses filtros.',
    erro: 'Não foi possível carregar os imóveis. Tente novamente.',
    cta: 'Falar sobre este imóvel',
    ref: 'Ref.',
    qualquer: 'Qualquer',
    mostrar: (n) => n === 1 ? 'Mostrar 1 imóvel' : `Mostrar ${n} imóveis`,
    com: {
      piscina: 'Piscina', churrasqueira: 'Churrasqueira', academia: 'Academia',
      mobiliado: 'Mobiliado', ar: 'Ar-condicionado', varanda: 'Varanda',
      seguranca: 'Segurança 24h', elevador: 'Elevador', pets: 'Aceita pets',
      lavanderia: 'Lavanderia', salao: 'Salão de festas', coworking: 'Coworking',
      jardim: 'Jardim', gerador: 'Gerador', playground: 'Playground',
    },
    wa: (t) => `Olá {{BROKER_FIRST_NAME}}, tenho interesse no imóvel: ${t}`,
  },
  es: {
    venda: 'Venta', aluguel: 'Alquiler', vendaAluguel: 'Venta / Alquiler',
    mes: '/mes', consulta: 'A consultar',
    quartos: 'dormitorios', banheiros: 'baños', vagas: 'cocheras',
    pronto: 'Listo', construcao: 'En construcción', planta: 'En pozo',
    apartamento: 'Departamento', casa: 'Casa', duplex: 'Dúplex',
    terreno: 'Terreno', comercial: 'Comercial', escritorio: 'Oficina',
    vazio: 'No se encontraron inmuebles con esos filtros.',
    erro: 'No se pudieron cargar los inmuebles. Intentá de nuevo.',
    cta: 'Consultar por este inmueble',
    ref: 'Ref.',
    qualquer: 'Cualquiera',
    mostrar: (n) => n === 1 ? 'Mostrar 1 inmueble' : `Mostrar ${n} inmuebles`,
    com: {
      piscina: 'Piscina', churrasqueira: 'Quincho', academia: 'Gimnasio',
      mobiliado: 'Amoblado', ar: 'Aire acondicionado', varanda: 'Balcón',
      seguranca: 'Seguridad 24h', elevador: 'Ascensor', pets: 'Acepta mascotas',
      lavanderia: 'Lavandería', salao: 'Salón de eventos', coworking: 'Coworking',
      jardim: 'Jardín', gerador: 'Generador', playground: 'Parque infantil',
    },
    wa: (t) => `Hola {{BROKER_FIRST_NAME}}, me interesa el inmueble: ${t}`,
  },
  en: {
    venda: 'For Sale', aluguel: 'For Rent', vendaAluguel: 'Sale / Rent',
    mes: '/month', consulta: 'Price on request',
    quartos: 'bedrooms', banheiros: 'bathrooms', vagas: 'parking',
    pronto: 'Ready', construcao: 'Under construction', planta: 'Off-plan',
    apartamento: 'Apartment', casa: 'House', duplex: 'Duplex',
    terreno: 'Land', comercial: 'Commercial', escritorio: 'Office',
    vazio: 'No properties match these filters.',
    erro: 'Could not load properties. Please try again.',
    cta: 'Ask about this property',
    ref: 'Ref.',
    qualquer: 'Any',
    mostrar: (n) => n === 1 ? 'Show 1 property' : `Show ${n} properties`,
    com: {
      piscina: 'Pool', churrasqueira: 'BBQ area', academia: 'Gym',
      mobiliado: 'Furnished', ar: 'Air conditioning', varanda: 'Balcony',
      seguranca: '24h security', elevador: 'Elevator', pets: 'Pet friendly',
      lavanderia: 'Laundry', salao: 'Party room', coworking: 'Coworking',
      jardim: 'Garden', gerador: 'Power generator', playground: 'Playground',
    },
    wa: (t) => `Hello {{BROKER_FIRST_NAME}}, I'm interested in this property: ${t}`,
  },
};

// ordem de exibição das comodidades (chaves do dicionário `com`)
// ATENÇÃO: manter em sincronia com os chips #imv-comodidades em admin/index.html
const COMODIDADES = ['piscina','churrasqueira','academia','mobiliado','ar','varanda',
  'seguranca','elevador','pets','lavanderia','salao','coworking','jardim','gerador','playground'];

const WHATSAPP = '{{WHATSAPP}}';

const lang = () => localStorage.getItem('site-lang') || '{{DEFAULT_LANG}}';
const t = (key) => (STR[lang()] || STR.pt)[key];

// ── Ícones (SVG inline, mesmos traços do design system) ──
const ICONS = {
  pin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  bed:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9V5a1 1 0 011-1h18a1 1 0 011 1v4"/><path d="M2 11h20v8"/><path d="M2 19v-8"/><path d="M2 15h20"/></svg>',
  bath: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16a1 1 0 011 1 5 5 0 01-5 5H8a5 5 0 01-5-5 1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h1"/><path d="M7 19l-1 2"/><path d="M17 19l1 2"/></svg>',
  area: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/></svg>',
  car:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="1"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
};

// ── Helpers ───────────────────────────────────────
const fmtUSD = (v) => 'US$ ' + Number(v).toLocaleString('en-US');

function precoHTML(imv, detalhe = false) {
  const tag = detalhe ? 'p class="imv-detail__price"' : 'p class="imv-card__price"';
  const partes = [];
  if (imv.operacao !== 'aluguel' && imv.precoVenda)
    partes.push(`<${tag}>${fmtUSD(imv.precoVenda)}</p>`);
  if (imv.operacao !== 'venda' && imv.precoAluguel)
    partes.push(`<${tag}>${fmtUSD(imv.precoAluguel)} <small>${t('mes')}</small></p>`);
  if (!partes.length)
    partes.push(`<${tag}>${t('consulta')}</p>`);
  return partes.join('');
}

function badgesHTML(imv) {
  const op = imv.operacao === 'aluguel' ? 'aluguel' : 'venda';
  const opLabel = imv.operacao === 'venda-aluguel' ? t('vendaAluguel')
                : imv.operacao === 'aluguel'       ? t('aluguel') : t('venda');
  let html = `<span class="imv-badge imv-badge--${op}">${opLabel}</span>`;
  if (imv.estagio && imv.estagio !== 'pronto')
    html += `<span class="imv-badge imv-badge--estagio">${t(imv.estagio)}</span>`;
  return html;
}

function featsHTML(imv) {
  const itens = [];
  if (imv.quartos)   itens.push(`<li>${ICONS.bed}${imv.quartos} ${t('quartos')}</li>`);
  if (imv.banheiros) itens.push(`<li>${ICONS.bath}${imv.banheiros} ${t('banheiros')}</li>`);
  if (imv.areaM2)    itens.push(`<li>${ICONS.area}${imv.areaM2} m²</li>`);
  if (imv.vagas)     itens.push(`<li>${ICONS.car}${imv.vagas} ${t('vagas')}</li>`);
  return itens.length ? `<ul class="imv-feats">${itens.join('')}</ul>` : '';
}

const esc = (s) => String(s || '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function localHTML(imv) {
  const loc = [imv.bairro, imv.cidade].filter(Boolean).join(', ');
  return loc ? `<p class="imv-card__loc">${ICONS.pin}${esc(loc)}</p>` : '';
}

function cardHTML(imv) {
  const img = imv.capa
    ? `<img src="${imv.capa}" alt="${esc(imv.titulo)}" loading="lazy" width="600" height="450">`
    : `<div class="imv-noimg">${ICONS.home}</div>`;
  return `
    <article class="imv-card" data-id="${imv.id}" tabindex="0" role="button" aria-label="${esc(imv.titulo)}">
      <div class="imv-card__media">${img}${badgesHTML(imv)}</div>
      <div class="imv-card__body">
        ${precoHTML(imv)}
        <h3 class="imv-card__title">${esc(imv.titulo)}</h3>
        ${localHTML(imv)}
        ${featsHTML(imv)}
      </div>
    </article>`;
}

// ── Carregamento ──────────────────────────────────
let cache = null;

async function carregarImoveis() {
  if (cache) return cache;
  const [snap, configPlano] = await Promise.all([
    getDocs(query(collection(db, 'imoveis'), where('ativo', '==', true))),
    carregarConfigPlano(),
  ]);
  const todos = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  // Acima do limite do plano (ou assinatura em past_due/canceled), os
  // excedentes somem do site público — continuam existindo no Firestore
  // e visíveis no admin, nada é apagado. Mantém a mesma ordenação (mais
  // recentes primeiro), só corta o final da lista.
  const limite = limiteEfetivo(configPlano);
  cache = Number.isFinite(limite) ? todos.slice(0, limite) : todos;
  return cache;
}

// ════════════════════════════════════════════════
// PÁGINA /imoveis — filtros, grid e modal de detalhe
// ════════════════════════════════════════════════
const grid = document.getElementById('imv-grid');

const filtros = {
  operacao: 'todos', tipo: 'todos', cidade: 'todas', quartos: 0, busca: '',
  // filtros avançados (modal)
  precoMin: 0, precoMax: 0, banheiros: 0, areaMin: 0,
  estagios: new Set(), comodidades: new Set(),
};

// normaliza para comparação sem acentos/maiúsculas ("Assunção" → "assuncao")
const normalizar = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// aliases por cidade do filtro — cobre grafias pt/es no campo livre `cidade`
const CIDADE_ALIAS = {
  'asuncion':            ['asuncion', 'assuncao'],
  'luque':               ['luque'],
  'san-lorenzo':         ['san lorenzo', 'sao lourenco'],
  'fernando-de-la-mora': ['fernando de la mora'],
  'lambare':             ['lambare'],
  'mariano-roque-alonso': ['mariano roque alonso'],
  'capiata':             ['capiata'],
  'nemby':               ['nemby'],
  'san-bernardino':      ['san bernardino', 'sao bernardino'],
  'aregua':              ['aregua'],
  'ciudad-del-este':     ['ciudad del este', 'cidade do leste'],
  'encarnacion':         ['encarnacion', 'encarnacao'],
};

function aplicarFiltros(lista) {
  const busca = filtros.busca.trim().toLowerCase();
  return lista.filter(i => {
    if (filtros.operacao !== 'todos') {
      if (i.operacao !== filtros.operacao && i.operacao !== 'venda-aluguel') return false;
    }
    if (filtros.tipo !== 'todos' && i.tipo !== filtros.tipo) return false;
    if (filtros.cidade !== 'todas') {
      const cid = normalizar(i.cidade);
      const alvos = CIDADE_ALIAS[filtros.cidade] || [filtros.cidade.replace(/-/g, ' ')];
      if (!alvos.some(a => cid.includes(a))) return false;
    }
    if (filtros.quartos && (Number(i.quartos) || 0) < filtros.quartos) return false;
    if (filtros.banheiros && (Number(i.banheiros) || 0) < filtros.banheiros) return false;
    if (filtros.areaMin && (Number(i.areaM2) || 0) < filtros.areaMin) return false;
    if (filtros.estagios.size && !filtros.estagios.has(i.estagio || 'pronto')) return false;
    if (filtros.comodidades.size) {
      const coms = i.comodidades || [];
      for (const c of filtros.comodidades) if (!coms.includes(c)) return false;
    }
    if (filtros.precoMin || filtros.precoMax) {
      const min = filtros.precoMin || 0;
      const max = filtros.precoMax || Infinity;
      // compara com o preço da operação filtrada (ou qualquer um dos dois)
      const precos = [];
      if (filtros.operacao !== 'aluguel' && i.precoVenda)   precos.push(Number(i.precoVenda));
      if (filtros.operacao !== 'venda'   && i.precoAluguel) precos.push(Number(i.precoAluguel));
      if (!precos.some(p => p >= min && p <= max)) return false;
    }
    if (busca) {
      const alvo = [i.titulo, i.bairro, i.cidade, i.ref].filter(Boolean).join(' ').toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

function renderGrid() {
  if (!grid || !cache) return;
  const lista = aplicarFiltros(cache);
  if (!lista.length) {
    grid.innerHTML = `<div class="imv-empty">${ICONS.home}<p>${t('vazio')}</p></div>`;
    return;
  }
  grid.innerHTML = lista.map(cardHTML).join('');
}

function renderErro(el) {
  el.innerHTML = `<div class="imv-empty"><p>${t('erro')}</p></div>`;
}

// ── Modal de detalhe ──────────────────────────────
const detailBackdrop = document.getElementById('imv-modal');
let galeria = [];     // dataURLs da galeria aberta
let galeriaIdx = 0;
const fotosCache = {}; // id → [dataURL]

async function carregarFotos(id) {
  if (fotosCache[id]) return fotosCache[id];
  const snap = await getDocs(query(collection(db, 'imoveis', id, 'fotos'), orderBy('ordem')));
  fotosCache[id] = snap.docs.map(d => d.data().data);
  return fotosCache[id];
}

function renderGaleria() {
  const main  = detailBackdrop.querySelector('.imv-detail__main img');
  const count = detailBackdrop.querySelector('.imv-gal-count');
  const thumbs = detailBackdrop.querySelector('.imv-thumbs');
  if (!galeria.length) return;
  main.src = galeria[galeriaIdx];
  count.textContent = `${galeriaIdx + 1} / ${galeria.length}`;
  thumbs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === galeriaIdx));
}

async function abrirDetalhe(id) {
  const imv = cache?.find(i => i.id === id);
  if (!imv || !detailBackdrop) return;

  const loc = [imv.bairro, imv.cidade].filter(Boolean).join(', ');
  const tipoLabel = imv.tipo ? t(imv.tipo) : '';
  const waMsg = encodeURIComponent(t('wa')(imv.titulo + (imv.ref ? ` (${t('ref')} ${imv.ref})` : '')));

  detailBackdrop.querySelector('.imv-detail__info').innerHTML = `
    <div class="imv-detail__badges">${badgesHTML(imv)}</div>
    <h3 id="imv-modal-title">${esc(imv.titulo)}</h3>
    ${loc ? `<p class="imv-card__loc">${ICONS.pin}${esc(loc)}${tipoLabel ? ' · ' + tipoLabel : ''}</p>` : ''}
    ${precoHTML(imv, true)}
    ${featsHTML(imv)}
    ${(imv.comodidades && imv.comodidades.length)
      ? `<div class="imv-detail__coms">${imv.comodidades.map(c =>
          `<span>${ICONS.check}${esc(t('com')[c] || c)}</span>`).join('')}</div>`
      : ''}
    ${imv.descricao ? `<p class="imv-detail__desc">${esc(imv.descricao)}</p>` : ''}
    ${imv.ref ? `<p class="imv-detail__ref">${t('ref')} ${esc(imv.ref)}</p>` : ''}
    <a class="btn btn--whatsapp btn--md imv-detail__cta" target="_blank" rel="noopener"
       href="https://wa.me/${WHATSAPP}?text=${waMsg}"
       onclick="trackEvents && trackEvents.whatsappClick('imovel_detalhe')">
      ${t('cta')}
    </a>`;

  // galeria: capa primeiro, depois fotos da subcoleção
  galeria = imv.capa ? [imv.capa] : [];
  galeriaIdx = 0;
  detailBackdrop.querySelector('.imv-detail__gallery').style.display = galeria.length ? '' : 'none';
  montarThumbs();
  renderGaleria();

  detailBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  window.trackEvents && window.trackEvents.modalOpen('imovel_' + id, imv.titulo);

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

function montarThumbs() {
  const thumbs = detailBackdrop.querySelector('.imv-thumbs');
  const navs   = detailBackdrop.querySelectorAll('.imv-gal-nav');
  thumbs.innerHTML = galeria.map((src, i) =>
    `<button type="button" data-idx="${i}" aria-label="Foto ${i + 1}"><img src="${src}" alt=""></button>`).join('');
  const multi = galeria.length > 1;
  thumbs.style.display = multi ? '' : 'none';
  navs.forEach(n => n.style.display = multi ? '' : 'none');
}

function fecharDetalhe() {
  detailBackdrop.classList.remove('open');
  document.body.style.overflow = '';
  if (location.hash) history.replaceState(null, '', location.pathname);
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

  // swipe na galeria (mobile)
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

// ── Modal de filtros avançados (estilo Airbnb) ────
const fModal = document.getElementById('imv-filtros-modal');

function renderChipsFiltros() {
  if (!fModal) return;
  const qts = document.getElementById('imv-filtro-quartos-modal');
  qts.innerHTML = [0, 1, 2, 3, 4].map(n =>
    `<button type="button" data-val="${n}" class="${filtros.quartos === n ? 'active' : ''}">${n === 0 ? t('qualquer') : n + '+'}</button>`).join('');

  const ban = document.getElementById('imv-filtro-banheiros');
  ban.innerHTML = [0, 1, 2, 3, 4].map(n =>
    `<button type="button" data-val="${n}" class="${filtros.banheiros === n ? 'active' : ''}">${n === 0 ? t('qualquer') : n + '+'}</button>`).join('');

  const est = document.getElementById('imv-filtro-estagio');
  est.innerHTML = ['pronto', 'construcao', 'planta'].map(e =>
    `<button type="button" data-val="${e}" class="${filtros.estagios.has(e) ? 'active' : ''}">${t(e)}</button>`).join('');

  const com = document.getElementById('imv-filtro-comodidades');
  com.innerHTML = COMODIDADES.map(c =>
    `<button type="button" data-val="${c}" class="${filtros.comodidades.has(c) ? 'active' : ''}">${t('com')[c]}</button>`).join('');
}

function contarFiltrosModal() {
  let n = 0;
  if (filtros.precoMin || filtros.precoMax) n++;
  if (filtros.banheiros) n++;
  if (filtros.areaMin) n++;
  return n + filtros.estagios.size + filtros.comodidades.size;
}

function atualizarFiltrosUI() {
  const aplicar = document.getElementById('imv-filtros-aplicar');
  if (aplicar && cache) aplicar.textContent = t('mostrar')(aplicarFiltros(cache).length);
  const badge = document.getElementById('imv-filtros-badge');
  if (badge) {
    const n = contarFiltrosModal();
    badge.hidden = !n;
    badge.textContent = n;
  }
}

function aoMudarFiltros() {
  renderGrid();
  atualizarFiltrosUI();
}

function abrirFiltros() {
  renderChipsFiltros();
  atualizarFiltrosUI();
  fModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function fecharFiltros() {
  fModal.classList.remove('open');
  document.body.style.overflow = '';
}

function initFiltrosModal() {
  if (!fModal) return;

  document.getElementById('imv-filtros-btn')?.addEventListener('click', abrirFiltros);
  fModal.querySelector('.modal__close').addEventListener('click', fecharFiltros);
  fModal.addEventListener('click', e => { if (e.target === fModal) fecharFiltros(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && fModal.classList.contains('open')) fecharFiltros();
  });

  // chips: quartos e banheiros (seleção única), estágio e comodidades (múltipla)
  document.getElementById('imv-filtro-quartos-modal').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    filtros.quartos = Number(btn.dataset.val);
    sincronizarQuartosBar();
    renderChipsFiltros();
    aoMudarFiltros();
  });
  document.getElementById('imv-filtro-banheiros').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    filtros.banheiros = Number(btn.dataset.val);
    renderChipsFiltros();
    aoMudarFiltros();
  });
  document.getElementById('imv-filtro-estagio').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    const v = btn.dataset.val;
    filtros.estagios.has(v) ? filtros.estagios.delete(v) : filtros.estagios.add(v);
    btn.classList.toggle('active');
    aoMudarFiltros();
  });
  document.getElementById('imv-filtro-comodidades').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    const v = btn.dataset.val;
    filtros.comodidades.has(v) ? filtros.comodidades.delete(v) : filtros.comodidades.add(v);
    btn.classList.toggle('active');
    aoMudarFiltros();
  });

  // preço e área
  const precoMin = document.getElementById('imv-filtro-preco-min');
  const precoMax = document.getElementById('imv-filtro-preco-max');
  const areaMin  = document.getElementById('imv-filtro-area');
  precoMin.addEventListener('input', () => { filtros.precoMin = Number(precoMin.value) || 0; aoMudarFiltros(); });
  precoMax.addEventListener('input', () => { filtros.precoMax = Number(precoMax.value) || 0; aoMudarFiltros(); });
  areaMin.addEventListener('input',  () => { filtros.areaMin  = Number(areaMin.value)  || 0; aoMudarFiltros(); });

  // limpar tudo / aplicar
  document.getElementById('imv-filtros-limpar').addEventListener('click', () => {
    filtros.precoMin = filtros.precoMax = filtros.quartos = filtros.banheiros = filtros.areaMin = 0;
    filtros.estagios.clear();
    filtros.comodidades.clear();
    precoMin.value = precoMax.value = areaMin.value = '';
    sincronizarQuartosBar();
    renderChipsFiltros();
    aoMudarFiltros();
  });
  document.getElementById('imv-filtros-aplicar').addEventListener('click', fecharFiltros);
}

// ── Filtros (página /imoveis) ─────────────────────
// mantém o select de quartos da barra em sincronia com os chips do modal
function sincronizarQuartosBar() {
  const qts = document.getElementById('imv-filtro-quartos');
  if (qts) qts.value = String(filtros.quartos);
}

function initFiltros() {
  const pills  = document.querySelectorAll('.imv-pills button');
  const tipo   = document.getElementById('imv-filtro-tipo');
  const cidade = document.getElementById('imv-filtro-cidade');
  const qts    = document.getElementById('imv-filtro-quartos');
  const busca  = document.getElementById('imv-filtro-busca');

  pills.forEach(btn => btn.addEventListener('click', () => {
    pills.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtros.operacao = btn.dataset.op;
    aoMudarFiltros();
  }));
  tipo?.addEventListener('change',   () => { filtros.tipo = tipo.value; aoMudarFiltros(); });
  cidade?.addEventListener('change', () => { filtros.cidade = cidade.value; aoMudarFiltros(); });
  qts?.addEventListener('change',  () => { filtros.quartos = Number(qts.value); aoMudarFiltros(); });
  busca?.addEventListener('input', () => { filtros.busca = busca.value; aoMudarFiltros(); });
}

// ════════════════════════════════════════════════
// DESTAQUES — home (index.html)
// ════════════════════════════════════════════════
async function initDestaques(container) {
  try {
    const lista = await carregarImoveis();
    const destaques = lista.filter(i => i.destaque).slice(0, 3);
    const exibir = destaques.length ? destaques : lista.slice(0, 3);
    const secao = document.getElementById('imoveis-home');
    if (!exibir.length) { if (secao) secao.style.display = 'none'; return; }
    container.innerHTML = exibir.map(cardHTML).join('');
    container.addEventListener('click', e => {
      const card = e.target.closest('.imv-card');
      if (card) location.href = 'imoveis.html#' + card.dataset.id;
    });
  } catch (e) {
    console.error('Erro ao carregar destaques:', e);
    const secao = document.getElementById('imoveis-home');
    if (secao) secao.style.display = 'none';
  }
}

// ════════════════════════════════════════════════
// Init
// ════════════════════════════════════════════════
async function initPagina() {
  initFiltros();
  initFiltrosModal();
  initDetalhe();

  grid.addEventListener('click', e => {
    const card = e.target.closest('.imv-card');
    if (card) abrirDetalhe(card.dataset.id);
  });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.imv-card');
    if (card) { e.preventDefault(); abrirDetalhe(card.dataset.id); }
  });

  try {
    await carregarImoveis();
    renderGrid();
    atualizarFiltrosUI();
    // deep-link: imoveis.html#<id> abre o detalhe direto
    const id = location.hash.slice(1);
    if (id && cache.some(i => i.id === id)) abrirDetalhe(id);
  } catch (e) {
    console.error('Erro ao carregar imóveis:', e);
    renderErro(grid);
  }
}

// re-renderiza textos gerados em JS ao trocar de idioma
document.addEventListener('click', e => {
  if (e.target.closest('.lang-switcher button')) {
    setTimeout(() => {
      renderGrid();
      if (fModal) { renderChipsFiltros(); atualizarFiltrosUI(); }
      const dest = document.getElementById('destaques-grid');
      if (dest && cache) initDestaques(dest);
    }, 0);
  }
});

if (grid) initPagina();
const destaquesGrid = document.getElementById('destaques-grid');
if (destaquesGrid) initDestaques(destaquesGrid);
