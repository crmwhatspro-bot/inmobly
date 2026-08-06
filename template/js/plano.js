// ════════════════════════════════════════════════
// PLANO — lê config/plan (escrito pelo syncPlanoParaBroker do
// control-plane) e calcula o limite de imóveis que vale AGORA,
// considerando o status da assinatura — não só o plano contratado.
// Usado por imoveis.js (catálogo público) e admin-imoveis.js (CMS).
// ════════════════════════════════════════════════
import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const LIMITE_TRIAL = 6;

let cache;

// Lê config/plan uma vez por carregamento de página. Se o doc ainda não
// existe (onboarding não terminou, ou o sync ainda não rodou depois de
// criar o broker), assume o limite do trial — nunca assume ilimitado
// por omissão, isso abriria uma brecha de acesso grátis.
export async function carregarConfigPlano() {
  if (cache !== undefined) return cache;
  try {
    const snap = await getDoc(doc(db, 'config', 'plan'));
    cache = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('Não foi possível ler config/plan:', e.message);
    cache = null;
  }
  return cache;
}

// past_due/canceled reduzem o limite pro nível do trial até a
// assinatura ser regularizada — bloqueia o que foi CONTRATADO, sem
// apagar nada. Ver docs/REGRAS-DE-NEGOCIO.md, seção 4.
export function limiteEfetivo(config) {
  if (!config) return LIMITE_TRIAL;
  if (config.status === 'active')   return config.imoveisLimit ?? Infinity;
  if (config.status === 'trialing') return config.imoveisLimit ?? LIMITE_TRIAL;
  return LIMITE_TRIAL; // past_due, canceled, ou status desconhecido
}

export function assinaturaBloqueada(config) {
  return !!config && (config.status === 'past_due' || config.status === 'canceled');
}
