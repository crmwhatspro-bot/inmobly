// ════════════════════════════════════════════════
// interno-metricas.html — app administrativo interno da equipe Punto
// Alto: aquisição (visitas → contas → assinantes), contas em teste,
// assinantes e uso do produto.
//
// NÃO usa shell.js/initShell de propósito: aquele shell é o painel de
// CADA corretor (auth-gate por custom claim tenantId, sidebar de
// plano/imóveis). Aqui o gate é outro — e-mail na allowlist de
// equipe.js — e quem entra normalmente NÃO tem tenant nenhum, então
// o gate de lá mandaria a gente pra criar-conta.html.
//
// ── Como adicionar uma view nova ────────────────────────
// 1. `<section class="view" data-view="minha-view" hidden>` no HTML,
//    com os contêineres vazios que ela vai preencher;
// 2. uma entrada no registro VIEWS abaixo (label, ícone, render).
// A sidebar, o roteamento por hash, o título da topbar e o filtro de
// período saem disso automaticamente. Os helpers de componente
// (cardsHTML, tabelaHTML, funilHTML, barraDistHTML) cobrem o visual
// sem precisar de CSS novo.
//
// Todo dado vem de query direta no Firestore, do navegador: isTeam()
// nas rules já libera `read` (inclusive list/query) em brokers/* e
// analytics_visits/*. Suficiente pro volume atual — ver o rodapé da
// sidebar e a nota de escala no README.
// ════════════════════════════════════════════════
import { db, loginWithGoogle, logout, onAuthChange } from './firebase.js';
import { EQUIPE, ehDaEquipe } from './equipe.js';
import { collection, getDocs, query, where, orderBy, limit }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

// USD/mês por plano — mesmos preços de planos.html. 'trial' não entra
// no MRR (é justamente quem ainda não paga).
const PRECOS = { starter: 79, pro: 129 };

// 10.000 é o teto RÍGIDO do Firestore pra `limit()` numa structured
// query — pedir mais não trunca, a query inteira falha. Não aumentar:
// quando 10k visitas por período virar pouco, o caminho é o agregado
// diário (metrics_daily), não um limite maior.
const MAX_VISITAS = 10000;

const DIA_MS = 24 * 60 * 60 * 1000;

const ICONS = {
  visao:      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  aquisicao:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  trials:     '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  assinantes: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  contas:     '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>',
  contatos:   '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
  produto:    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
};

// ── Estado ───────────────────────────────────────────────
let periodoKey = '30d';   // chave em PERIODOS, ou 'personalizado'
let periodoCustom = null; // { inicio: Date, fim: Date } quando personalizado
let viewAtual = 'visao-geral';
let modelo = null;        // último resultado de calcular(), pra trocar de view sem refetch
let usuario = null;
let carregando = false;
let filtroTrials = 'abertos';
let filtroAssinantes = 'active';

// ── Helpers de dado ──────────────────────────────────────

