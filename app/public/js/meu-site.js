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
import { initShell, pageSignal } from './shell.js';

const $ = (id) => document.getElementById(id);

// Status / publicação
const publicarSwitch  = $('msPublicarSwitch');
const atualizarBtn    = $('msAtualizarBtn');
const verSiteLink     = $('msVerSite');
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
const idiomaInput     = $('ms-idioma');

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

// Google Tag Manager
const gtmInput     = $('ms-gtm-id');
const gtmMsg       = $('msGtmMsg');
const salvarGtmBtn = $('msSalvarGtmBtn');

// Preview
const abrirPreviewBtn  = $('msAbrirPreviewBtn');
const previewModal     = $('msPreviewModal');
const previewFrame     = $('msPreviewFrame');
const fecharPreviewBtn = $('msPreviewFecharBtn');
const previewErroEl    = $('msPreviewErro');
const previewTentarBtn = $('msPreviewTentarBtn');

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
let previewTimeout = null;

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
    language: idiomaInput.value,
  };
}

function enviarPreview() {
  if (previewModal.hidden || !previewPronto || !previewFrame.contentWindow) return;
  previewFrame.contentWindow.postMessage({ tipo: 'pa-preview-perfil', perfil: perfilAtualDoFormulario() }, '*');
}
const enviarPreviewDebounced = debounce(enviarPreview, 200);

window.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'pa-preview-pronto') return;
  clearTimeout(previewTimeout);
  previewErroEl.hidden = true;
  previewPronto = true;
  enviarPreview();
}, { signal: pageSignal() });

// O iframe já tem um fallback próprio de 6s pra quando o handshake se
// perde (ver site/js/imoveis.js#iniciarPreview) — mas ele mora DENTRO
// do módulo que precisa carregar. Se o import do SDK do Firestore não
// resolver (gstatic.com fora do ar, rede que bloqueia recurso externo,
// offline), o módulo inteiro nunca roda: nem o conteúdo aparece, nem o
// fallback dele é armado, e o corretor fica olhando um spinner eterno
// achando que o site dele quebrou. Esta guarda é do lado de cá, onde o
// código com certeza está rodando.
const PREVIEW_TIMEOUT_MS = 8000;

function carregarPreviewFrame() {
  previewPronto = false;
  previewCarregado = true;
  previewErroEl.hidden = true;

  // ?t= deixa o preview buscar os imóveis reais do tenant direto do
  // Firestore (já são públicos) — só cai pros de exemplo se não
  // tiver nenhum ainda. Ver site/js/imoveis.js#iniciarPreview.
  // ?r= muda a URL a cada tentativa: reatribuir um src idêntico nem
  // sempre força recarga, e um "tentar de novo" que não tenta nada é
  // pior que não ter o botão.
  previewFrame.src = `site/index.html?preview=1&t=${encodeURIComponent(tenantId)}&r=${Date.now()}`;

  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => { previewErroEl.hidden = false; }, PREVIEW_TIMEOUT_MS);
}

