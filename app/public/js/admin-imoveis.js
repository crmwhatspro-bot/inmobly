// ════════════════════════════════════════════════
// ADMIN — CMS de Imóveis (multi-tenant)
// Portado de template/js/admin-imoveis.js (modelo antigo, projeto
// isolado por broker) — mesma lógica de compressão de fotos e CRUD,
// só muda onde os dados moram: brokers/{tenantId}/imoveis/{id} em
// vez de imoveis/{id} top-level, e o gate de acesso usa o custom
// claim tenantId em vez de um ADMIN_EMAIL fixo por projeto.
// Fotos seguem comprimidas no navegador (canvas → WebP/JPEG, máx
// 900px) e salvas como data-URL no Firestore — sem Firebase Storage.
// ════════════════════════════════════════════════
import { db, auth, onAuthChange, logout } from './firebase.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { tenantIdAtual, buscarBroker, limiteEfetivo } from './tenant.js';

const MAX_FOTOS      = 16;
const MAX_DATAURL    = 950_000; // ~712KB binário — folga no limite de 1MiB do doc
const LARGURA_FOTO   = 900;
const LARGURA_CAPA   = 640;

// ── Elementos ──────────────────────────────────
const $ = (id) => document.getElementById(id);
const listaView   = $('imv-lista-view');
const editorView  = $('imv-editor-view');
const listaEl     = $('imv-admin-list');
const countEl     = $('imv-count');
const form        = $('imv-form');
const fotosGrid   = $('imv-fotos-grid');
const fotosInput  = $('imv-fotos-input');
const formMsg     = $('imv-form-msg');
const salvarBtn   = $('imv-salvar-btn');
const excluirBtn  = $('imv-excluir-btn');

// ── Estado ──────────────────────────────────────
let tenantId = null;
let broker   = null;         // doc de brokers/{tenantId} — fonte do limite do plano
let imoveis  = [];
let editId   = null;
let fotos    = [];           // [{ id?: string (já salva), data: dataURL }]
let removidas = [];          // ids de fotos existentes a apagar
let capaIdx  = 0;

function colImoveis()        { return collection(db, 'brokers', tenantId, 'imoveis'); }
function docImovel(id)       { return doc(db, 'brokers', tenantId, 'imoveis', id); }
function colFotos(id)        { return collection(db, 'brokers', tenantId, 'imoveis', id, 'fotos'); }
function docFoto(id, fotoId) { return doc(db, 'brokers', tenantId, 'imoveis', id, 'fotos', fotoId); }

// ativos, na mesma ordem da lista (createdAt desc) — os que ficam depois
// do limite do plano são os que somem do catálogo público
function separarPorLimite() {
  const ativos = imoveis.filter(i => i.ativo !== false);
  const limite = limiteEfetivo(broker);
  const visiveis = Number.isFinite(limite) ? ativos.slice(0, limite) : ativos;
  const acimaDoLimite = new Set(ativos.slice(visiveis.length).map(i => i.id));
  return { limite, ativos, acimaDoLimite };
}

// ════════════════════════════════════════════════
// Gate de acesso — precisa estar logado E já ter um tenant
// ════════════════════════════════════════════════
onAuthChange(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  tenantId = await tenantIdAtual();
  if (!tenantId) { location.href = 'criar-conta.html'; return; }
  broker = await buscarBroker(tenantId);
  carregarLista();
});

$('logout-btn').addEventListener('click', () => logout().then(() => location.href = 'login.html'));

// ════════════════════════════════════════════════
// Compressão de imagens
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
  // WebP quando o navegador suporta encode (Safari antigo cai para JPEG)
  const webp = canvas.toDataURL('image/webp', qualidade);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', qualidade);
}

