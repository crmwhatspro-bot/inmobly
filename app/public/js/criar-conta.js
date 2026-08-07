// ════════════════════════════════════════════════
// criar-conta.html — cria o tenant (brokers/{slug}) chamando a
// function criarConta e segue pro tour assim que o custom claim
// tenantId estiver disponível no token.
// ════════════════════════════════════════════════
import { auth, onAuthChange } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { getIdToken } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { tenantIdAtual } from './tenant.js';

const $ = (id) => document.getElementById(id);
const form  = $('formConta');
const slugI = $('slug');
const preview = $('slugPreview');
const btn   = $('btnCriar');
const msg   = $('contaMsg');
const slugErro = $('slugError');

const functions = getFunctions(auth.app, 'southamerica-east1');
const criarConta = httpsCallable(functions, 'criarConta');

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

slugI.addEventListener('input', () => {
  const s = slugify(slugI.value);
  preview.textContent = s || 'seu-slug';
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
    await criarConta({ nome, slug });
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
