// ════════════════════════════════════════════════
// login.html — entra com Google e roteia pra próxima etapa da
// jornada (criar-conta / tour / painel) com base no estado do tenant.
// ════════════════════════════════════════════════
import { loginWithGoogle, onAuthChange } from './firebase.js';
import { proximaPagina } from './tenant.js';

const $ = (id) => document.getElementById(id);
const msg = $('loginMsg');

$('btnGoogle').addEventListener('click', async () => {
  msg.textContent = '';
  msg.className = 'msg';
  try {
    await loginWithGoogle();
    // onAuthChange abaixo cuida do redirecionamento
  } catch (e) {
    msg.textContent = 'Não foi possível entrar: ' + e.message;
    msg.className = 'msg msg--err';
  }
});

// Se já está logado (voltou pra essa página por engano, ou sessão
// ativa), já manda pra frente sem precisar clicar de novo.
onAuthChange(async (user) => {
  if (!user) return;
  const destino = await proximaPagina(true);
  location.href = destino;
});
