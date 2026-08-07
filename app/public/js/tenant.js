// ════════════════════════════════════════════════
// Helpers de tenant — decide pra onde mandar o usuário depois do
// login, com base no custom claim `tenantId` (setado por
// functions/criarConta.js no signup) e no campo `onboardingCompleted`
// do doc brokers/{tenantId}. Usado por login.js, criar-conta.js e
// tour.js pra rotear cada etapa da jornada.
// ════════════════════════════════════════════════
import { db, auth } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getIdTokenResult } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Custom claims só atualizam no ID token depois de um refresh forçado
// — precisa disso logo após criar a conta, quando o claim acabou de
// ser setado pela function e o token em memória ainda não sabe disso.
// Usa a função standalone (não user.getIdTokenResult()) — é a forma
// garantidamente correta no SDK modular, confirmada contra os exports
// reais de firebase-auth.js antes de usar.
export async function tenantIdAtual(forcarRefresh = false) {
  const user = auth.currentUser;
  if (!user) return null;
  const resultado = await getIdTokenResult(user, forcarRefresh);
  return resultado.claims.tenantId || null;
}

export async function buscarBroker(tenantId) {
  const snap = await getDoc(doc(db, 'brokers', tenantId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Próxima página da jornada pra um usuário já autenticado.
export async function proximaPagina(forcarRefresh = false) {
  const tenantId = await tenantIdAtual(forcarRefresh);
  if (!tenantId) return 'criar-conta.html';
  const broker = await buscarBroker(tenantId);
  if (!broker) return 'criar-conta.html'; // claim existe mas doc sumiu — recomeça
  if (!broker.onboardingCompleted) return 'tour.html';
  return 'painel.html';
}
