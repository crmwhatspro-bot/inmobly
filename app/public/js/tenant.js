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

const LIMITE_TRIAL = 6;

// Limite de imóveis que vale AGORA, considerando o status da
// assinatura — não só o plano contratado. Equivalente ao antigo
// template/js/plano.js, mas lê direto do doc do tenant (aqui não
// existe mais um config/plan sincronizado de outro projeto, o doc
// já É a fonte da verdade). Ver docs/REGRAS-DE-NEGOCIO.md, seção 4.
//
// NÃO olha trialExpirado() de propósito: quando o trial vence, o
// painel tranca mas o catálogo público continua no ar exatamente como
// estava (é o que faz o corretor querer voltar). Tirar imóvel do ar
// puniria o visitante, não o corretor.
export function limiteEfetivo(broker) {
  if (!broker) return LIMITE_TRIAL;
  if (broker.status === 'active')   return broker.imoveisLimit ?? Infinity;
  if (broker.status === 'trialing') return broker.imoveisLimit ?? LIMITE_TRIAL;
  return LIMITE_TRIAL; // past_due, canceled, ou status desconhecido
}

// ── Trial ────────────────────────────────────────────────────
// `status` NUNCA vira 'expired': só o stripeWebhook escreve status, e
// ele só sabe de assinatura (active/past_due/canceled). Quem passou dos
// 14 dias sem assinar continua 'trialing' pra sempre no doc — por isso
// a expiração é SEMPRE derivada de trialEndsAt vs. agora, aqui, e não
// um campo próprio que alguém teria que virar. Ver a versão CommonJS
// desta mesma regra em functions/trial.js (não dá pra compartilhar
// arquivo entre módulo ES do browser e Cloud Function sem build).
function fimDoTrial(broker) {
  const bruto = broker?.trialEndsAt;
  if (!bruto) return null;
  const data = bruto.toDate?.() ?? new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function diasRestantesTrial(broker) {
  const fim = fimDoTrial(broker);
  if (!fim) return null;
  return Math.max(0, Math.ceil((fim - Date.now()) / (1000 * 60 * 60 * 24)));
}

// Doc sem trialEndsAt (contas criadas antes do campo existir) nunca
// expira — de propósito: liberar demais é preferível a trancar quem
// não deveria estar trancado.
export function trialExpirado(broker) {
  if (!broker || broker.status !== 'trialing') return false;
  const fim = fimDoTrial(broker);
  return !!fim && fim.getTime() <= Date.now();
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
