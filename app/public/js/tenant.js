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

const DIA_MS = 24 * 60 * 60 * 1000;

// Duração nominal do trial — espelha TRIAL_DIAS de functions/criarConta.js
// (não dá pra importar: CommonJS vs. módulo ES do browser). Só é usada
// pra teto de exibição e pra saber quantos dias já se passaram; a
// expiração continua vindo de trialEndsAt, nunca desta constante.
export const TRIAL_DIAS = 14;

// Quanto falta, em milissegundos. É daqui que sai TODO texto de
// contagem — quem quiser "dias" arredonda a partir disso.
export function msRestantesTrial(broker) {
  const fim = fimDoTrial(broker);
  if (!fim) return null;
  return Math.max(0, fim.getTime() - Date.now());
}

// Dias que ainda restam, contando o de hoje (ceil: enquanto sobrar
// qualquer fração de dia, ainda é "1 dia").
//
// O teto em TRIAL_DIAS existe por causa do relógio do cliente: o doc
// nasce com trialEndsAt = agora_do_servidor + 14 dias, então um
// navegador atrasado alguns minutos vê 14 dias e pouco e o ceil vira
// 15 — número que nunca existiu no produto, e que ficava parado na tela
// o primeiro dia inteiro. Trial estendido à mão no Firestore aparece
// capado nos 14, e tudo bem: quem estende sabe o que fez, o corretor
// não precisa saber.
export function diasRestantesTrial(broker) {
  const ms = msRestantesTrial(broker);
  if (ms === null) return null;
  return Math.min(TRIAL_DIAS, Math.ceil(ms / DIA_MS));
}

// Dias já corridos de trial (0 no dia do cadastro). Derivado do que
// falta, não de createdAt: trialEndsAt é o único campo que as três
// cópias da regra de trial já concordam em olhar.
export function diasDecorridosTrial(broker) {
  const dias = diasRestantesTrial(broker);
  if (dias === null) return null;
  return Math.max(0, TRIAL_DIAS - dias);
}

// Texto do tempo que falta, com a granularidade que faz o contador
// PARECER (e ser) regressivo: em dias enquanto sobra bastante, em horas
// nas últimas 48h, em minutos na última hora. Sem isso o rótulo passava
// dias inteiros idêntico na tela e lia-se como número fixo de enfeite.
export function textoRestanteTrial(broker) {
  const ms = msRestantesTrial(broker);
  if (!ms) return null; // sem trialEndsAt, ou já venceu (quem trata é trialExpirado)

  if (ms > 48 * 60 * 60 * 1000) {
    return `${diasRestantesTrial(broker)} dias`;
  }
  const horas = Math.ceil(ms / (60 * 60 * 1000));
  if (horas > 1) return `${horas} horas`;

  const minutos = Math.max(1, Math.ceil(ms / (60 * 1000)));
  return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
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
