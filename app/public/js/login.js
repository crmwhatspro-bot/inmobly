// ════════════════════════════════════════════════
// login.html — entra com Google e roteia pra próxima etapa da
// jornada (criar-conta / tour / painel) com base no estado do tenant.
//
// A tela tem três estados, controlados pelo data-estado do card:
//   verificando → spinner enquanto o Firebase diz se tem sessão ativa
//   entrando    → spinner do popup do Google até o redirect sair
//   form        → botão "Entrar com Google" (só quando ninguém logado)
// O formulário nunca é desenhado por cima de uma sessão que já existe:
// quem volta pra cá com login válido (aba parada há um tempo, segundo
// login) vê spinner e some da página, em vez de ver a tela de login
// piscar antes do redirect.
// ════════════════════════════════════════════════
import { loginWithGoogle, onAuthChange } from './firebase.js';
import { proximaPagina } from './tenant.js';
import { capturarAtribuicao } from './atribuicao.js';

// login.html também recebe CTAs carimbados da landing ("Entrar") e é
// pra onde criar-conta.html manda quem ainda não logou — em ambos os
// casos o ?vid= chega aqui e precisa ser guardado antes do redirect
// pra próxima etapa. Ver atribuicao.js.
capturarAtribuicao();

const $ = (id) => document.getElementById(id);
const card = $('loginCard');
const loading = $('loginLoading');
const loadingTexto = $('loginLoadingTexto');
const form = $('loginForm');
const msg = $('loginMsg');

function mostrarSpinner(texto) {
  card.dataset.estado = 'entrando';
  loadingTexto.textContent = texto;
  loading.classList.remove('hidden');
  form.classList.add('hidden');
}

function mostrarFormulario(erro) {
  card.dataset.estado = 'form';
  loading.classList.add('hidden');
  form.classList.remove('hidden');
  msg.textContent = erro || '';
  msg.className = erro ? 'msg msg--err' : 'msg';
}

// Voltar pra aba depois de um tempo parada é justamente o cenário em
// que o token já expirou e a rede pode estar ruim: tanto o refresh
// forçado do ID token quanto a leitura do doc do broker podem ficar
// pendurados sem nunca rejeitar. Sem este teto o spinner ficaria pra
// sempre — devolver o botão com um aviso é sempre melhor que uma tela
// travada.
const TIMEOUT_ROTA_MS = 15000;

function comTimeout(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, reject) => setTimeout(() => reject(new Error('tempo esgotado')), ms)),
  ]);
}

$('btnGoogle').addEventListener('click', async () => {
  mostrarSpinner('Entrando…');
  try {
    await loginWithGoogle();
    // Segue no spinner: onAuthChange abaixo cuida do redirecionamento.
  } catch (e) {
    // Fechar o popup ou abrir dois seguidos não é erro pra mostrar em
    // vermelho — é só devolver o botão.
    const cancelado = e?.code === 'auth/popup-closed-by-user'
                   || e?.code === 'auth/cancelled-popup-request';
    mostrarFormulario(cancelado ? '' : 'Não foi possível entrar: ' + e.message);
  }
});

// Se já está logado (voltou pra essa página por engano, ou sessão
// ativa), já manda pra frente sem precisar clicar de novo.
let redirecionando = false;

onAuthChange(async (user) => {
  if (!user) {
    if (!redirecionando) mostrarFormulario();
    return;
  }
  if (redirecionando) return; // onAuthChange pode disparar de novo (refresh de token)
  redirecionando = true;
  mostrarSpinner('Entrando…');
  try {
    location.href = await comTimeout(proximaPagina(true), TIMEOUT_ROTA_MS);
  } catch {
    redirecionando = false;
    mostrarFormulario('Não foi possível continuar. Verifique sua conexão e tente de novo.');
  }
});
