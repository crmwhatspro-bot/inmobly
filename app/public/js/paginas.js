// ════════════════════════════════════════════════
// PÁGINAS DE EMPREENDIMENTO — pré-pagas (checkout.js, produto
// inmobly_emprendimento_page, USD 400 de tabela / USD 200 de
// lançamento via cupom LANCAMENTO50 aplicado automaticamente pelo
// backend). Cada compra credita usage.paginasCompradas em
// brokers/{tenantId} (ver webhook.js) — só dá pra criar conteúdo
// (uma linha nesta lista) até esse saldo, igual a um "crédito" que se
// gasta ao criar. Estrutura de lista/editor copiada de admin-imoveis.js,
// só que com uma capa única em vez de galeria, e sem limite de plano
// (o limite aqui é quantidade comprada, não o plano de assinatura).
// ════════════════════════════════════════════════
import { db, auth } from './firebase.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const MAX_DATAURL  = 950_000;
const LARGURA_CAPA = 1000;

// ── Elementos ──────────────────────────────────
const $ = (id) => document.getElementById(id);
const listaView   = $('pg-lista-view');
const editorView  = $('pg-editor-view');
const listaEl     = $('pg-admin-list');
const countEl     = $('pg-count');
const form        = $('pg-form');
const capaGrid    = $('pg-capa-grid');
const capaInput   = $('pg-capa-input');
const capaLabel   = $('pg-capa-label');
const formMsg     = $('pg-form-msg');
const salvarBtn   = $('pg-salvar-btn');
const excluirBtn  = $('pg-excluir-btn');
const acaoBtn     = $('pg-acao-btn');
const acaoMsg     = $('pg-acao-msg');
const saldoBanner = $('pg-saldo-banner');
const tamanhoPaginaSel  = $('pg-tamanho-pagina');
const listControlsEl    = $('pg-list-controls');
const paginacaoEl       = $('pg-pagination');
const paginaInfoEl      = $('pg-pagina-info');
const paginaAnteriorBtn = $('pg-pagina-anterior');
const paginaProximaBtn  = $('pg-pagina-proxima');

// ── Estado ──────────────────────────────────────
let tenantId = null;
let broker   = null;
let paginaAtualLista = 1;
let tamanhoPagina = 10;
let paginas  = [];
let editId   = null;
let capaData = null; // dataURL da capa no editor (null = sem capa)

function colPaginas()   { return collection(db, 'brokers', tenantId, 'paginas'); }
function docPagina(id)  { return doc(db, 'brokers', tenantId, 'paginas', id); }

function saldo() {
  const compradas = broker?.usage?.paginasCompradas || 0;
  const criadas = paginas.length;
  return { compradas, criadas, disponiveis: Math.max(0, compradas - criadas) };
}

// ════════════════════════════════════════════════
// Gate de acesso
// ════════════════════════════════════════════════
initShell({ active: 'paginas', title: 'Páginas de Empreendimento' }).then((resultado) => {
  tenantId = resultado.tenantId;
  broker = resultado.broker;
  carregarLista();
});

// ════════════════════════════════════════════════
// Compressão de imagem (mesmo algoritmo de admin-imoveis.js)
// ════════════════════════════════════════════════
function carregarImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function canvasParaDataURL(canvas, qualidade) {
  const webp = canvas.toDataURL('image/webp', qualidade);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', qualidade);
}
async function comprimir(src, larguraMax) {
  const img = await carregarImg(src);
  let escala = Math.min(1, larguraMax / img.naturalWidth);
  let qualidade = 0.75;
  let resultado;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.naturalWidth  * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resultado = canvasParaDataURL(canvas, qualidade);
    if (resultado.length <= MAX_DATAURL) return resultado;
    qualidade -= 0.15;
    escala    *= 0.8;
  }
  return resultado;
}
async function comprimirArquivo(file, larguraMax) {
  const url = URL.createObjectURL(file);
  try { return await comprimir(url, larguraMax); }
  finally { URL.revokeObjectURL(url); }
}

