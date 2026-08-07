// ════════════════════════════════════════════════
// meu-site.html — identidade visual (logo, nome, cor), textos do
// site (headline, subheadline, sobre, keywords), contato (whatsapp,
// email, instagram), publicar/despublicar, e o preview ao vivo.
//
// O preview abre num modal só quando o corretor clica em
// "Pré-visualizar site" — o <iframe> só recebe `src` nesse momento
// (não carrega sozinho ao abrir a página). Ele roda site/index.html
// no modo preview (?preview=1, ver site/js/imoveis.js), que não
// toca Firestore nem a function perfilPublico: espera receber o
// perfil por postMessage e mostra 3 imóveis de exemplo fixos, só
// pra ilustrar o layout — funciona mesmo sem ter publicado ou
// cadastrado nenhum imóvel de verdade ainda.
// ════════════════════════════════════════════════
import { db, auth } from './firebase.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);

// Status / publicação
const publicarBtn     = $('msPublicarBtn');
const atualizarBtn    = $('msAtualizarBtn');
const despublicarBtn  = $('msDespublicarBtn');
const verSiteLink     = $('msVerSite');
const statusDot       = $('msStatusDot');
const statusTitulo    = $('msStatusTitulo');
const statusSub       = $('msStatusSub');

// Identidade
const nomeInput       = $('ms-nome');
const identidadeMsg   = $('msIdentidadeMsg');
const salvarIdentidadeBtn = $('msSalvarIdentidadeBtn');
const logoInput       = $('ms-logo-input');
const logoBtn         = $('msLogoBtn');
const logoPreviewEl   = $('msLogoPreview');
const swatchesWrap    = $('msColorSwatches');

// Textos
const headlineInput    = $('ms-headline');
const subheadlineInput = $('ms-subheadline');
const sobreInput       = $('ms-sobre');
const keywordsInput    = $('ms-keywords');
const textosMsg        = $('msTextosMsg');
const salvarTextosBtn  = $('msSalvarTextosBtn');

// Contato
const whatsappInput   = $('ms-whatsapp');
const emailInput      = $('ms-email');
const instagramInput  = $('ms-instagram');
const contatoMsg      = $('msContatoMsg');
const salvarContatoBtn = $('msSalvarContatoBtn');

// Preview
const abrirPreviewBtn  = $('msAbrirPreviewBtn');
const previewModal     = $('msPreviewModal');
const previewFrame     = $('msPreviewFrame');
const fecharPreviewBtn = $('msPreviewFecharBtn');

const LOGO_PLACEHOLDER_HTML = logoPreviewEl.innerHTML;

const PRESETS_COR = [
  { nome: 'Dourado',         hex: '#C8922A' },
  { nome: 'Azul petróleo',   hex: '#1D6F8C' },
  { nome: 'Verde esmeralda', hex: '#0F9D6B' },
  { nome: 'Vinho',           hex: '#9B3747' },
  { nome: 'Terracota',       hex: '#C1653A' },
  { nome: 'Azul marinho',    hex: '#2E5C8A' },
];
const ACCENT_PADRAO = '#C8922A';

const functions = getFunctions(auth.app, 'southamerica-east1');
const publicarSiteFn = httpsCallable(functions, 'publicarSite');

let tenantId = null;
let broker = null;
let corSelecionada = ACCENT_PADRAO;
let logoAtualDataUrl = null;
let previewCarregado = false;
let previewPronto = false;

function mostrarMsg(el, texto, tipo) {
  el.textContent = texto;
  el.className = 'imv-form-msg imv-form-msg--' + tipo;
  el.hidden = false;
}

function digitsOnly(s) { return String(s || '').replace(/\D/g, '').replace(/^0+/, ''); }
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Preview (modal, lazy) ──────────────────────────
function perfilAtualDoFormulario() {
  const wa = whatsappInput.value ? '595' + digitsOnly(whatsappInput.value) : (broker?.whatsapp || null);
  return {
    name: nomeInput.value.trim() || broker?.name || 'Tu empresa',
    whatsapp: wa,
    logo: logoAtualDataUrl,
    headline: headlineInput.value.trim(),
    subheadline: subheadlineInput.value.trim(),
    about: sobreInput.value.trim(),
    keywords: keywordsInput.value.trim(),
    email: emailInput.value.trim(),
    instagramUrl: instagramInput.value.trim(),
    accentColor: corSelecionada,
  };
}

function enviarPreview() {
  if (previewModal.hidden || !previewPronto || !previewFrame.contentWindow) return;
  previewFrame.contentWindow.postMessage({ tipo: 'pa-preview-perfil', perfil: perfilAtualDoFormulario() }, '*');
}
const enviarPreviewDebounced = debounce(enviarPreview, 200);

window.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'pa-preview-pronto') return;
  previewPronto = true;
  enviarPreview();
});