// createdAt/trialEndsAt vêm como Timestamp do Firestore, mas docs
// antigos (ou gravados por outro caminho) podem ter Date ou string —
// normaliza tudo pra Date, ou null se não der.
function paraData(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return isNaN(v) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Uma FAIXA é { inicio, fim }, cada lado podendo ser null = sem limite
// daquele lado. Quase todo preset é aberto no fim ("até agora") e só
// carrega `inicio`; os fechados — mês passado e personalizado — são os
// únicos que precisam dos dois, e foram eles que obrigaram o painel a
// deixar de pensar em "quantos dias atrás".
function dentroDaFaixa(data, faixa) {
  if (!data) return false;
  if (faixa.inicio && data < faixa.inicio) return false;
  if (faixa.fim && data > faixa.fim) return false;
  return true;
}

const num = (n) => new Intl.NumberFormat('pt-BR').format(n);
const usd = (n) => 'USD ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(n));

// Divisão que não estoura em 0/0 nem imprime "NaN%" na tela.
function taxa(parte, total) {
  if (!total) return '—';
  return (parte / total * 100).toFixed(parte / total < 0.1 ? 1 : 0) + '%';
}

const dataCurta = (d) => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

// Diferença em dias inteiros, positiva no futuro e negativa no
// passado — e os dois lados arredondam pra lados diferentes de
// propósito:
//   futuro  → pra CIMA: faltando 5 horas ainda é "falta 1 dia", nunca 0;
//   passado → pra BAIXO em módulo: são dias COMPLETOS já decorridos.
// Arredondar o módulo pra cima nos dois lados (o que parecia simétrico)
// fazia um evento de exatamente 5 dias atrás virar "há 6 dias", porque
// os milissegundos passados desde então empurravam o ceil pro próximo
// inteiro.
function diasAte(data) {
  if (!data) return null;
  const ms = data.getTime() - Date.now();
  return ms >= 0 ? Math.ceil(ms / DIA_MS) : -Math.floor(-ms / DIA_MS);
}

function haQuantoTempo(data) {
  if (!data) return '—';
  const d = Math.abs(diasAte(data));
  if (d <= 1) return 'hoje';
  if (d < 30) return `há ${d} dias`;
  if (d < 365) return `há ${Math.round(d / 30)} meses`;
  return `há ${Math.round(d / 365)} anos`;
}

// Chave de dia em horário local — o agrupamento do gráfico tem que
// bater com o que a equipe vê no relógio, não com UTC.
function chaveDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function meiaNoite(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Fim do dia inclusive: a faixa fechada vai até 23:59:59.999, senão
// `ts <= fim` com fim à meia-noite jogaria fora o último dia inteiro.
function fimDoDia(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

const somaDias = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// ── Período ──────────────────────────────────────────────
// O registro dos presets do seletor. `faixa()` devolve a janela de
// AGORA (recalculada a cada carregamento: "hoje" tem que virar junto
// com o relógio, não ficar preso na data em que a aba foi aberta).
// `separador` desenha a linha fina acima da opção no menu.
//
// Semana começando no DOMINGO, que é o que getDay() já numera como 0 —
// se um dia isso virar segunda, o ajuste é `(getDay() + 6) % 7`.
const PERIODOS = [
  { key: 'hoje', label: 'Hoje',            faixa: () => ({ inicio: meiaNoite(new Date()) }) },
  { key: '7d',   label: 'Últimos 7 dias',  faixa: () => ({ inicio: somaDias(meiaNoite(new Date()), -6) }) },
  { key: '30d',  label: 'Últimos 30 dias', faixa: () => ({ inicio: somaDias(meiaNoite(new Date()), -29) }) },
  { key: '90d',  label: 'Últimos 90 dias', faixa: () => ({ inicio: somaDias(meiaNoite(new Date()), -89) }) },
  {
    key: 'semana', label: 'Esta semana', separador: true,
    faixa: () => { const h = meiaNoite(new Date()); return { inicio: somaDias(h, -h.getDay()) }; },
  },
  {
    key: 'mes', label: 'Este mês',
    faixa: () => { const h = meiaNoite(new Date()); return { inicio: new Date(h.getFullYear(), h.getMonth(), 1) }; },
  },
  {
    key: 'mesPassado', label: 'Mês passado',
    // new Date(ano, mês, 0) é o último dia do mês anterior — inclusive
    // em janeiro, onde o mês -1 vira dezembro do ano passado sozinho.
    faixa: () => {
      const h = meiaNoite(new Date());
      return {
        inicio: new Date(h.getFullYear(), h.getMonth() - 1, 1),
        fim: fimDoDia(new Date(h.getFullYear(), h.getMonth(), 0)),
      };
    },
  },
  { key: 'tudo', label: 'Desde o começo', separador: true, faixa: () => ({}) },
];

const PERIODO_PADRAO = '30d';
const PERIODO_CHAVE_STORAGE = 'interno-metricas:periodo';

const periodoPorKey = (key) => PERIODOS.find((p) => p.key === key);

function faixaAtual() {
  if (periodoKey === 'personalizado' && periodoCustom) {
    return { inicio: periodoCustom.inicio, fim: periodoCustom.fim };
  }
  const f = (periodoPorKey(periodoKey) || periodoPorKey(PERIODO_PADRAO)).faixa();
  return { inicio: f.inicio || null, fim: f.fim || null };
}

function rotuloDoPeriodo() {
  if (periodoKey === 'personalizado' && periodoCustom) {
    return `${dataCurta(periodoCustom.inicio)} – ${dataCurta(periodoCustom.fim)}`;
  }
  return (periodoPorKey(periodoKey) || periodoPorKey(PERIODO_PADRAO)).label;
}

// localStorage pode lançar (modo privado, cota) e o conteúdo pode ser
// lixo de uma versão anterior — nos dois casos o filtro só volta pro
// padrão, nada quebra.
function salvarPeriodo() {
  try {
    localStorage.setItem(PERIODO_CHAVE_STORAGE, JSON.stringify(
      periodoKey === 'personalizado' && periodoCustom
        ? { key: 'personalizado', de: chaveDia(periodoCustom.inicio), ate: chaveDia(periodoCustom.fim) }
        : { key: periodoKey }
    ));
  } catch { /* sem persistência; o filtro continua funcionando na sessão */ }
}

function restaurarPeriodo() {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(PERIODO_CHAVE_STORAGE) || 'null'); } catch { return; }
  if (!salvo) return;
  if (salvo.key === 'personalizado' && salvo.de && salvo.ate) {
    const de = new Date(`${salvo.de}T00:00:00`);
    const ate = new Date(`${salvo.ate}T00:00:00`);
    if (isNaN(de) || isNaN(ate)) return;
    periodoKey = 'personalizado';
    periodoCustom = { inicio: de, fim: fimDoDia(ate) };
    return;
  }
  if (periodoPorKey(salvo.key)) periodoKey = salvo.key;
}

// Tudo que vai pro innerHTML passa por aqui — e-mail, nome de tenant e
// utm_source vêm de input de usuário, ainda que só a equipe veja.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// De onde veio a visita, em uma palavra. utm_source manda (é o que a
// gente mesmo carimba nas campanhas); sem ele, o host do referrer; sem
// nada, é tráfego direto.
const canalDaVisita = (v) => v.utmSource || v.referrerHost || 'direto';

const mensalidade = (b) => PRECOS[b.plan] || 0;

// ── Helpers de componente ────────────────────────────────
// São eles que fazem "view nova não precisar de CSS novo".

const cardHTML = ({ label, valor, nota }) => `
  <div class="card">
    <p class="card__label">${esc(label)}</p>
    <p class="card__valor">${esc(valor)}</p>
    ${nota ? `<p class="card__nota">${esc(nota)}</p>` : ''}
  </div>`;

const cardsHTML = (lista) => lista.map(cardHTML).join('');

/**
 * colunas: [{ titulo, num? }] — `num` alinha à direita.
 * linhas:  array de arrays de células **já em HTML** (use esc() no
 *          conteúdo vindo de dado). Ordem igual à de colunas.
 */
function tabelaHTML(colunas, linhas, vazio = 'Nada por aqui.') {
  if (!linhas.length) return `<p class="tabela__vazio">${esc(vazio)}</p>`;
  const cab = colunas.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.titulo)}</th>`).join('');
  const corpo = linhas.map((l) =>
    `<tr>${l.map((cel, i) => `<td${colunas[i]?.num ? ' class="num"' : ''}>${cel}</td>`).join('')}</tr>`
  ).join('');
  return `<table class="tabela"><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>`;
}

const tagHTML = (texto, variante) => `<span class="tag tag--${esc(variante)}">${esc(texto)}</span>`;

/** etapas: [{ nome, valor, taxa? }] — barras proporcionais ao topo. */
function funilHTML(etapas) {
  const topo = Math.max(...etapas.map((e) => e.valor), 1);
  return etapas.map((e) => `
    <div class="funil__etapa">
      <span class="funil__nome">${esc(e.nome)}</span>
      <span class="funil__trilho"><span class="funil__preenchimento" style="width:${Math.max(1, e.valor / topo * 100)}%"></span></span>
      <span class="funil__num">${num(e.valor)}${e.taxa ? `<span class="funil__taxa">${esc(e.taxa)}</span>` : ''}</span>
    </div>`).join('');
}

/** linhas: [{ nome, valor, extra? }] — barra proporcional ao maior. */
function barraDistHTML(linhas) {
  if (!linhas.length) return '<p class="tabela__vazio">Sem dados.</p>';
  const topo = Math.max(...linhas.map((l) => l.valor), 1);
  return linhas.map((l) => `
    <div class="barra-dist__linha">
      <span class="barra-dist__nome">${esc(l.nome)}</span>
      <span class="barra-dist__trilho"><span class="barra-dist__fill" style="width:${Math.max(2, l.valor / topo * 100)}%"></span></span>
      <span class="barra-dist__num">${num(l.valor)}${l.extra ? ` <span class="funil__taxa">${esc(l.extra)}</span>` : ''}</span>
    </div>`).join('');
}

// ── Gráfico de linhas ────────────────────────────────────
// Um componente só pra todos os gráficos de tempo do painel. Recebe a
// série diária densa (ver serieDiaria) e uma lista de PAINÉIS; cada
// painel é um plot com o próprio eixo Y, e todos dividem o mesmo eixo X
// e o mesmo cursor.
//
// Por que painéis separados e não todas as linhas num plot só: visitas
// vivem na casa dos milhares e assinaturas na casa de 0–2. No mesmo
// eixo, a segunda vira uma reta colada no chão. E a saída "óbvia" —
// dois eixos Y, um de cada lado — é pior: a razão entre as duas escalas
// é arbitrária, então onde as linhas se cruzam passa a contar uma
// história que o dado não tem. (Era exatamente esse o defeito das
// barras antigas, que escalavam cada série pelo próprio máximo.)
// Dois plots empilhados mantêm a comparação de FORMA — os picos batem
// no mesmo dia? — sem inventar uma comparação de volume.

const GL_GUTTER = 40;   // px de eixo Y à esquerda; alinha os painéis entre si
const GL_PAD_T = 8;     // folga pro traço de 2px não ser cortado no topo
const GL_PAD_B = 3;

// Teto "redondo" pro eixo, sempre par: eixo terminando em 37 não ajuda
// ninguém, e a linha do meio precisa cair num número inteiro.
function escalaTopo(max) {
  if (max <= 10) return Math.max(2, Math.ceil(max / 2) * 2);
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  return (n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * exp;
}

const numCurto = (n) => n >= 1000
  ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace('.', ',') + 'k'
  : num(n);

const rotuloEixoX = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const rotuloDiaCheio = (d) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

/**
 * serie:   [{ data: Date, <chave>: number, … }] — densa e ordenada.
 * paineis: [{ titulo?, nota?, altura?, series: [{ chave, nome, cor, descricao? }] }]
 */
function graficoLinhas(el, { serie, paineis, vazio = 'Sem dados no período.' }) {
  if (!serie.length) { el.innerHTML = `<p class="tabela__vazio">${esc(vazio)}</p>`; return; }

  const n = serie.length;
  // Um ponto só (período "tudo" sem dado nenhum) não desenha traço
  // algum: vira uma reta atravessando o plot, no meio do eixo.
  const xFrac = (i) => n === 1 ? 0.5 : i / (n - 1);

  // A geometria de cada painel é calculada uma vez e reaproveitada
  // pelos pontos de hover, que são HTML e não SVG (o SVG usa
  // preserveAspectRatio="none" pra esticar sem medir largura em JS, e
  // isso achataria qualquer círculo desenhado dentro dele).
  const geo = paineis.map((p) => {
    const altura = p.altura || 130;
    // reduce e não Math.max(...spread): a série "desde o começo" pode
    // passar de mil dias × 3 séries, e aí o spread estoura a pilha.
    const pico = serie.reduce((m, d) => p.series.reduce((mm, s) => Math.max(mm, d[s.chave]), m), 0);
    const topo = escalaTopo(pico);
    const y = (v) => GL_PAD_T + (1 - v / topo) * (altura - GL_PAD_T - GL_PAD_B);
    return { ...p, altura, topo, y };
  });

  const caminho = (g, chave) => {
    if (n === 1) return `M0,${g.y(serie[0][chave]).toFixed(1)} L1000,${g.y(serie[0][chave]).toFixed(1)}`;
    return serie.map((d, i) =>
      `${i ? 'L' : 'M'}${(xFrac(i) * 1000).toFixed(1)},${g.y(d[chave]).toFixed(1)}`).join(' ');
  };

  const legendaHTML = (g) => g.series.map((s) => `
    <span class="gl__item">
      <span class="gl__key" style="background:${s.cor}"></span>
      <span class="gl__nome">${esc(s.nome)}</span>
      ${s.descricao ? `<span class="gl__desc">${esc(s.descricao)}</span>` : ''}
    </span>`).join('');

  // Série única não ganha legenda: o título da seção já diz o que está
  // plotado, e uma caixa com um item só repete o título.
  const painelHTML = (g) => `
    <div class="gl__painel">
      ${g.titulo || g.series.length > 1 ? `
        <div class="gl__cab">
          ${g.titulo ? `<span class="gl__painel-titulo">${esc(g.titulo)}</span>` : ''}
          ${g.nota ? `<span class="gl__painel-nota">${esc(g.nota)}</span>` : ''}
          ${g.series.length > 1 ? `<div class="gl__legenda">${legendaHTML(g)}</div>` : ''}
        </div>` : ''}
      <div class="gl__plot" style="height:${g.altura}px">
        <div class="gl__eixoY">
          ${[g.topo, g.topo / 2, 0].map((v) =>
            `<span class="gl__y" style="top:${g.y(v).toFixed(1)}px">${esc(numCurto(v))}</span>`).join('')}
        </div>
        <svg class="gl__svg" viewBox="0 0 1000 ${g.altura}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          ${[g.topo, g.topo / 2, 0].map((v) =>
            `<line class="gl__grade" x1="0" x2="1000" y1="${g.y(v).toFixed(1)}" y2="${g.y(v).toFixed(1)}" vector-effect="non-scaling-stroke"/>`).join('')}
          ${g.series.map((s) =>
            `<path class="gl__linha" d="${caminho(g, s.chave)}" stroke="${s.cor}" vector-effect="non-scaling-stroke"/>`).join('')}
        </svg>
        <div class="gl__sobrepor">
          <span class="gl__cursor" hidden></span>
          ${g.series.map((s) => `<span class="gl__ponto" style="background:${s.cor}" hidden></span>`).join('')}
        </div>
      </div>
    </div>`;

  // ~6 marcas no eixo X, com as pontas encostadas nas bordas pra não
  // vazarem do contêiner.
  const qtdMarcas = Math.min(6, n);
  const marcas = [...new Set(Array.from({ length: qtdMarcas }, (_, k) =>
    Math.round(k * (n - 1) / Math.max(1, qtdMarcas - 1))))];
  const eixoXHTML = marcas.map((i) => {
    const pos = i === 0 ? 'left:0;transform:none'
      : i === n - 1 ? 'left:auto;right:0;transform:none'
      : `left:${(xFrac(i) * 100).toFixed(3)}%`;
    return `<span class="gl__x" style="${pos}">${esc(rotuloEixoX(serie[i].data))}</span>`;
  }).join('');

  const todasSeries = geo.flatMap((g) => g.series);

  const raiz = document.createElement('div');
  raiz.className = 'gl';
  raiz.tabIndex = 0;
  raiz.setAttribute('role', 'group');
  raiz.setAttribute('aria-label',
    `Série diária de ${todasSeries.map((s) => s.nome).join(', ')}. Use as setas para percorrer os dias.`);
  raiz.innerHTML = `
    ${geo.map(painelHTML).join('')}
    <div class="gl__eixoX">${eixoXHTML}</div>
    <div class="gl__tip" hidden></div>`;

  const tip = raiz.querySelector('.gl__tip');
  const primeiroSvg = raiz.querySelector('.gl__svg');
  const cursores = [...raiz.querySelectorAll('.gl__cursor')];
  const pontos = [...raiz.querySelectorAll('.gl__painel')]
    .map((p) => [...p.querySelectorAll('.gl__ponto')]);

  // Nomes de série são fixos aqui, mas o rótulo do dia vem de dado —
  // tooltip inteiro montado com textContent, nunca innerHTML.
  function conteudoTip(i) {
    const frag = document.createDocumentFragment();
    const cab = document.createElement('p');
    cab.className = 'gl__tip-dia';
    cab.textContent = rotuloDiaCheio(serie[i].data);
    frag.appendChild(cab);
    todasSeries.forEach((s) => {
      const linha = document.createElement('div');
      linha.className = 'gl__tip-linha';
      const key = document.createElement('span');
      key.className = 'gl__key';
      key.style.background = s.cor;
      const valor = document.createElement('span');
      valor.className = 'gl__tip-valor';
      valor.textContent = num(serie[i][s.chave]);
      const nome = document.createElement('span');
      nome.className = 'gl__tip-nome';
      nome.textContent = s.nome;
      linha.append(key, valor, nome);
      frag.appendChild(linha);
    });
    return frag;
  }

  function marcar(i) {
    const pct = `${(xFrac(i) * 100).toFixed(3)}%`;
    cursores.forEach((c) => { c.hidden = false; c.style.left = pct; });
    geo.forEach((g, gi) => g.series.forEach((s, si) => {
      const p = pontos[gi][si];
      p.hidden = false;
      p.style.left = pct;
      p.style.top = `${g.y(serie[i][s.chave]).toFixed(1)}px`;
    }));
    tip.hidden = false;
    tip.replaceChildren(conteudoTip(i));
  }

  function posicionarTip(clientX, clientY) {
    const r = raiz.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    // Vira pro outro lado do cursor quando não cabe à direita.
    const esquerda = x + 16 + tip.offsetWidth > r.width ? x - 16 - tip.offsetWidth : x + 16;
    tip.style.left = `${Math.max(0, esquerda)}px`;
    tip.style.top = `${Math.max(0, Math.min(y - 12, r.height - tip.offsetHeight))}px`;
  }

  // O cursor gruda no dia mais próximo: o leitor mira numa data, nunca
  // num traço de 2px.
  function indiceDe(clientX) {
    const r = primeiroSvg.getBoundingClientRect();
    const f = (clientX - r.left) / (r.width || 1);
    return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  }

  function limpar() {
    atual = -1;
    tip.hidden = true;
    cursores.forEach((c) => { c.hidden = true; });
    pontos.flat().forEach((p) => { p.hidden = true; });
  }

  // Teclado vê o mesmo que o mouse — o tooltip é enfeite, não é o
  // único caminho pro número (o <details> abaixo também não é).
  function tipNoCursor() {
    const r = primeiroSvg.getBoundingClientRect();
    posicionarTip(r.left + xFrac(atual) * r.width, r.top);
  }

  let atual = -1;
  raiz.addEventListener('pointermove', (e) => {
    const i = indiceDe(e.clientX);
    if (i !== atual) { atual = i; marcar(i); }
    posicionarTip(e.clientX, e.clientY);
  });
  raiz.addEventListener('pointerleave', limpar);
  raiz.addEventListener('blur', limpar);
  raiz.addEventListener('focus', () => { atual = n - 1; marcar(atual); tipNoCursor(); });
  raiz.addEventListener('keydown', (e) => {
    const passo = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!passo) return;
    e.preventDefault();
    atual = Math.max(0, Math.min(n - 1, (atual < 0 ? n - 1 : atual) + passo));
    marcar(atual);
    tipNoCursor();
  });

  // Tabela de apoio: todo valor do gráfico alcançável sem hover.
  const dados = document.createElement('details');
  dados.className = 'gl__dados';
  dados.innerHTML = `<summary>Ver os números</summary><div class="tabela-wrap">${tabelaHTML(
    [{ titulo: 'Dia' }, ...todasSeries.map((s) => ({ titulo: s.nome, num: true }))],
    [...serie].reverse().map((d) => [
      esc(d.data.toLocaleDateString('pt-BR')),
      ...todasSeries.map((s) => num(d[s.chave])),
    ])
  )}</div>`;

  el.replaceChildren(raiz, dados);
}

// ── Carregamento ─────────────────────────────────────────

async function carregarBrokers() {
  const snap = await getDocs(collection(db, 'brokers'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Os dois lados da faixa filtram o MESMO campo (ts), que é também o do
// orderBy — isso continua sendo índice de campo único, o que o
// Firestore cria sozinho. Não adicionar filtro por outro campo aqui sem
// antes declarar o índice composto em firestore.indexes.json.
function porFaixa(col, faixa) {
  const filtros = [];
  if (faixa.inicio) filtros.push(where('ts', '>=', faixa.inicio));
  if (faixa.fim) filtros.push(where('ts', '<=', faixa.fim));
  return query(col, ...filtros, orderBy('ts', 'desc'), limit(MAX_VISITAS));
}

async function carregarVisitas(faixa) {
  const snap = await getDocs(porFaixa(collection(db, 'analytics_visits'), faixa));
  return snap.docs.map((d) => ({ ...d.data(), tsData: paraData(d.data().ts) }));
}

// Cliques de contato nos catálogos (analytics_events). Mesma forma de
// query e o mesmo teto de 10k da de visitas — contato é bem mais raro
// que pageview, então na prática esse teto sobra.
async function carregarEventos(faixa) {
  const snap = await getDocs(porFaixa(collection(db, 'analytics_events'), faixa));
  return snap.docs.map((d) => ({ ...d.data(), tsData: paraData(d.data().ts) }));
}

// ── Cálculo ──────────────────────────────────────────────

/**
 * Série diária DENSA: um ponto por dia do período, com zero nos dias em
 * que nada aconteceu. Densidade não é capricho — num gráfico de linha,
 * pular os dias vazios distorce o eixo (dois picos separados por uma
 * semana morta ficariam colados, como se fossem consecutivos).
 *
 * Sem filtro de data, o começo é o dia mais antigo com dado; o fim é
 * sempre hoje, mesmo que hoje ainda esteja zerado.
 */
function serieDiaria(faixa, visitas, contasPeriodo, ativados, eventos) {
  const balde = new Map();
  const garante = (k) => {
    if (!balde.has(k)) balde.set(k, { visitas: 0, visitantes: new Set(), contas: 0, assinaturas: 0, contatos: 0 });
    return balde.get(k);
  };
  visitas.forEach((v) => {
    if (!v.tsData) return;
    const b = garante(chaveDia(v.tsData));
    b.visitas++;
    if (v.visitorId) b.visitantes.add(v.visitorId);
  });
  contasPeriodo.forEach((b) => { if (b._criada) garante(chaveDia(b._criada)).contas++; });
  ativados.forEach((b) => { if (b._ativou) garante(chaveDia(b._ativou)).assinaturas++; });
  eventos.forEach((e) => { if (e.tsData) garante(chaveDia(e.tsData)).contatos++; });

  const chaves = [...balde.keys()].sort();
  // Faixa fechada para no próprio fim; aberta vai até hoje, mesmo que
  // hoje ainda esteja zerado.
  const fim = meiaNoite(faixa.fim || new Date());
  const cursor = faixa.inicio
    ? meiaNoite(faixa.inicio)
    : (chaves.length ? new Date(`${chaves[0]}T00:00:00`) : new Date(fim));

  const out = [];
  for (; cursor <= fim; cursor.setDate(cursor.getDate() + 1)) {
    const b = balde.get(chaveDia(cursor));
    out.push({
      data: new Date(cursor),
      visitas: b?.visitas || 0,
      visitantes: b?.visitantes.size || 0,
      contas: b?.contas || 0,
      assinaturas: b?.assinaturas || 0,
      contatos: b?.contatos || 0,
    });
  }
  return out;
}

function calcular(brokers, visitas, eventos, faixa) {
  const agora = new Date();

  // Campos de data normalizados uma vez só — cada view usava paraData()
  // de novo no render e isso multiplicava a conversão por linha.
  const contas = brokers.map((b) => ({
    ...b,
    _criada:  paraData(b.createdAt),
    _trialFim: paraData(b.trialEndsAt),
    _ativou:  paraData(b.activatedAt),
    _cancelou: paraData(b.canceledAt),
    _ativa:   paraData(b.lastActiveAt),
  }));

  // ---- Topo de funil
  const visitantes = new Set(visitas.map((v) => v.visitorId).filter(Boolean));
  const sessoes    = new Set(visitas.map((v) => v.sessionId).filter(Boolean));

  // visitorId → canal da PRIMEIRA visita dele (as visitas vêm em ordem
  // decrescente de ts, então sobrescrever a cada iteração deixa a mais
  // antiga por último = a que fica). First-touch, igual atribuicao.js.
  const canalPorVisitante = new Map();
  visitas.forEach((v) => { if (v.visitorId) canalPorVisitante.set(v.visitorId, canalDaVisita(v)); });

  const contasPeriodo = contas.filter((b) => dentroDaFaixa(b._criada, faixa));
  // "Visita virou conta": o join que o vid habilita — só conta se o
  // visitante que originou a conta aparece nas visitas DESTE período.
  const contasAtribuidas = contasPeriodo.filter((b) => b.acquisitionVisitorId && visitantes.has(b.acquisitionVisitorId));

  // ---- Assinaturas
  // activatedAt/canceledAt só passaram a ser gravados quando o painel
  // foi construído — quem já era 'active' antes não tem o campo e não
  // entra no movimento do período (mas entra no snapshot de ativos).
  const ativados  = contas.filter((b) => dentroDaFaixa(b._ativou, faixa));
  const cancelados = contas.filter((b) => dentroDaFaixa(b._cancelou, faixa));
  const ativos    = contas.filter((b) => b.status === 'active');
  const pastDue   = contas.filter((b) => b.status === 'past_due');
  const canceladosTotal = contas.filter((b) => b.status === 'canceled');
  const semActivatedAt = ativos.filter((b) => !b._ativou).length;

  const porPlano = {};
  ativos.forEach((b) => { porPlano[b.plan || '?'] = (porPlano[b.plan || '?'] || 0) + 1; });
  const mrr = ativos.reduce((s, b) => s + mensalidade(b), 0);

  // ---- Trials
  const trials = contas.filter((b) => b.status === 'trialing');
  const trialAberto   = trials.filter((b) => b._trialFim && b._trialFim > agora);
  const trialExpirado = trials.filter((b) => !b._trialFim || b._trialFim <= agora);
  const converteram   = contas.filter((b) => b._ativou);
  // Fim do teste chegando: janela de 3 dias é o que ainda dá tempo de
  // alguém falar com a pessoa antes de o acesso apertar.
  const trialAcabando = trialAberto.filter((b) => diasAte(b._trialFim) <= 3);

  // ---- Produto / retenção
  const totalImoveis = contas.reduce((s, b) => s + (b.usage?.imoveisCount || 0), 0);
  const vivasDesde = (dias) => {
    const corte = new Date(Date.now() - dias * DIA_MS);
    return contas.filter((b) => b._ativa && b._ativa >= corte).length;
  };
  // Denominador honesto: quem nunca abriu o painel depois de o carimbo
  // existir não tem o campo, e contaria como inativo sem ter tido chance.
  const comSinal = contas.filter((b) => b._ativa).length;

  // ---- Série por dia — uma linha por KPI do funil, mesma base de dias
  const serie = serieDiaria(faixa, visitas, contasPeriodo, ativados, eventos);

  // ---- Canais
  const canais = new Map();
  const garanteCanal = (nome) => {
    if (!canais.has(nome)) canais.set(nome, { nome, visitas: 0, visitantes: new Set(), contas: 0 });
    return canais.get(nome);
  };
  visitas.forEach((v) => {
    const c = garanteCanal(canalDaVisita(v));
    c.visitas++;
    if (v.visitorId) c.visitantes.add(v.visitorId);
  });
  contasPeriodo.forEach((b) => {
    // Preferência pelo canal da visita de origem (veio do referrer
    // real); o utm espelhado no broker é o plano B pra quando a visita
    // não está mais no período consultado.
    const canal = (b.acquisitionVisitorId && canalPorVisitante.get(b.acquisitionVisitorId)) || b.acquisitionUtmSource;
    if (canal) garanteCanal(canal).contas++;
  });

  // ---- Contatos gerados pelos catálogos
  // "Cliques" é o dado cru; "pessoas" deduplica por visitante + tenant
  // + dia, porque a mesma pessoa clicando no WhatsApp de 3 imóveis são
  // 3 cliques e 1 interessado. O número honesto de citar é o segundo,
  // e mesmo ele é um teto: clique não garante mensagem enviada.
  const pessoas = new Set();
  const porTipo = {};
  const porConta = new Map();
  eventos.forEach((ev) => {
    const dia = ev.tsData ? chaveDia(ev.tsData) : '';
    if (ev.visitorId && ev.tenantId) pessoas.add(`${ev.visitorId}|${ev.tenantId}|${dia}`);
    porTipo[ev.tipo || '?'] = (porTipo[ev.tipo || '?'] || 0) + 1;
    if (!ev.tenantId) return;
    if (!porConta.has(ev.tenantId)) porConta.set(ev.tenantId, { cliques: 0, pessoas: new Set() });
    const c = porConta.get(ev.tenantId);
    c.cliques++;
    if (ev.visitorId) c.pessoas.add(`${ev.visitorId}|${dia}`);
  });

  return {
    faixa, agora, contas,
    eventos: eventos.length,
    contatoPessoas: pessoas.size,
    contatoPorTipo: porTipo,
    contatoPorConta: porConta,
    // Publicados sem nenhum contato: o site está no ar e não gera nada.
    // É a fatia onde o corretor não vê valor e não renova.
    publicadosSemContato: contas.filter((b) => b.published === true && !porConta.has(b.id)).length,
    visitas: visitas.length, sessoes: sessoes.size, visitantes: visitantes.size,
    contasPeriodo, contasAtribuidas,
    ativados, cancelados, ativos, pastDue, canceladosTotal, semActivatedAt,
    porPlano, mrr,
    trials, trialAberto, trialExpirado, trialAcabando, converteram,
    totalImoveis,
    publicados: contas.filter((b) => b.published === true).length,
    onboarding: contas.filter((b) => b.onboardingCompleted === true).length,
    vivas7: vivasDesde(7), vivas30: vivasDesde(30), comSinal,
    serie,
    canais: [...canais.values()].sort((a, b) => b.visitas - a.visitas).slice(0, 20),
  };
}

// ── Renders por view ─────────────────────────────────────

function rotuloPeriodo(m) {
  const { inicio, fim } = m.faixa;
  if (inicio && fim) return `De ${dataCurta(inicio)} a ${dataCurta(fim)}.`;
  if (inicio) return `De ${dataCurta(inicio)} até hoje.`;
  return 'Desde o começo (sem filtro de data).';
}

function linhaTenant(b) {
  return `<span class="tabela__forte">${esc(b.id)}</span>`;
}

function renderVisaoGeral(m) {
  $('resumoCards').innerHTML = cardsHTML([
    { label: 'Contas',            valor: num(m.contas.length),  nota: `${m.trialAberto.length} em teste · ${m.ativos.length} pagantes` },
    { label: 'MRR',               valor: usd(m.mrr),            nota: 'assinantes ativos × preço do plano' },
    { label: 'Assinantes ativos', valor: num(m.ativos.length),  nota: taxa(m.ativos.length, m.contas.length) + ' da base' },
    { label: 'Contas vivas (30d)', valor: num(m.vivas30),       nota: m.comSinal ? `${taxa(m.vivas30, m.comSinal)} de quem tem registro` : 'sem registro ainda' },
    { label: 'Inadimplentes',     valor: num(m.pastDue.length), nota: 'status past_due' },
  ]);

  $('movimentoSub').textContent = rotuloPeriodo(m);
  $('movimentoCards').innerHTML = cardsHTML([
    { label: 'Visitas',        valor: num(m.visitas),               nota: `${num(m.visitantes)} visitantes únicos` },
    { label: 'Contas criadas', valor: num(m.contasPeriodo.length),  nota: `${m.contasAtribuidas.length} com origem identificada` },
    { label: 'Assinaturas',    valor: num(m.ativados.length),       nota: 'viraram pagantes no período' },
    { label: 'Cancelamentos',  valor: num(m.cancelados.length),     nota: 'no período' },
    // O único número aqui que mede o que o produto ENTREGA, e não o
    // que a gente vende — por isso na visão geral e não só na view.
    { label: 'Contatos gerados', valor: num(m.eventos),             nota: `${num(m.contatoPessoas)} pessoas, em ${m.contatoPorConta.size} conta(s)` },
  ]);

  renderGrafico(m);

  // Fila de trabalho: cada linha é uma conta que vale uma ação hoje.
  // Uma conta pode aparecer por mais de um motivo — é intencional, são
  // ações diferentes.
  const linhas = [];
  m.pastDue.forEach((b) => linhas.push([
    linhaTenant(b), esc(b.email || '—'), tagHTML('inadimplente', 'alerta'),
    'Pagamento falhou — assinatura em risco', haQuantoTempo(b._ativa),
  ]));
  m.trialAcabando.forEach((b) => linhas.push([
    linhaTenant(b), esc(b.email || '—'), tagHTML('teste acabando', 'trialing'),
    `Teste termina em ${diasAte(b._trialFim)} dia(s)`, haQuantoTempo(b._ativa),
  ]));
  m.ativos.filter((b) => b._ativa && diasAte(b._ativa) <= -30).forEach((b) => linhas.push([
    linhaTenant(b), esc(b.email || '—'), tagHTML('pagante sumido', 'alerta'),
    'Assinante que não abre o painel há mais de 30 dias', haQuantoTempo(b._ativa),
  ]));
  m.trialExpirado.filter((b) => b._trialFim && diasAte(b._trialFim) >= -14).forEach((b) => linhas.push([
    linhaTenant(b), esc(b.email || '—'), tagHTML('teste expirado', 'neutro'),
    'Teste acabou nos últimos 14 dias e não converteu', haQuantoTempo(b._ativa),
  ]));

  $('atencaoWrap').innerHTML = tabelaHTML(
    [{ titulo: 'Tenant' }, { titulo: 'E-mail' }, { titulo: 'Situação' }, { titulo: 'Por quê' }, { titulo: 'Último acesso' }],
    linhas,
    'Nada precisando de atenção agora.'
  );
}

// Cada KPI tem uma cor fixa no painel inteiro — a mesma linha violeta
// que aparece aqui como "contatos gerados" é a do gráfico da view de
// Contatos. Cor segue a MÉTRICA, nunca a posição no gráfico.
//
// Os hexes são a paleta categórica validada (slots 1, 2, 3, 4 e 7)
// contra o fundo #111820. O painel de baixo pula os slots 5 e 6 de
// propósito: magenta ao lado de verde-água é praticamente a mesma cor
// em deuteranopia (ΔE 1,6), e as três linhas de lá dividem um plot só.
// Mexer nessas cores pede revalidar as separações, não só olhar.
const SERIES = {
  visitas:     { chave: 'visitas',     nome: 'Visitas',           cor: '#3987e5', descricao: 'pageviews na landing' },
  visitantes:  { chave: 'visitantes',  nome: 'Visitantes únicos', cor: '#d95926', descricao: 'navegadores distintos' },
  contas:      { chave: 'contas',      nome: 'Contas criadas',    cor: '#199e70', descricao: 'cadastros novos' },
  assinaturas: { chave: 'assinaturas', nome: 'Assinaturas',       cor: '#c98500', descricao: 'viraram pagantes' },
  contatos:    { chave: 'contatos',    nome: 'Contatos gerados',  cor: '#9085e9', descricao: 'cliques nos catálogos' },
};

function renderGrafico(m) {
  graficoLinhas($('graficoDias'), {
    serie: m.serie,
    // Um painel por ordem de grandeza. Contatos vive na casa das
    // dezenas e contas/assinaturas na casa das unidades: juntos, o eixo
    // de contatos manda e as outras duas viram uma reta no chão — que é
    // o mesmo defeito que separar tráfego de conversão já corrigiu.
    paineis: [
      { titulo: 'Tráfego',   altura: 132, series: [SERIES.visitas, SERIES.visitantes] },
      { titulo: 'Conversão', altura: 104, series: [SERIES.contas, SERIES.assinaturas] },
      { titulo: 'Contatos gerados', nota: 'cliques nos catálogos dos corretores', altura: 104, series: [SERIES.contatos] },
    ],
  });
}

function renderAquisicao(m) {
  $('aquisicaoSub').textContent = rotuloPeriodo(m);
  $('aquisicaoCards').innerHTML = cardsHTML([
    { label: 'Visitas',           valor: num(m.visitas),    nota: 'pageviews na landing' },
    { label: 'Sessões',           valor: num(m.sessoes),    nota: 'visitas agrupadas por aba' },
    { label: 'Visitantes únicos', valor: num(m.visitantes), nota: 'navegadores distintos' },
    { label: 'Contas criadas',    valor: num(m.contasPeriodo.length), nota: `${m.contasAtribuidas.length} com visita de origem` },
    { label: 'Assinaturas',       valor: num(m.ativados.length),      nota: '1ª vez que viraram pagantes' },
  ]);

  $('funilBarras').innerHTML = funilHTML([
    { nome: 'Visitantes únicos', valor: m.visitantes },
    { nome: 'Contas criadas',    valor: m.contasPeriodo.length, taxa: taxa(m.contasPeriodo.length, m.visitantes) + ' da etapa anterior' },
    { nome: 'Assinaturas',       valor: m.ativados.length,      taxa: taxa(m.ativados.length, m.contasPeriodo.length) + ' da etapa anterior' },
  ]);

  $('canaisWrap').innerHTML = tabelaHTML(
    [{ titulo: 'Origem' }, { titulo: 'Visitas', num: true }, { titulo: 'Visitantes', num: true }, { titulo: 'Contas', num: true }, { titulo: 'Conversão', num: true }],
    m.canais.map((c) => [
      `<span class="tabela__forte">${esc(c.nome)}</span>`,
      num(c.visitas), num(c.visitantes.size), num(c.contas), taxa(c.contas, c.visitantes.size),
    ]),
    'Nenhuma visita registrada no período.'
  );
}

// Situação do teste em uma etiqueta + a data de saída correspondente.
function situacaoTrial(b) {
  if (b._ativou) return { tag: tagHTML('converteu', 'ok'), saida: dataCurta(b._ativou), detalhe: 'virou pagante' };
  if (!b._trialFim) return { tag: tagHTML('sem data', 'neutro'), saida: '—', detalhe: 'doc sem trialEndsAt' };
  const dias = diasAte(b._trialFim);
  if (dias > 0) return { tag: tagHTML(`faltam ${dias}d`, dias <= 3 ? 'alerta' : 'trialing'), saida: dataCurta(b._trialFim), detalhe: 'em teste' };
  return { tag: tagHTML('expirado', 'neutro'), saida: dataCurta(b._trialFim), detalhe: `expirou ${haQuantoTempo(b._trialFim)}` };
}

function renderTrials(m) {
  $('trialsCards').innerHTML = cardsHTML([
    { label: 'Em teste agora',   valor: num(m.trialAberto.length),   nota: `${m.trialAcabando.length} terminam em até 3 dias` },
    { label: 'Expirados',        valor: num(m.trialExpirado.length), nota: 'acabou o teste e não assinou' },
    { label: 'Converteram',      valor: num(m.converteram.length),   nota: 'já viraram pagantes algum dia' },
    { label: 'Taxa de conversão', valor: taxa(m.converteram.length, m.converteram.length + m.trialExpirado.length), nota: 'converteram ÷ (converteram + expirados)' },
  ]);

  const listas = {
    abertos:      m.trialAberto,
    expirados:    m.trialExpirado,
    converteram:  m.converteram,
    todos:        m.contas,
  };
  const lista = [...(listas[filtroTrials] || [])]
    .sort((a, b) => (b._criada?.getTime() || 0) - (a._criada?.getTime() || 0));

  $('trialsWrap').innerHTML = tabelaHTML(
    [{ titulo: 'Tenant' }, { titulo: 'E-mail' }, { titulo: 'Entrada' }, { titulo: 'Saída do teste' },
     { titulo: 'Situação' }, { titulo: 'Imóveis', num: true }, { titulo: 'Site' }, { titulo: 'Último acesso' }, { titulo: 'Origem' }],
    lista.map((b) => {
      const s = situacaoTrial(b);
      return [
        linhaTenant(b), esc(b.email || '—'), dataCurta(b._criada), s.saida, s.tag,
        num(b.usage?.imoveisCount || 0),
        b.published ? tagHTML('no ar', 'ok') : tagHTML('rascunho', 'neutro'),
        haQuantoTempo(b._ativa),
        esc(b.acquisitionUtmSource || (b.acquisitionVisitorId ? 'rastreada' : '—')),
      ];
    }),
    'Nenhuma conta nesse filtro.'
  );
}

function renderAssinantes(m) {
  $('assinantesCards').innerHTML = cardsHTML([
    { label: 'MRR',               valor: usd(m.mrr), nota: 'receita recorrente mensal' },
    { label: 'Ticket médio',      valor: m.ativos.length ? usd(m.mrr / m.ativos.length) : '—', nota: 'MRR ÷ assinantes ativos' },
    { label: 'Assinantes ativos', valor: num(m.ativos.length), nota: m.semActivatedAt ? `${m.semActivatedAt} sem data de ativação` : 'todos com data de ativação' },
    { label: 'Inadimplentes',     valor: num(m.pastDue.length), nota: usd(m.pastDue.reduce((s, b) => s + mensalidade(b), 0)) + ' em risco' },
    { label: 'Cancelados',        valor: num(m.canceladosTotal.length), nota: 'no total, desde sempre' },
  ]);

  $('planosDist').innerHTML = barraDistHTML(
    Object.entries(m.porPlano).map(([plano, n]) => ({
      nome: plano,
      valor: n,
      extra: usd(n * (PRECOS[plano] || 0)) + '/mês',
    })).sort((a, b) => b.valor - a.valor)
  );

  $('assinaturasMovSub').textContent = rotuloPeriodo(m);
  const receitaNova = m.ativados.reduce((s, b) => s + mensalidade(b), 0);
  const receitaPerdida = m.cancelados.reduce((s, b) => s + mensalidade(b), 0);
  $('assinaturasMovCards').innerHTML = cardsHTML([
    { label: 'Novas assinaturas', valor: num(m.ativados.length),   nota: usd(receitaNova) + '/mês somados' },
    { label: 'Cancelamentos',     valor: num(m.cancelados.length), nota: usd(receitaPerdida) + '/mês perdidos' },
    { label: 'MRR líquido',       valor: usd(receitaNova - receitaPerdida), nota: 'novas − canceladas no período' },
  ]);

  const listas = {
    active:   m.ativos,
    past_due: m.pastDue,
    canceled: m.canceladosTotal,
    todos:    m.contas.filter((b) => b.status !== 'trialing'),
  };
  const lista = [...(listas[filtroAssinantes] || [])]
    .sort((a, b) => (b._ativou?.getTime() || 0) - (a._ativou?.getTime() || 0));

  $('assinantesWrap').innerHTML = tabelaHTML(
    [{ titulo: 'Tenant' }, { titulo: 'E-mail' }, { titulo: 'Plano' }, { titulo: 'Status' },
     { titulo: 'Assinante desde' }, { titulo: 'Cancelou em' }, { titulo: 'Valor/mês', num: true },
     { titulo: 'Imóveis', num: true }, { titulo: 'Último acesso' }, { titulo: 'Stripe' }],
    lista.map((b) => [
      linhaTenant(b), esc(b.email || '—'), esc(b.plan || '—'),
      tagHTML(b.status || '?', b.status || 'neutro'),
      dataCurta(b._ativou), dataCurta(b._cancelou),
      mensalidade(b) ? usd(mensalidade(b)) : '—',
      num(b.usage?.imoveisCount || 0),
      haQuantoTempo(b._ativa),
      // Atalho pro cliente no Stripe — de onde sai fatura, reembolso e
      // histórico de pagamento, que nada disso aqui replica.
      b.stripeCustomerId
        ? `<a href="https://dashboard.stripe.com/customers/${encodeURIComponent(b.stripeCustomerId)}" target="_blank" rel="noopener">abrir ↗</a>`
        : '—',
    ]),
    'Nenhuma conta nesse filtro.'
  );
}

const TIPO_LABEL = { whatsapp: 'WhatsApp', email: 'E-mail', instagram: 'Instagram', telefone: 'Telefone' };

function renderContatos(m) {
  $('contatosSub').textContent = rotuloPeriodo(m);

  const comContato = m.contatoPorConta.size;
  $('contatosCards').innerHTML = cardsHTML([
    { label: 'Cliques de contato', valor: num(m.eventos), nota: 'WhatsApp, e-mail, Instagram' },
    { label: 'Pessoas',            valor: num(m.contatoPessoas), nota: 'deduplicado por visitante e dia' },
    { label: 'Contas com contato', valor: num(comContato), nota: `${taxa(comContato, m.publicados)} dos sites no ar` },
    { label: 'No ar sem contato',  valor: num(m.publicadosSemContato), nota: 'publicaram e não geraram nada' },
    { label: 'Média por conta',    valor: comContato ? (m.eventos / comContato).toFixed(1) : '—', nota: 'entre as que receberam algo' },
  ]);

  $('contatosTipos').innerHTML = barraDistHTML(
    Object.entries(m.contatoPorTipo)
      .map(([tipo, n]) => ({ nome: TIPO_LABEL[tipo] || tipo, valor: n, extra: taxa(n, m.eventos) }))
      .sort((a, b) => b.valor - a.valor)
  );

  graficoLinhas($('graficoContatos'), {
    serie: m.serie,
    paineis: [{ altura: 132, series: [SERIES.contatos] }],
    vazio: 'Nenhum contato registrado no período.',
  });

  // Só contas publicadas: quem nunca publicou não tem site pra gerar
  // contato, e apareceria como "zero" sem que isso queira dizer nada.
  const linhas = m.contas
    .filter((b) => b.published === true)
    .map((b) => {
      const c = m.contatoPorConta.get(b.id);
      return { b, cliques: c?.cliques || 0, pessoas: c?.pessoas.size || 0 };
    })
    .sort((a, b) => b.cliques - a.cliques);

  $('contatosPorContaWrap').innerHTML = tabelaHTML(
    [{ titulo: 'Tenant' }, { titulo: 'Status' }, { titulo: 'Imóveis', num: true },
     { titulo: 'Cliques', num: true }, { titulo: 'Pessoas', num: true },
     { titulo: 'Por imóvel', num: true }, { titulo: 'Último acesso' }],
    linhas.map(({ b, cliques, pessoas }) => {
      const imoveis = b.usage?.imoveisCount || 0;
      return [
        linhaTenant(b),
        tagHTML(b.status || '?', b.status || 'neutro'),
        num(imoveis),
        cliques ? num(cliques) : tagHTML('zero', 'alerta'),
        num(pessoas),
        imoveis ? (cliques / imoveis).toFixed(1) : '—',
        haQuantoTempo(b._ativa),
      ];
    }),
    'Nenhuma conta com site publicado ainda.'
  );
}

function renderContas(m) {
  const lista = [...m.contas].sort((a, b) => (b._criada?.getTime() || 0) - (a._criada?.getTime() || 0));
  $('contasSub').textContent = `${num(m.contas.length)} conta(s), da mais recente pra mais antiga.`;
  $('contasWrap').innerHTML = tabelaHTML(
    [{ titulo: 'Tenant' }, { titulo: 'E-mail' }, { titulo: 'Criada em' }, { titulo: 'Plano' },
     { titulo: 'Status' }, { titulo: 'Imóveis', num: true }, { titulo: 'Site' },
     { titulo: 'Onboarding' }, { titulo: 'Último acesso' }, { titulo: 'Origem' }],
    lista.map((b) => [
      linhaTenant(b), esc(b.email || '—'), dataCurta(b._criada), esc(b.plan || '—'),
      tagHTML(b.status || '?', b.status || 'neutro'),
      num(b.usage?.imoveisCount || 0),
      b.published ? tagHTML('no ar', 'ok') : tagHTML('rascunho', 'neutro'),
      b.onboardingCompleted ? 'concluído' : 'pendente',
      haQuantoTempo(b._ativa),
      esc(b.acquisitionUtmSource || (b.acquisitionVisitorId ? 'rastreada' : '—')),
    ]),
    'Nenhuma conta ainda.'
  );
}

function renderProduto(m) {
  $('produtoCards').innerHTML = cardsHTML([
    { label: 'Contas no total',   valor: num(m.contas.length), nota: 'desde o começo' },
    { label: 'Imóveis por conta', valor: m.contas.length ? (m.totalImoveis / m.contas.length).toFixed(1) : '—', nota: `${num(m.totalImoveis)} imóveis cadastrados` },
    { label: 'Sites publicados',  valor: num(m.publicados), nota: taxa(m.publicados, m.contas.length) + ' da base' },
    { label: 'Onboarding',        valor: num(m.onboarding), nota: taxa(m.onboarding, m.contas.length) + ' terminaram o tour' },
    { label: 'Contas sem imóvel', valor: num(m.contas.filter((b) => !(b.usage?.imoveisCount > 0)).length), nota: 'criaram a conta e pararam' },
  ]);

  $('retencaoCards').innerHTML = cardsHTML([
    { label: 'Vivas (7d)',  valor: num(m.vivas7),  nota: m.comSinal ? `${taxa(m.vivas7, m.comSinal)} de quem tem registro` : 'nenhum registro ainda' },
    { label: 'Vivas (30d)', valor: num(m.vivas30), nota: m.comSinal ? `${taxa(m.vivas30, m.comSinal)} de quem tem registro` : 'nenhum registro ainda' },
    { label: 'Com registro', valor: num(m.comSinal), nota: 'abriram o painel desde que o carimbo existe' },
  ]);
}

function renderConta() {
  const meta = usuario?.metadata || {};
  const linha = (chave, valor) => `
    <div class="dados__linha">
      <span class="dados__chave">${esc(chave)}</span>
      <span class="dados__valor">${valor}</span>
    </div>`;

  $('contaDados').innerHTML = [
    linha('Nome', esc(usuario?.displayName || '—')),
    linha('E-mail', esc(usuario?.email || '—')),
    linha('E-mail verificado', usuario?.emailVerified ? tagHTML('sim', 'ok') : tagHTML('não', 'alerta')),
    linha('Provedor', esc((usuario?.providerData || []).map((p) => p.providerId).join(', ') || '—')),
    linha('UID', `<code>${esc(usuario?.uid || '—')}</code>`),
    linha('Conta criada em', esc(meta.creationTime ? new Date(meta.creationTime).toLocaleString('pt-BR') : '—')),
    linha('Último login', esc(meta.lastSignInTime ? new Date(meta.lastSignInTime).toLocaleString('pt-BR') : '—')),
    // Deixa explícito que este login NÃO é um tenant — a confusão entre
    // "conta de equipe" e "conta de corretor" é fácil de fazer, já que
    // as duas entram pelo mesmo Google Sign-In.
    linha('Tenant vinculado', 'nenhum — esta é uma conta de equipe, não de corretor'),
  ].join('');

  $('equipeWrap').innerHTML = tabelaHTML(
    [{ titulo: 'E-mail com acesso' }, { titulo: 'Sessão atual' }],
    EQUIPE.map((email) => [
      `<span class="tabela__forte">${esc(email)}</span>`,
      email === String(usuario?.email || '').toLowerCase() ? tagHTML('você', 'ok') : '—',
    ])
  );
}

// ── Registro de views ────────────────────────────────────
// Adicionar aqui + a <section data-view> no HTML é tudo que uma view
// nova precisa. `usaPeriodo: false` esconde o seletor de período na
// topbar (a view mostra snapshot de agora, o seletor só confundiria).
const VIEWS = [
  { key: 'visao-geral', label: 'Visão geral',   titulo: 'Visão geral',      icon: ICONS.visao,      usaPeriodo: true,  render: renderVisaoGeral },
  { key: 'aquisicao',   label: 'Aquisição',     titulo: 'Aquisição',        icon: ICONS.aquisicao,  usaPeriodo: true,  render: renderAquisicao },
  { key: 'trials',      label: 'Contas grátis', titulo: 'Contas em teste',  icon: ICONS.trials,     usaPeriodo: false, render: renderTrials,    badge: (m) => m.trialAberto.length },
  { key: 'assinantes',  label: 'Assinantes',    titulo: 'Assinantes',       icon: ICONS.assinantes, usaPeriodo: true,  render: renderAssinantes, badge: (m) => m.ativos.length },
  { key: 'contatos',    label: 'Contatos',      titulo: 'Contatos gerados', icon: ICONS.contatos,   usaPeriodo: true,  render: renderContatos,  badge: (m) => m.eventos },
  { key: 'contas',      label: 'Todas as contas', titulo: 'Todas as contas', icon: ICONS.contas,    usaPeriodo: false, render: renderContas,    badge: (m) => m.contas.length },
  { key: 'produto',     label: 'Produto',       titulo: 'Uso do produto',   icon: ICONS.produto,    usaPeriodo: false, render: renderProduto },
  // Fora da sidebar: chega pelo menu de perfil, no canto superior direito.
  { key: 'conta',       label: 'Dados da conta', titulo: 'Dados da conta',  usaPeriodo: false, oculto: true, render: renderConta },
];

const viewPorKey = (key) => VIEWS.find((v) => v.key === key) || VIEWS[0];

function renderNav() {
  $('nav').innerHTML = VIEWS.filter((v) => !v.oculto).map((v) => `
    <button type="button" class="nav__btn${v.key === viewAtual ? ' is-active' : ''}" data-view-key="${v.key}">
      ${v.icon || ''}
      <span>${esc(v.label)}</span>
      <span class="nav__badge" data-badge="${v.key}" hidden></span>
    </button>`).join('');
}

function atualizarBadges(m) {
  VIEWS.forEach((v) => {
    const el = document.querySelector(`[data-badge="${v.key}"]`);
    if (!el) return;
    if (!v.badge) { el.hidden = true; return; }
    el.textContent = num(v.badge(m));
    el.hidden = false;
  });
}

function irPara(key, { push = true } = {}) {
  const view = viewPorKey(key);
  viewAtual = view.key;

  document.querySelectorAll('.view').forEach((el) => { el.hidden = el.dataset.view !== view.key; });
  document.querySelectorAll('[data-view-key]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.viewKey === view.key);
  });
  $('topbarTitulo').textContent = view.titulo;
  $('periodo').style.display = view.usaPeriodo ? '' : 'none';

  if (push && location.hash !== `#/${view.key}`) history.pushState({}, '', `#/${view.key}`);

  // O modelo pode não existir ainda (troca de view antes do 1º load
  // terminar) — o render roda de novo no fim de carregar().
  if (modelo) view.render(modelo);
}