// ════════════════════════════════════════════════
// Compra — botão dinâmico: sem saldo compra, com saldo cria direto
// ════════════════════════════════════════════════
function atualizarAcaoBtn() {
  const { compradas, criadas, disponiveis } = saldo();
  if (disponiveis > 0) {
    acaoBtn.textContent = '+ Nova página';
    acaoBtn.dataset.acao = 'criar';
    saldoBanner.hidden = false;
    saldoBanner.textContent = `${disponiveis} página${disponiveis === 1 ? '' : 's'} já paga${disponiveis === 1 ? '' : 's'} aguardando conteúdo.`;
  } else {
    acaoBtn.textContent = 'Comprar página — US$ 200';
    acaoBtn.dataset.acao = 'comprar';
    if (compradas > 0) {
      saldoBanner.hidden = false;
      saldoBanner.textContent = `${criadas} de ${compradas} página${compradas === 1 ? '' : 's'} comprada${compradas === 1 ? '' : 's'} já ${criadas === 1 ? 'tem' : 'têm'} conteúdo criado.`;
    } else {
      saldoBanner.hidden = true;
    }
  }
}

acaoBtn.addEventListener('click', async () => {
  if (acaoBtn.dataset.acao === 'criar') {
    abrirEditor(null);
    return;
  }
  acaoBtn.disabled = true;
  const original = acaoBtn.textContent;
  acaoBtn.textContent = 'Abrindo checkout...';
  acaoMsg.hidden = true;
  try {
    const functions = getFunctions(auth.app, 'southamerica-east1');
    const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');
    const { data } = await criarCheckoutSession({ priceLookupKey: 'inmobly_emprendimento_page' });
    location.href = data.url;
  } catch (err) {
    acaoMsg.textContent = 'Não foi possível abrir o checkout: ' + err.message;
    acaoMsg.className = 'imv-form-msg imv-form-msg--erro';
    acaoMsg.hidden = false;
    acaoBtn.disabled = false;
    acaoBtn.textContent = original;
  }
});