function abrirPreview() {
  if (!previewCarregado) {
    // ?t= deixa o preview buscar os imóveis reais do tenant direto do
    // Firestore (já são públicos) — só cai pros de exemplo se não
    // tiver nenhum ainda. Ver site/js/imoveis.js#iniciarPreview.
    previewFrame.src = `site/index.html?preview=1&t=${encodeURIComponent(tenantId)}`;
    previewCarregado = true;
  }
  previewModal.hidden = false;
  requestAnimationFrame(() => previewModal.classList.add('open'));
  document.body.style.overflow = 'hidden';
  enviarPreview();
}
function fecharPreview() {
  previewModal.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { previewModal.hidden = true; }, 300);
}
document.querySelectorAll('.ms-preview-device').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ms-preview-device').forEach(b => b.classList.toggle('active', b === btn));
    previewFrame.style.width = btn.dataset.w;
  });
});

abrirPreviewBtn.addEventListener('click', abrirPreview);
fecharPreviewBtn.addEventListener('click', fecharPreview);
previewModal.addEventListener('click', (e) => { if (e.target === previewModal) fecharPreview(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewModal.classList.contains('open')) fecharPreview();
});

// ── Logo: mesma técnica de compressão de admin-imoveis.js (canvas
// → WebP/JPEG, sem Storage), só que menor — é um logo, não foto de
// imóvel.
function carregarImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function canvasParaDataURL(canvas, qualidade) {
  const webp = canvas.toDataURL('image/webp', qualidade);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', qualidade);
}
const LOGO_LARGURA_MAX = 400;
const LOGO_MAX_DATAURL = 180_000;
async function comprimirLogo(src) {
  const img = await carregarImg(src);
  let escala = Math.min(1, LOGO_LARGURA_MAX / img.naturalWidth);
  let qualidade = 0.85;
  let resultado;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resultado = canvasParaDataURL(canvas, qualidade);
    if (resultado.length <= LOGO_MAX_DATAURL) return resultado;
    qualidade -= 0.15;
    escala *= 0.8;
  }
  return resultado;
}

function atualizarLogoPreview() {
  logoPreviewEl.innerHTML = logoAtualDataUrl
    ? `<img src="${logoAtualDataUrl}" alt="Logo">`
    : LOGO_PLACEHOLDER_HTML;
}

logoBtn.addEventListener('click', () => logoInput.click());
logoInput.addEventListener('change', async () => {
  const file = logoInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    logoAtualDataUrl = await comprimirLogo(url);
    atualizarLogoPreview();
    enviarPreview();
  } catch {
    mostrarMsg(identidadeMsg, 'Não foi possível processar essa imagem.', 'erro');
  } finally {
    URL.revokeObjectURL(url);
    logoInput.value = '';
  }
});

// ── Cor de destaque ────────────────────────────────
function montarSwatches() {
  swatchesWrap.innerHTML = PRESETS_COR.map(c => `
    <button type="button" class="ms-color-swatch${c.hex === corSelecionada ? ' active' : ''}"
            style="background:${c.hex}" data-hex="${c.hex}" title="${c.nome}" aria-label="${c.nome}"></button>
  `).join('');
  swatchesWrap.querySelectorAll('.ms-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      corSelecionada = btn.dataset.hex;
      swatchesWrap.querySelectorAll('.ms-color-swatch').forEach(b => b.classList.toggle('active', b === btn));
      enviarPreview();
    });
  });
}

