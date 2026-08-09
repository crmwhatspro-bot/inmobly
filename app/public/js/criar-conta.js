// ════════════════════════════════════════════════
// criar-conta.html — cria o tenant (brokers/{slug}) chamando a
// function criarConta e segue pro tour assim que o custom claim
// tenantId estiver disponível no token.
// ════════════════════════════════════════════════
import { auth, onAuthChange } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { getIdToken } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { tenantIdAtual } from './tenant.js';
import { capturarAtribuicao, lerAtribuicao } from './atribuicao.js';

// No top-level, antes de qualquer coisa: o guard de auth logo abaixo
// pode redirecionar pra login.html e o ?vid= da landing morre no
// caminho. Capturado aqui, ele já está no localStorage quando o
// usuário voltar do Google e enviar o formulário.
capturarAtribuicao();

const $ = (id) => document.getElementById(id);
const form  = $('formConta');
const slugI = $('slug');
const preview = $('slugPreview');
const previewWarn = $('slugPreviewWarn');
const btn   = $('btnCriar');
const msg   = $('contaMsg');
const slugErro = $('slugError');

const functions = getFunctions(auth.app, 'southamerica-east1');
const criarConta = httpsCallable(functions, 'criarConta');

// Indique e ganhe: o link de indicação (?ref=<slug-de-quem-indicou>)
// pode cair aqui direto, mas se quem clicou ainda não tinha login, o
// fluxo passa por login.html e volta pra cá sem query string — por
// isso persiste em localStorage assim que aparece, e sempre lê de lá
// na hora de enviar (funciona nas duas ordens: ref antes ou depois do
// login).
const REF_KEY = 'pa-ref';
const refDaUrl = new URLSearchParams(location.search).get('ref');
if (refDaUrl) localStorage.setItem(REF_KEY, refDaUrl);

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

slugI.addEventListener('input', () => {
  const s = slugify(slugI.value);
  preview.textContent = s || 'seu-slug';
  previewWarn.textContent = s || 'seu-slug';
});

// Guarda de acesso: precisa estar logado; se já tem tenant, pula direto.
onAuthChange(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  const tenantId = await tenantIdAtual();
  if (tenantId) location.href = 'tour.html';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  msg.className = 'msg';
  slugErro.textContent = '';

  const nome = $('nome').value.trim();
  const slug = slugify(slugI.value);
  if (!slug) {
    slugErro.textContent = 'Escolha um endereço pra continuar.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Criando...';
  try {
    const ref = localStorage.getItem(REF_KEY) || undefined;
    await criarConta({ nome, slug, atribuicao: lerAtribuicao(), ref });
    localStorage.removeItem(REF_KEY);
    // custom claim acabou de ser setado pela function — força refresh
    // do token antes de seguir, senão a próxima página não enxerga o tenant
    await getIdToken(auth.currentUser, true);
    location.href = 'tour.html';
  } catch (err) {
    if (err.code === 'functions/already-exists') {
      slugErro.textContent = 'Esse endereço já está em uso — escolha outro.';
    } else {
      msg.textContent = 'Não foi possível criar a conta: ' + err.message;
      msg.className = 'msg msg--err';
    }
    btn.disabled = false;
    btn.textContent = 'Criar minha conta →';
  }
});