// ════════════════════════════════════════════════
// Lista
// ════════════════════════════════════════════════
const fmtUSD = (v) => 'US$ ' + Number(v).toLocaleString('en-US');
const esc = (s) => String(s || '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ESTAGIO_LABEL = { pronto: 'Pronto', construcao: 'Em construção', planta: 'Na planta' };

// Prefere o domínio próprio quando já está ativo (ver dominio.html) —
// senão cai no <tenantId>.sitemob.app padrão, que sempre existe depois de
// "Publicar site" em Meu Site.
function linkPublico(paginaId) {
  const host = (broker?.customDomain && broker?.customDomainStatus === 'active')
    ? broker.customDomain
    : `${tenantId}.sitemob.app`;
  return `https://${host}/emprendimiento.html?id=${paginaId}`;
}

async function carregarLista() {
  try {
    const snap = await getDocs(query(colPaginas(), orderBy('createdAt', 'desc')));
    paginas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLista();
  } catch (e) {
    console.error('Erro ao carregar páginas:', e);
    listaEl.innerHTML = '<p class="admin-empty">Erro ao carregar. Recarregue a página.</p>';
  }
}

function renderLista() {
  countEl.textContent = paginas.length === 1 ? '1 página' : `${paginas.length} páginas`;
  atualizarAcaoBtn();

  if (!paginas.length) {
    const { compradas } = saldo();
    listaEl.innerHTML = compradas > 0
      ? '<p class="admin-empty">Você já tem página(s) paga(s) — toque em "+ Nova página" para criar o conteúdo.</p>'
      : '<p class="admin-empty">Nenhuma página comprada ainda.<br>Cada página institucional é um espaço próprio pra divulgar um empreendimento, com link direto para compartilhar.</p>';
    listControlsEl.hidden = true;
    paginacaoEl.hidden = true;
    return;
  }
  listControlsEl.hidden = false;

  const totalPaginas = Math.max(1, Math.ceil(paginas.length / tamanhoPagina));
  if (paginaAtualLista > totalPaginas) paginaAtualLista = totalPaginas;
  const inicio = (paginaAtualLista - 1) * tamanhoPagina;
  const pagina = paginas.slice(inicio, inicio + tamanhoPagina);

  listaEl.innerHTML = pagina.map(pg => {
    const valor = pg.valorDesde ? fmtUSD(pg.valorDesde) : 'Sob consulta';
    const loc = [pg.bairro, pg.cidade].filter(Boolean).join(', ');
    const img = pg.capa
      ? `<img src="${pg.capa}" alt="" loading="lazy">`
      : `<div class="imv-noimg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>`;
    const unidades = pg.unidadesDisponiveis ? `${pg.unidadesDisponiveis} unidade${pg.unidadesDisponiveis === 1 ? '' : 's'}` : '';
    return `
      <article class="imv-admin-row">
        <div class="imv-admin-row__media">${img}</div>
        <div class="imv-admin-row__body">
          <div class="imv-admin-row__badges">
            <span class="imv-admin-badge imv-admin-badge--${pg.publicada ? 'destaque' : 'limite'}">${pg.publicada ? 'Publicada' : 'Rascunho'}</span>
          </div>
          <h3 class="imv-admin-row__title">${esc(pg.nome)}</h3>
          <p class="imv-admin-row__meta">${ESTAGIO_LABEL[pg.estagio] || ''}${loc ? ' · ' + esc(loc) : ''}${unidades ? ' · ' + unidades : ''}</p>
          <p class="imv-admin-row__price">${valor}</p>
        </div>
        <div class="imv-admin-row__actions">
          <button type="button" data-acao="editar" data-id="${pg.id}">Editar</button>
          ${pg.publicada ? `<button type="button" data-acao="copiar-link" data-id="${pg.id}">Copiar link</button>` : ''}
          <button type="button" data-acao="toggle" data-id="${pg.id}">${pg.publicada ? 'Despublicar' : 'Publicar'}</button>
        </div>
      </article>`;
  }).join('');

  paginacaoEl.hidden = totalPaginas <= 1;
  paginaInfoEl.textContent = `Página ${paginaAtualLista} de ${totalPaginas}`;
  paginaAnteriorBtn.disabled = paginaAtualLista <= 1;
  paginaProximaBtn.disabled = paginaAtualLista >= totalPaginas;
}

tamanhoPaginaSel.addEventListener('change', () => {
  tamanhoPagina = Number(tamanhoPaginaSel.value) || 10;
  paginaAtualLista = 1;
  renderLista();
});
paginaAnteriorBtn.addEventListener('click', () => {
  if (paginaAtualLista > 1) { paginaAtualLista--; renderLista(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
paginaProximaBtn.addEventListener('click', () => {
  paginaAtualLista++; renderLista(); window.scrollTo({ top: 0, behavior: 'smooth' });
});

listaEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const pg = paginas.find(p => p.id === btn.dataset.id);
  if (!pg) return;

  if (btn.dataset.acao === 'editar') {
    abrirEditor(pg);
  } else if (btn.dataset.acao === 'copiar-link') {
    const url = linkPublico(pg.id);
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copiado!';
    } catch {
      // clipboard bloqueado/indisponível — mostra o link pra copiar na mão
      prompt('Copie o link:', url);
    }
    setTimeout(() => { btn.textContent = original; }, 1800);
  } else {
    btn.disabled = true;
    try {
      await updateDoc(docPagina(pg.id), { publicada: !pg.publicada, updatedAt: serverTimestamp() });
      pg.publicada = !pg.publicada;
      renderLista();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alert('Não foi possível atualizar. Tente novamente.');
    }
  }
});

$('pg-voltar-btn').addEventListener('click', fecharEditor);
$('pg-cancelar-btn').addEventListener('click', fecharEditor);

// ════════════════════════════════════════════════
// Editor
// ════════════════════════════════════════════════
function abrirEditor(pg) {
  editId  = pg ? pg.id : null;
  capaData = pg?.capa || null;

  $('pg-form-titulo').textContent = pg ? 'Editar Página' : 'Nova Página';
  excluirBtn.hidden = !pg;
  mostrarMsg(null);
  form.reset();
  $('pg-cidade').value = pg?.cidade ?? 'Assunção';

  if (pg) {
    $('pg-nome').value      = pg.nome || '';
    $('pg-estagio').value   = pg.estagio || 'pronto';
    $('pg-entrega').value   = pg.previsaoEntrega || '';
    $('pg-unidades').value  = pg.unidadesDisponiveis || '';
    $('pg-bairro').value    = pg.bairro || '';
    $('pg-endereco').value  = pg.endereco || '';
    $('pg-valor-desde').value = pg.valorDesde || '';
    $('pg-tour-url').value  = pg.tourUrl || '';
    $('pg-descricao').value = pg.descricao || '';
    $('pg-publicada').checked = !!pg.publicada;
  }

  const coms = pg?.comodidades || [];
  document.querySelectorAll('#pg-comodidades input').forEach(cb => {
    cb.checked = coms.includes(cb.value);
  });

  renderCapa();
  listaView.hidden  = true;
  editorView.hidden = false;
  window.scrollTo({ top: 0 });
}

function fecharEditor() {
  editId = null;
  editorView.hidden = true;
  listaView.hidden  = false;
  window.scrollTo({ top: 0 });
}

// ── Capa no editor ──────────────────────────────
function renderCapa() {
  if (capaData) {
    capaGrid.innerHTML = `
      <div class="imv-foto imv-foto--capa">
        <img src="${capaData}" alt="Capa">
        <button type="button" class="imv-foto__btn imv-foto__btn--del" id="pg-capa-del" aria-label="Remover capa" title="Remover capa">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    capaLabel.hidden = true;
  } else {
    capaGrid.innerHTML = '';
    capaLabel.hidden = false;
  }
}

capaGrid.addEventListener('click', (e) => {
  if (e.target.closest('#pg-capa-del')) {
    capaData = null;
    renderCapa();
  }
});

capaInput.addEventListener('change', async () => {
  const file = capaInput.files?.[0];
  capaInput.value = '';
  if (!file) return;
  mostrarMsg('Processando capa...');
  try {
    capaData = await comprimirArquivo(file, LARGURA_CAPA);
    renderCapa();
    mostrarMsg(null);
  } catch (e) {
    console.error('Erro ao processar capa:', e);
    mostrarMsg('Não foi possível processar essa imagem.', true);
  }
});

// ── Mensagens ──────────────────────────────────
function mostrarMsg(texto, erro = false) {
  if (!texto) { formMsg.hidden = true; return; }
  formMsg.hidden = false;
  formMsg.textContent = texto;
  formMsg.className = 'imv-form-msg ' + (erro ? 'imv-form-msg--erro' : 'imv-form-msg--ok');
}

// ── Salvar ─────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nome = $('pg-nome').value.trim();
  if (!nome) {
    mostrarMsg('Informe o nome do empreendimento.', true);
    $('pg-nome').focus();
    return;
  }

  // não deixa criar (só editar) além do saldo pago — proteção extra além
  // do botão já ficar em modo "comprar" quando o saldo zera
  if (!editId && saldo().disponiveis <= 0) {
    mostrarMsg('Sem saldo de páginas pagas — compre uma página antes de criar o conteúdo.', true);
    return;
  }

  salvarBtn.disabled = true;
  mostrarMsg('Salvando...');

  try {
    const dados = {
      nome,
      estagio:            $('pg-estagio').value,
      previsaoEntrega:     $('pg-entrega').value.trim(),
      unidadesDisponiveis: Number($('pg-unidades').value) || null,
      cidade:              $('pg-cidade').value.trim(),
      bairro:               $('pg-bairro').value.trim(),
      endereco:             $('pg-endereco').value.trim(),
      valorDesde:           Number($('pg-valor-desde').value) || null,
      tourUrl:              $('pg-tour-url').value.trim(),
      descricao:            $('pg-descricao').value.trim(),
      comodidades:          [...document.querySelectorAll('#pg-comodidades input:checked')].map(cb => cb.value),
      publicada:            $('pg-publicada').checked,
      capa:                 capaData,
      updatedAt:            serverTimestamp(),
    };

    if (editId) {
      await updateDoc(docPagina(editId), dados);
    } else {
      await addDoc(colPaginas(), { ...dados, createdAt: serverTimestamp() });
    }

    mostrarMsg('Página salva com sucesso!');
    await carregarLista();
    setTimeout(fecharEditor, 700);
  } catch (err) {
    console.error('Erro ao salvar:', err);
    mostrarMsg('Erro ao salvar: ' + (err.message || 'tente novamente.'), true);
  } finally {
    salvarBtn.disabled = false;
  }
});

// ── Excluir ────────────────────────────────────
excluirBtn.addEventListener('click', async () => {
  if (!editId) return;
  if (!confirm('Excluir esta página definitivamente? O crédito pago volta a ficar disponível pra criar outra.')) return;

  excluirBtn.disabled = true;
  mostrarMsg('Excluindo...');
  try {
    await deleteDoc(docPagina(editId));
    await carregarLista();
    fecharEditor();
  } catch (err) {
    console.error('Erro ao excluir:', err);
    mostrarMsg('Erro ao excluir: ' + (err.message || 'tente novamente.'), true);
  } finally {
    excluirBtn.disabled = false;
  }
});