// ── Identidade: salvar (nome, logo, cor) ───────────
async function salvarIdentidade() {
  const nome = nomeInput.value.trim();
  if (!nome) {
    mostrarMsg(identidadeMsg, 'O nome da empresa é obrigatório.', 'erro');
    return;
  }
  salvarIdentidadeBtn.disabled = true;
  const textoOriginal = salvarIdentidadeBtn.textContent;
  salvarIdentidadeBtn.textContent = 'Salvando...';
  try {
    const dados = { name: nome, accentColor: corSelecionada, logo: logoAtualDataUrl || '', updatedAt: serverTimestamp() };
    await updateDoc(doc(db, 'brokers', tenantId), dados);
    Object.assign(broker, dados);
    mostrarMsg(identidadeMsg, 'Identidade salva.', 'ok');
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(identidadeMsg, 'Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarIdentidadeBtn.disabled = false;
    salvarIdentidadeBtn.textContent = textoOriginal;
  }
}

// ── Textos: salvar (headline, subheadline, sobre, keywords) ───
async function salvarTextos() {
  salvarTextosBtn.disabled = true;
  const textoOriginal = salvarTextosBtn.textContent;
  salvarTextosBtn.textContent = 'Salvando...';
  try {
    const dados = {
      headline: headlineInput.value.trim(),
      subheadline: subheadlineInput.value.trim(),
      about: sobreInput.value.trim(),
      keywords: keywordsInput.value.trim(),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'brokers', tenantId), dados);
    Object.assign(broker, dados);
    mostrarMsg(textosMsg, 'Textos salvos.', 'ok');
  } catch (err) {
    mostrarMsg(textosMsg, 'Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarTextosBtn.disabled = false;
    salvarTextosBtn.textContent = textoOriginal;
  }
}

// ── Contato: salvar (whatsapp, email, instagram) ───
async function salvarContato() {
  const digitos = digitsOnly(whatsappInput.value);
  if (digitos.length < 8) {
    mostrarMsg(contatoMsg, 'Informe um WhatsApp válido (pelo menos 8 dígitos).', 'erro');
    return;
  }
  salvarContatoBtn.disabled = true;
  const textoOriginal = salvarContatoBtn.textContent;
  salvarContatoBtn.textContent = 'Salvando...';
  try {
    const dados = {
      whatsapp: '595' + digitos,
      // contactEmail, não `email` — esse é o e-mail de login/conta,
      // não pode ser sobrescrito pelo formulário de contato do site.
      contactEmail: emailInput.value.trim(),
      instagramUrl: instagramInput.value.trim(),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'brokers', tenantId), dados);
    Object.assign(broker, dados);
    mostrarMsg(contatoMsg, 'Contato salvo.', 'ok');
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(contatoMsg, 'Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarContatoBtn.disabled = false;
    salvarContatoBtn.textContent = textoOriginal;
  }
}

// ── Status / publicação ────────────────────────────
function atualizarStatusTexto() {
  const publicado = broker.published === true;
  statusDot.classList.toggle('is-live', publicado);
  statusTitulo.textContent = publicado ? 'Seu site está publicado' : 'Seu site ainda não está publicado';
  statusSub.textContent = publicado
    ? `Ao vivo em ${tenantId}.web.app — qualquer pessoa com o link já consegue ver.`
    : broker.whatsapp
      ? 'Seu WhatsApp está configurado — clique em publicar quando quiser.'
      : 'Configure seu WhatsApp de contato antes de publicar.';

  publicarBtn.hidden = publicado;
  atualizarBtn.hidden = !publicado;
  despublicarBtn.hidden = !publicado;
  verSiteLink.hidden = !publicado;
  if (publicado) verSiteLink.href = `https://${tenantId}.web.app/`;
}

// Publicar (1ª vez) e Atualizar (republicar o que já está no ar, com
// o conteúdo mais recente) chamam a mesma function — ela já é segura
// pra rodar de novo (cria uma versão/release nova no Hosting toda
// vez). Sem o botão "Atualizar", a única forma de levar uma mudança
// pro site já publicado era Despublicar (o catálogo fica indisponível
// por um tempo) e Publicar de novo — desnecessário e confuso.
async function publicarOuAtualizar(btn) {
  if (!broker.whatsapp) {
    mostrarMsg(contatoMsg, 'Configure e salve seu WhatsApp antes de publicar.', 'erro');
    return;
  }
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Publicando... (pode levar alguns segundos)';
  try {
    await publicarSiteFn();
    broker.published = true;
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(contatoMsg, 'Não foi possível publicar: ' + err.message, 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function despublicar() {
  despublicarBtn.disabled = true;
  try {
    await updateDoc(doc(db, 'brokers', tenantId), { published: false, updatedAt: serverTimestamp() });
    broker.published = false;
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(contatoMsg, 'Não foi possível despublicar: ' + err.message, 'erro');
  } finally {
    despublicarBtn.disabled = false;
  }
}

salvarIdentidadeBtn.addEventListener('click', salvarIdentidade);
salvarTextosBtn.addEventListener('click', salvarTextos);
salvarContatoBtn.addEventListener('click', salvarContato);
publicarBtn.addEventListener('click', () => publicarOuAtualizar(publicarBtn));
atualizarBtn.addEventListener('click', () => publicarOuAtualizar(atualizarBtn));
despublicarBtn.addEventListener('click', despublicar);

[whatsappInput, nomeInput, headlineInput, subheadlineInput, sobreInput, keywordsInput, emailInput, instagramInput].forEach(el => {
  el.addEventListener('input', enviarPreviewDebounced);
});

initShell({ active: 'site', title: 'Meu Site' }).then((resultado) => {
  tenantId = resultado.tenantId;
  broker = resultado.broker;

  whatsappInput.value = broker.whatsapp ? broker.whatsapp.replace(/^595/, '') : '';
  emailInput.value = broker.contactEmail || '';
  instagramInput.value = broker.instagramUrl || '';
  nomeInput.value = broker.name || '';
  headlineInput.value = broker.headline || '';
  subheadlineInput.value = broker.subheadline || '';
  sobreInput.value = broker.about || '';
  keywordsInput.value = broker.keywords || '';
  logoAtualDataUrl = broker.logo || null;
  corSelecionada = broker.accentColor || ACCENT_PADRAO;

  atualizarLogoPreview();
  montarSwatches();
  atualizarStatusTexto();
});