function renderTudo() {
  if (!modelo) return;
  atualizarBadges(modelo);
  viewPorKey(viewAtual).render(modelo);
}

// ── Orquestração ─────────────────────────────────────────

function status(texto, erro = false, aviso = false) {
  const el = $('status');
  el.textContent = texto;
  el.classList.toggle('status--erro', erro);
  el.classList.toggle('status--aviso', aviso);
}

async function carregar() {
  if (carregando) return;
  carregando = true;
  $('btnAtualizar').disabled = true;
  status('Carregando dados…');

  const faixa = faixaAtual();
  try {
    const [brokers, visitas, eventos] = await Promise.all([
      carregarBrokers(), carregarVisitas(faixa), carregarEventos(faixa),
    ]);
    modelo = calcular(brokers, visitas, eventos, faixa);
    renderTudo();

    const resumo = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · ${num(brokers.length)} contas, ${num(visitas.length)} visitas, ${num(eventos.length)} contatos.`;
    // Com faixas longas (ou "desde o começo") o teto fica fácil de
    // bater, e como a query é `orderBy ts desc + limit`, o que some é o
    // COMEÇO da faixa — os primeiros dias do gráfico aparecem baixos
    // sem terem sido baixos. Por isso o aviso é destacado, não uma
    // frase a mais no fim da linha.
    if (visitas.length >= MAX_VISITAS) {
      status(`${resumo} ⚠️ Teto de ${num(MAX_VISITAS)} visitas atingido: o começo do período foi cortado — escolha uma faixa mais curta.`, false, true);
    } else {
      status(resumo);
    }
    $('sidebarRodape').textContent = `${num(brokers.length)} contas lidas por carregamento`;
  } catch (err) {
    console.error('[interno-metricas] falha ao carregar:', err);
    // permission-denied aqui quase sempre significa e-mail que está em
    // equipe.js mas não em isTeam() nas firestore.rules — as duas listas
    // são separadas de propósito, ver o comentário em equipe.js.
    status(err.code === 'permission-denied'
      ? 'Sem permissão pra ler os dados — confira se este e-mail está em isTeam(), nas firestore.rules, e se as rules já foram deployadas.'
      : 'Não foi possível carregar: ' + err.message, true);
  } finally {
    carregando = false;
    $('btnAtualizar').disabled = false;
  }
}

function mostrar(qual) {
  ['gateCarregando', 'gateLogin', 'gateNegado', 'app'].forEach((id) => { $(id).hidden = id !== qual; });
}

const iniciais = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function preencherPerfil(user) {
  $('perfilNome').textContent = user.displayName || 'Minha conta';
  $('perfilEmail').textContent = user.email || '';
  $('perfilAvatar').innerHTML = user.photoURL
    ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : esc(iniciais(user.displayName || user.email));
}

// ── Wiring ───────────────────────────────────────────────

$('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view-key]');
  if (btn) irPara(btn.dataset.viewKey);
});

// ── Seletor de período ───────────────────────────────────

const CHECK = '<svg class="periodo__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

function renderPeriodoLista() {
  const opcao = (key, label, separador) => `
    <button type="button" class="periodo__opcao${separador ? ' periodo__opcao--separador' : ''}"
            data-periodo="${key}" aria-pressed="${key === periodoKey}">
      <span>${esc(label)}</span>${CHECK}
    </button>`;

  $('periodoLista').innerHTML =
    PERIODOS.map((p) => opcao(p.key, p.label, p.separador)).join('')
    + opcao('personalizado', 'Personalizado…', true);

  $('periodoRotulo').textContent = rotuloDoPeriodo();
}

function abrirPeriodo(abrir) {
  $('periodoPainel').hidden = !abrir;
  $('periodoBtn').setAttribute('aria-expanded', String(abrir));
  if (!abrir) return;
  // Reabre sempre no estado atual: o formulário só aparece se a seleção
  // vigente for personalizada.
  mostrarFormCustom(periodoKey === 'personalizado');
}

function mostrarFormCustom(mostrar) {
  $('periodoCustom').hidden = !mostrar;
  if (!mostrar) return;
  const hoje = chaveDia(new Date());
  const f = faixaAtual();
  // Pré-preenche com a faixa vigente e trava o futuro: não há dado lá.
  // Vindo de "desde o começo" não há início pra herdar — 30 dias é um
  // ponto de partida útil, "de hoje até hoje" não é.
  $('periodoDe').value = chaveDia(f.inicio || somaDias(meiaNoite(new Date()), -29));
  $('periodoAte').value = chaveDia(f.fim || new Date());
  $('periodoDe').max = hoje;
  $('periodoAte').max = hoje;
  $('periodoDe').focus();
}

function aplicarPeriodo() {
  salvarPeriodo();
  renderPeriodoLista();
  abrirPeriodo(false);
  carregar();
}

$('periodoBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  abrirPeriodo($('periodoPainel').hidden);
});
$('periodoPainel').addEventListener('click', (e) => e.stopPropagation());

$('periodoLista').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-periodo]');
  if (!btn) return;
  // "Personalizado…" não escolhe nada sozinho — abre o formulário e
  // espera as duas datas.
  if (btn.dataset.periodo === 'personalizado') { mostrarFormCustom(true); return; }
  periodoKey = btn.dataset.periodo;
  periodoCustom = null;
  aplicarPeriodo();
});

$('periodoCustom').addEventListener('submit', (e) => {
  e.preventDefault();
  const de = $('periodoDe').value;
  const ate = $('periodoAte').value;
  if (!de || !ate) return;
  let inicio = new Date(`${de}T00:00:00`);
  let fim = new Date(`${ate}T00:00:00`);
  if (isNaN(inicio) || isNaN(fim)) return;
  // Datas invertidas: a intenção é óbvia, então troca em silêncio em
  // vez de recusar e fazer a pessoa adivinhar o que deu errado.
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  periodoKey = 'personalizado';
  periodoCustom = { inicio, fim: fimDoDia(fim) };
  aplicarPeriodo();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('periodoPainel').hidden) {
    abrirPeriodo(false);
    $('periodoBtn').focus();
  }
});

$('trialsFiltros').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filtro]');
  if (!btn) return;
  filtroTrials = btn.dataset.filtro;
  $('trialsFiltros').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
  if (modelo) renderTrials(modelo);
});

$('assinantesFiltros').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filtro]');
  if (!btn) return;
  filtroAssinantes = btn.dataset.filtro;
  $('assinantesFiltros').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
  if (modelo) renderAssinantes(modelo);
});

$('btnAtualizar').addEventListener('click', carregar);

// Menu de perfil — fecha ao clicar fora, como o do painel do corretor.
$('perfilBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const painel = $('perfilPainel');
  painel.hidden = !painel.hidden;
  $('perfilBtn').setAttribute('aria-expanded', String(!painel.hidden));
});
document.addEventListener('click', () => {
  $('perfilPainel').hidden = true;
  $('perfilBtn').setAttribute('aria-expanded', 'false');
  abrirPeriodo(false);
});
$('perfilPainel').addEventListener('click', (e) => e.stopPropagation());
$('perfilDados').addEventListener('click', () => irPara('conta'));
$('perfilSair').addEventListener('click', () => logout().then(() => location.reload()));
$('btnSair').addEventListener('click', () => logout().then(() => location.reload()));

$('btnEntrar').addEventListener('click', async () => {
  $('gateLoginErro').textContent = '';
  try {
    await loginWithGoogle(); // onAuthChange abaixo cuida do resto
  } catch (err) {
    $('gateLoginErro').textContent = 'Não foi possível entrar: ' + err.message;
  }
});

window.addEventListener('popstate', () => {
  irPara((location.hash || '').replace('#/', '') || 'visao-geral', { push: false });
});

onAuthChange((user) => {
  if (!user) { mostrar('gateLogin'); return; }
  if (!ehDaEquipe(user.email)) {
    $('gateNegadoEmail').textContent = user.email || '(sem e-mail)';
    mostrar('gateNegado');
    return;
  }
  usuario = user;
  preencherPerfil(user);
  mostrar('app');
  restaurarPeriodo();
  renderPeriodoLista();
  renderNav();
  irPara((location.hash || '').replace('#/', '') || 'visao-geral', { push: false });
  carregar();
});