async function comprimir(src, larguraMax) {
  const img = await carregarImg(src);
  let escala = Math.min(1, larguraMax / img.naturalWidth);
  let qualidade = 0.72;
  let resultado;

  // reduz qualidade/tamanho até caber no limite do documento
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
  try {
    return await comprimir(url, larguraMax);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ════════════════════════════════════════════════
// Lista de imóveis
// ════════════════════════════════════════════════
const fmtUSD = (v) => 'US$ ' + Number(v).toLocaleString('en-US');
const esc = (s) => String(s || '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OP_LABEL = { venda: 'Venda', aluguel: 'Aluguel', 'venda-aluguel': 'Venda/Aluguel' };
const TIPO_LABEL = {
  apartamento: 'Apartamento', casa: 'Casa', duplex: 'Duplex',
  terreno: 'Terreno', comercial: 'Comercial', escritorio: 'Escritório',
};

async function carregarLista() {
  try {
    const snap = await getDocs(query(colImoveis(), orderBy('createdAt', 'desc')));
    imoveis = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLista();
  } catch (e) {
    console.error('Erro ao carregar imóveis:', e);
    listaEl.innerHTML = '<p class="admin-empty">Erro ao carregar. Recarregue a página.</p>';
  }
}

function renderLista() {
  countEl.textContent = imoveis.length === 1 ? '1 imóvel' : `${imoveis.length} imóveis`;

  const { limite, ativos, acimaDoLimite } = separarPorLimite();
  const banner = $('imv-plano-banner');
  if (acimaDoLimite.size > 0) {
    banner.hidden = false;
    banner.textContent = `${acimaDoLimite.size} imóve${acimaDoLimite.size === 1 ? 'l está' : 'is estão'} acima do limite do plano (${ativos.length} de ${limite}) e não aparece${acimaDoLimite.size === 1 ? '' : 'm'} no site público — nada foi apagado, faça upgrade ou regularize a assinatura para reativar.`;
  } else {
    banner.hidden = true;
  }

  if (!imoveis.length) {
    listaEl.innerHTML = '<p class="admin-empty">Nenhum imóvel cadastrado ainda.<br>Toque em "Novo Imóvel" para começar.</p>';
    return;
  }

  listaEl.innerHTML = imoveis.map(imv => {
    const preco = imv.precoVenda ? fmtUSD(imv.precoVenda)
                : imv.precoAluguel ? fmtUSD(imv.precoAluguel) + '/mês' : 'Sob consulta';
    const loc = [imv.bairro, imv.cidade].filter(Boolean).join(', ');
    const img = imv.capa
      ? `<img src="${imv.capa}" alt="" loading="lazy">`
      : `<div class="imv-noimg"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>`;
    const imvAcimaDoLimite = acimaDoLimite.has(imv.id);
    return `
      <article class="imv-admin-card ${imv.ativo === false || imvAcimaDoLimite ? 'imv-admin-card--inativo' : ''}">
        <div class="imv-admin-card__media">
          ${img}
          <div class="imv-admin-card__badges">
            <span class="imv-admin-badge imv-admin-badge--${imv.operacao === 'aluguel' ? 'aluguel' : 'venda'}">${OP_LABEL[imv.operacao] || 'Venda'}</span>
            ${imv.destaque ? '<span class="imv-admin-badge imv-admin-badge--destaque">Destaque</span>' : ''}
            ${imv.ativo === false ? '<span class="imv-admin-badge imv-admin-badge--inativo">Inativo</span>' : ''}
            ${imvAcimaDoLimite ? '<span class="imv-admin-badge imv-admin-badge--limite">Acima do limite</span>' : ''}
          </div>
        </div>
        <div class="imv-admin-card__body">
          <h3 class="imv-admin-card__title">${esc(imv.titulo)}</h3>
          <p class="imv-admin-card__meta">${TIPO_LABEL[imv.tipo] || ''}${loc ? ' · ' + esc(loc) : ''}</p>
          <p class="imv-admin-card__price">${preco}</p>
        </div>
        <div class="imv-admin-card__actions">
          <button type="button" data-acao="editar" data-id="${imv.id}">Editar</button>
          <button type="button" data-acao="toggle" data-id="${imv.id}">${imv.ativo === false ? 'Reativar' : 'Desativar'}</button>
        </div>
      </article>`;
  }).join('');
}

listaEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const imv = imoveis.find(i => i.id === btn.dataset.id);
  if (!imv) return;

  if (btn.dataset.acao === 'editar') {
    abrirEditor(imv);
  } else {
    btn.disabled = true;
    try {
      await updateDoc(docImovel(imv.id), { ativo: imv.ativo === false, updatedAt: serverTimestamp() });
      imv.ativo = imv.ativo === false;
      renderLista();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alert('Não foi possível atualizar. Tente novamente.');
    }
  }
});

$('imv-novo-btn').addEventListener('click', () => {
  const { limite, ativos } = separarPorLimite();
  if (Number.isFinite(limite) && ativos.length >= limite) {
    alert(`Limite do plano atingido (${ativos.length} de ${limite} imóveis). Para publicar mais, é preciso fazer upgrade ou regularizar a assinatura.`);
    return;
  }
  abrirEditor(null);
});
$('imv-voltar-btn').addEventListener('click', fecharEditor);
$('imv-cancelar-btn').addEventListener('click', fecharEditor);

// ════════════════════════════════════════════════
// Editor
// ════════════════════════════════════════════════
async function abrirEditor(imv) {
  editId    = imv ? imv.id : null;
  fotos     = [];
  removidas = [];
  capaIdx   = 0;

  $('imv-form-titulo').textContent = imv ? 'Editar Imóvel' : 'Novo Imóvel';
  excluirBtn.hidden = !imv;
  mostrarMsg(null);
  form.reset();
  $('imv-cidade').value = imv?.cidade ?? 'Assunção';

  if (imv) {
    $('imv-titulo').value       = imv.titulo || '';
    $('imv-operacao').value     = imv.operacao || 'venda';
    $('imv-tipo').value         = imv.tipo || 'apartamento';
    $('imv-estagio').value      = imv.estagio || 'pronto';
    $('imv-bairro').value       = imv.bairro || '';
    $('imv-preco-venda').value  = imv.precoVenda || '';
    $('imv-preco-aluguel').value = imv.precoAluguel || '';
    $('imv-quartos').value      = imv.quartos || '';
    $('imv-banheiros').value    = imv.banheiros || '';
    $('imv-vagas').value        = imv.vagas || '';
    $('imv-area').value         = imv.areaM2 || '';
    $('imv-descricao').value    = imv.descricao || '';
    $('imv-destaque').checked   = !!imv.destaque;
    $('imv-ativo').checked      = imv.ativo !== false;
  }

  // marca as comodidades salvas (form.reset() já desmarcou todas)
  const coms = imv?.comodidades || [];
  document.querySelectorAll('#imv-comodidades input').forEach(cb => {
    cb.checked = coms.includes(cb.value);
  });

  renderFotos();
  listaView.hidden  = true;
  editorView.hidden = false;
  window.scrollTo({ top: 0 });

  // carrega as fotos existentes da subcoleção
  if (imv) {
    fotosGrid.innerHTML = '<p class="imv-hint">Carregando fotos...</p>';
    try {
      const snap = await getDocs(query(colFotos(imv.id), orderBy('ordem')));
      // o editor pode já ter sido fechado/trocado nesse meio tempo
      if (editId !== imv.id) return;
      fotos = snap.docs.map(d => ({ id: d.id, data: d.data().data }));
      capaIdx = 0;
      renderFotos();
    } catch (e) {
      console.error('Erro ao carregar fotos:', e);
      renderFotos();
      mostrarMsg('Não foi possível carregar as fotos existentes.', true);
    }
  }
}

function fecharEditor() {
  editId = null;
  editorView.hidden = true;
  listaView.hidden  = false;
  window.scrollTo({ top: 0 });
}

// ── Fotos no editor ────────────────────────────
function renderFotos() {
  if (capaIdx >= fotos.length) capaIdx = 0;
  fotosGrid.innerHTML = fotos.map((f, i) => `
    <div class="imv-foto ${i === capaIdx ? 'imv-foto--capa' : ''}">
      <img src="${f.data}" alt="Foto ${i + 1}">
      <button type="button" class="imv-foto__btn imv-foto__btn--capa" data-capa="${i}" aria-label="Definir como capa" title="Definir como capa">
        <svg viewBox="0 0 24 24" fill="${i === capaIdx ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
      <button type="button" class="imv-foto__btn imv-foto__btn--del" data-del="${i}" aria-label="Remover foto" title="Remover foto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${i === capaIdx ? '<span class="imv-foto__tag">Capa</span>' : ''}
    </div>
  `).join('');
}

fotosGrid.addEventListener('click', (e) => {
  const capaBtn = e.target.closest('[data-capa]');
  const delBtn  = e.target.closest('[data-del]');
  if (capaBtn) {
    capaIdx = Number(capaBtn.dataset.capa);
    renderFotos();
  } else if (delBtn) {
    const i = Number(delBtn.dataset.del);
    if (fotos[i].id) removidas.push(fotos[i].id);
    fotos.splice(i, 1);
    if (capaIdx >= i && capaIdx > 0) capaIdx--;
    renderFotos();
  }
});

fotosInput.addEventListener('change', async () => {
  const arquivos = Array.from(fotosInput.files || []);
  fotosInput.value = '';
  if (!arquivos.length) return;

  if (fotos.length + arquivos.length > MAX_FOTOS) {
    mostrarMsg(`Máximo de ${MAX_FOTOS} fotos por imóvel.`, true);
    arquivos.length = MAX_FOTOS - fotos.length;
    if (!arquivos.length) return;
  }

  mostrarMsg(`Processando ${arquivos.length} foto(s)...`);
  for (const file of arquivos) {
    try {
      const data = await comprimirArquivo(file, LARGURA_FOTO);
      fotos.push({ data });
      renderFotos();
    } catch (e) {
      console.error('Erro ao processar foto:', e);
      mostrarMsg(`Não foi possível processar "${file.name}".`, true);
    }
  }
  mostrarMsg(null);
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

  const titulo = $('imv-titulo').value.trim();
  if (!titulo) {
    mostrarMsg('Informe o título do anúncio.', true);
    $('imv-titulo').focus();
    return;
  }

  salvarBtn.disabled = true;
  mostrarMsg('Salvando...');

  try {
    // capa = miniatura da foto escolhida (recomprimida menor para a listagem)
    let capa = null;
    if (fotos.length) capa = await comprimir(fotos[capaIdx].data, LARGURA_CAPA);

    const dados = {
      titulo,
      operacao:     $('imv-operacao').value,
      tipo:         $('imv-tipo').value,
      estagio:      $('imv-estagio').value,
      cidade:       $('imv-cidade').value.trim(),
      bairro:       $('imv-bairro').value.trim(),
      precoVenda:   Number($('imv-preco-venda').value)   || null,
      precoAluguel: Number($('imv-preco-aluguel').value) || null,
      quartos:      Number($('imv-quartos').value)   || null,
      banheiros:    Number($('imv-banheiros').value) || null,
      vagas:        Number($('imv-vagas').value)     || null,
      areaM2:       Number($('imv-area').value)      || null,
      descricao:    $('imv-descricao').value.trim(),
      comodidades:  [...document.querySelectorAll('#imv-comodidades input:checked')].map(cb => cb.value),
      destaque:     $('imv-destaque').checked,
      ativo:        $('imv-ativo').checked,
      capa,
      fotosCount:   fotos.length,
      updatedAt:    serverTimestamp(),
    };

    let id = editId;
    if (id) {
      await updateDoc(docImovel(id), dados);
    } else {
      const ref = await addDoc(colImoveis(), { ...dados, createdAt: serverTimestamp() });
      id = ref.id;
    }

    // sincroniza a subcoleção de fotos em lote
    const batch = writeBatch(db);
    removidas.forEach(fid => batch.delete(docFoto(id, fid)));
    fotos.forEach((f, i) => {
      if (f.id) {
        batch.update(docFoto(id, f.id), { ordem: i });
      } else {
        batch.set(doc(colFotos(id)), {
          data: f.data, ordem: i, createdAt: serverTimestamp(),
        });
      }
    });
    await batch.commit();

    mostrarMsg('Imóvel salvo com sucesso!');
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
  if (!confirm('Excluir este imóvel definitivamente? As fotos também serão apagadas.')) return;

  excluirBtn.disabled = true;
  mostrarMsg('Excluindo...');
  try {
    // apaga primeiro as fotos da subcoleção
    const snap = await getDocs(colFotos(editId));
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    await deleteDoc(docImovel(editId));

    await carregarLista();
    fecharEditor();
  } catch (err) {
    console.error('Erro ao excluir:', err);
    mostrarMsg('Erro ao excluir: ' + (err.message || 'tente novamente.'), true);
  } finally {
    excluirBtn.disabled = false;
  }
});
