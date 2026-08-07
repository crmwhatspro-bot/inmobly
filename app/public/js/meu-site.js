// ════════════════════════════════════════════════
// meu-site.html — identidade visual (logo, nome, descrição,
// palavras-chave, cor), whatsapp de contato, publicar/despublicar,
// e o preview ao vivo (iframe com site/index.html?preview=1).
//
// O preview roda num modo próprio (ver site/js/imoveis.js) que não
// toca Firestore nem a function perfilPublico — ele só espera
// receber o perfil por postMessage e mostra 3 imóveis de exemplo
// fixos. Isso deixa o preview funcionando com qualquer combinação
// de campos preenchidos/vazios e mesmo antes de publicar ou
// cadastrar qualquer imóvel de verdade.
// ════════════════════════════════════════════════
import { db, auth } from './firebase.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);

const whatsappInput   = $('ms-whatsapp');
const whatsappMsg     = $('msWhatsappMsg');
const salvarWaBtn     = $('msSalvarWhatsappBtn');
const publicarBtn     = $('msPublicarBtn');
const despublicarBtn  = $('msDespublicarBtn');
const verSiteLink     = $('msVerSite');
const statusDot       = $('msStatusDot');
const statusTitulo    = $('msStatusTitulo');
const statusSub       = $('msStatusSub');

const nomeInput       = $('ms-nome');
const descricaoInput  = $('ms-descricao');
const keywordsInput   = $('ms-keywords');
const identidadeMsg   = $('msIdentidadeMsg');
const salvarIdentidadeBtn = $('msSalvarIdentidadeBtn');
const logoInput       = $('ms-logo-input');
const logoPreviewEl   = $('msLogoPreview');
const swatchesWrap    = $('msColorSwatches');
const previewFrame    = $('msPreviewFrame');

const LOGO_PLACEHOLDER_HTML = logoPreviewEl.innerHTML;

const PRESETS_COR = [
  { nome: 'Dourado',        hex: '#C8922A' },
  { nome: 'Azul petróleo',  hex: '#1D6F8C' },
  { nome: 'Verde esmeralda', hex: '#0F9D6B' },
  { nome: 'Vinho',          hex: '#9B3747' },
  { nome: 'Terracota',      hex: '#C1653A' },
  { nome: 'Azul marinho',   hex: '#2E5C8A' },
];
const ACCENT_PADRAO = '#C8922A';

const functions = getFunctions(auth.app, 'southamerica-east1');
const publicarSiteFn = httpsCallable(functions, 'publicarSite');

let tenantId = null;
let broker = null;
let corSelecionada = ACCENT_PADRAO;
let logoAtualDataUrl = null;
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

// ── Preview ao vivo ────────────────────────────────
function perfilAtualDoFormulario() {
  const wa = whatsappInput.value ? '595' + digitsOnly(whatsappInput.value) : (broker?.whatsapp || null);
  return {
    name: nomeInput.value.trim() || broker?.name || 'Tu empresa',
    whatsapp: wa,
    logo: logoAtualDataUrl,
    description: descricaoInput.value.trim(),
    keywords: keywordsInput.value.trim(),
    accentColor: corSelecionada,
  };
}

function enviarPreview() {
  if (!previewPronto || !previewFrame.contentWindow) return;
  previewFrame.contentWindow.postMessage({ tipo: 'pa-preview-perfil', perfil: perfilAtualDoFormulario() }, '*');
}
const enviarPreviewDebounced = debounce(enviarPreview, 200);

window.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'pa-preview-pronto') return;
  previewPronto = true;
  enviarPreview();
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

// ── Identidade: salvar ─────────────────────────────
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
    const dados = {
      name: nome,
      description: descricaoInput.value.trim(),
      keywords: keywordsInput.value.trim(),
      accentColor: corSelecionada,
      logo: logoAtualDataUrl || '',
      updatedAt: serverTimestamp(),
    };
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
  despublicarBtn.hidden = !publicado;
  verSiteLink.hidden = !publicado;
  if (publicado) verSiteLink.href = `https://${tenantId}.web.app/`;
}

async function salvarWhatsapp() {
  const digitos = digitsOnly(whatsappInput.value);
  if (digitos.length < 8) {
    mostrarMsg(whatsappMsg, 'Informe um número válido (pelo menos 8 dígitos).', 'erro');
    return;
  }
  salvarWaBtn.disabled = true;
  salvarWaBtn.textContent = 'Salvando...';
  try {
    const whatsapp = '595' + digitos;
    await updateDoc(doc(db, 'brokers', tenantId), { whatsapp, updatedAt: serverTimestamp() });
    broker.whatsapp = whatsapp;
    mostrarMsg(whatsappMsg, 'WhatsApp salvo.', 'ok');
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(whatsappMsg, 'Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarWaBtn.disabled = false;
    salvarWaBtn.textContent = 'Salvar WhatsApp';
  }
}

async function publicar() {
  if (!broker.whatsapp) {
    mostrarMsg(whatsappMsg, 'Configure e salve seu WhatsApp antes de publicar.', 'erro');
    return;
  }
  publicarBtn.disabled = true;
  const textoOriginal = publicarBtn.textContent;
  publicarBtn.textContent = 'Publicando... (pode levar alguns segundos)';
  try {
    await publicarSiteFn();
    broker.published = true;
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(whatsappMsg, 'Não foi possível publicar: ' + err.message, 'erro');
  } finally {
    publicarBtn.disabled = false;
    publicarBtn.textContent = textoOriginal;
  }
}

async function despublicar() {
  despublicarBtn.disabled = true;
  try {
    await updateDoc(doc(db, 'brokers', tenantId), { published: false, updatedAt: serverTimestamp() });
    broker.published = false;
    atualizarStatusTexto();
  } catch (err) {
    mostrarMsg(whatsappMsg, 'Não foi possível despublicar: ' + err.message, 'erro');
  } finally {
    despublicarBtn.disabled = false;
  }
}

salvarWaBtn.addEventListener('click', salvarWhatsapp);
salvarIdentidadeBtn.addEventListener('click', salvarIdentidade);
publicarBtn.addEventListener('click', publicar);
despublicarBtn.addEventListener('click', despublicar);

[whatsappInput, nomeInput, descricaoInput, keywordsInput].forEach(el => {
  el.addEventListener('input', enviarPreviewDebounced);
});

initShell({ active: 'site', title: 'Meu Site' }).then((resultado) => {
  tenantId = resultado.tenantId;
  broker = resultado.broker;

  whatsappInput.value = broker.whatsapp ? broker.whatsapp.replace(/^595/, '') : '';
  nomeInput.value = broker.name || '';
  descricaoInput.value = broker.description || '';
  keywordsInput.value = broker.keywords || '';
  logoAtualDataUrl = broker.logo || null;
  corSelecionada = broker.accentColor || ACCENT_PADRAO;

  atualizarLogoPreview();
  montarSwatches();
  atualizarStatusTexto();
  enviarPreview();
});