function abrirPreview() {
  if (!previewCarregado) carregarPreviewFrame();
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
previewTentarBtn.addEventListener('click', carregarPreviewFrame);
previewModal.addEventListener('click', (e) => { if (e.target === previewModal) fecharPreview(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewModal.classList.contains('open')) fecharPreview();
}, { signal: pageSignal() });

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
    const dados = { name: nome, accentColor: corSelecionada, language: idiomaInput.value, logo: logoAtualDataUrl || '', updatedAt: serverTimestamp() };
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

// ── Google Tag Manager: salvar (opcional) ───────────
const GTM_ID_REGEX = /^GTM-[A-Z0-9]+$/;

async function salvarGtm() {
  const valor = gtmInput.value.trim().toUpperCase();
  if (valor && !GTM_ID_REGEX.test(valor)) {
    mostrarMsg(gtmMsg, 'ID inválido — deve ter o formato GTM-XXXXXXX.', 'erro');
    return;
  }
  salvarGtmBtn.disabled = true;
  const textoOriginal = salvarGtmBtn.textContent;
  salvarGtmBtn.textContent = 'Salvando...';
  try {
    const dados = { gtmId: valor, updatedAt: serverTimestamp() };
    await updateDoc(doc(db, 'brokers', tenantId), dados);
    Object.assign(broker, dados);
    gtmInput.value = valor;
    mostrarMsg(gtmMsg, valor ? 'Google Tag Manager conectado.' : 'Google Tag Manager desconectado.', 'ok');
  } catch (err) {
    mostrarMsg(gtmMsg, 'Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarGtmBtn.disabled = false;
    salvarGtmBtn.textContent = textoOriginal;
  }
}

// ── Status / publicação ────────────────────────────
// Um switch só, em vez de 3 botões separados (Publicar/Despublicar
// eram dois botões trocando de hidden, ficava largo e no mobile o
// texto do botão não cabia). "Atualizar" fica à parte porque é uma
// ação diferente — não muda published, só reenvia o conteúdo mais
// recente pro Hosting.
function atualizarStatusTexto() {
  const publicado = broker.published === true;
  publicarSwitch.checked = publicado;
  statusTitulo.textContent = publicado ? 'Site publicado' : 'Site não publicado';
  statusSub.textContent = publicado
    ? `Ao vivo em ${tenantId}.sitemob.app`
    : broker.whatsapp
      ? 'Seu WhatsApp está configurado — ative pra publicar.'
      : 'Configure seu WhatsApp de contato antes de publicar.';

  atualizarBtn.hidden = !publicado;
  verSiteLink.hidden = !publicado;
  if (publicado) verSiteLink.href = `https://${tenantId}.sitemob.app/`;
}

async function alternarPublicacao() {
  const querPublicar = publicarSwitch.checked;

  if (querPublicar && !broker.whatsapp) {
    publicarSwitch.checked = false;
    mostrarMsg(contatoMsg, 'Configure e salve seu WhatsApp antes de publicar.', 'erro');
    return;
  }

  publicarSwitch.disabled = true;
  statusTitulo.textContent = querPublicar ? 'Publicando... (pode levar alguns segundos)' : 'Despublicando...';
  statusSub.textContent = '';

  try {
    if (querPublicar) {
      await publicarSiteFn();
      broker.published = true;
    } else {
      await updateDoc(doc(db, 'brokers', tenantId), { published: false, updatedAt: serverTimestamp() });
      broker.published = false;
    }
  } catch (err) {
    publicarSwitch.checked = !querPublicar; // desfaz visualmente, a ação não terminou
    mostrarMsg(contatoMsg, `Não foi possível ${querPublicar ? 'publicar' : 'despublicar'}: ${err.message}`, 'erro');
  } finally {
    publicarSwitch.disabled = false;
    atualizarStatusTexto();
  }
}

// Republica o conteúdo mais recente sem sair do estado publicado —
// sem isso, a única forma de levar uma mudança pro site já publicado
// era despublicar (catálogo fica "indisponível" por um tempo) e
// publicar de novo.
async function atualizarSitePublicado() {
  atualizarBtn.disabled = true;
  const original = atualizarBtn.innerHTML;
  atualizarBtn.style.opacity = '0.5';
  try {
    await publicarSiteFn();
  } catch (err) {
    mostrarMsg(contatoMsg, 'Não foi possível atualizar: ' + err.message, 'erro');
  } finally {
    atualizarBtn.disabled = false;
    atualizarBtn.style.opacity = '';
    atualizarBtn.innerHTML = original;
  }
}

salvarIdentidadeBtn.addEventListener('click', salvarIdentidade);
salvarTextosBtn.addEventListener('click', salvarTextos);
salvarContatoBtn.addEventListener('click', salvarContato);
salvarGtmBtn.addEventListener('click', salvarGtm);
publicarSwitch.addEventListener('change', alternarPublicacao);
atualizarBtn.addEventListener('click', atualizarSitePublicado);

[whatsappInput, nomeInput, headlineInput, subheadlineInput, sobreInput, keywordsInput, emailInput, instagramInput].forEach(el => {
  el.addEventListener('input', enviarPreviewDebounced);
});
idiomaInput.addEventListener('change', enviarPreviewDebounced);

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
  gtmInput.value = broker.gtmId || '';
  logoAtualDataUrl = broker.logo || null;
  corSelecionada = broker.accentColor || ACCENT_PADRAO;
  idiomaInput.value = broker.language || 'es';

  atualizarLogoPreview();
  montarSwatches();
  atualizarStatusTexto();
});
