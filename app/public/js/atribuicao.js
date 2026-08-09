// ════════════════════════════════════════════════
// atribuicao.js — guarda de onde o usuário veio, do primeiro clique
// na landing até a criação da conta.
//
// A landing (functions/landing/index.html) carimba ?vid=&sid= e os
// utm_* em todo CTA que aponta pra cá. O problema é que o parâmetro
// não sobrevive à jornada sozinho: quem não está logado bate em
// criar-conta.html, é mandado pra login.html (que perde o query
// param), volta do popup do Google e só então cria a conta. Por isso
// a captura é FIRST-TOUCH em localStorage: o primeiro parâmetro visto
// fica, e é ele que criarConta grava no broker.
//
// Chamar capturarAtribuicao() no top-level de toda página que pode
// receber o link da landing (criar-conta.js, login.js) — antes de
// qualquer redirect, senão o dado some justamente no salto.
// ════════════════════════════════════════════════

const CHAVE = 'sitemob-atribuicao';

// Mesmo formato que functions/analytics.js valida — id fora disso é
// lixo de URL editada à mão e não casa com visita nenhuma mesmo.
const ID_REGEX = /^[a-z0-9]{8,40}$/;

function idValido(v) {
  const s = String(v || '').trim().toLowerCase();
  return ID_REGEX.test(s) ? s : null;
}

function texto(v, max = 120) {
  const s = String(v || '').trim();
  return s ? s.slice(0, max) : null;
}

export function lerAtribuicao() {
  try {
    const cru = localStorage.getItem(CHAVE);
    return cru ? JSON.parse(cru) : null;
  } catch {
    return null; // storage bloqueado ou JSON corrompido — segue sem atribuição
  }
}

/**
 * Lê ?vid/?sid/?utm_* da URL atual e guarda, se ainda não houver nada
 * guardado. Retorna a atribuição em vigor (a recém-capturada ou a que
 * já existia), ou null se nunca houve nenhuma.
 *
 * First-touch e não last-touch de propósito: interessa saber qual
 * campanha trouxe a pessoa, não por qual aba ela passou por último
 * antes de finalmente criar a conta.
 */
export function capturarAtribuicao() {
  const existente = lerAtribuicao();
  if (existente) return existente;

  const p = new URLSearchParams(location.search);
  const atribuicao = {
    vid:         idValido(p.get('vid')),
    sid:         idValido(p.get('sid')),
    utmSource:   texto(p.get('utm_source')),
    utmMedium:   texto(p.get('utm_medium')),
    utmCampaign: texto(p.get('utm_campaign')),
    capturadoEm: new Date().toISOString(),
  };

  // Só grava se veio ALGO de verdade — senão o primeiro acesso direto
  // (sem parâmetro nenhum) gravaria um objeto vazio e bloquearia pra
  // sempre a captura de um clique de campanha que viesse depois.
  const temDado = atribuicao.vid || atribuicao.utmSource || atribuicao.utmCampaign;
  if (!temDado) return null;

  try { localStorage.setItem(CHAVE, JSON.stringify(atribuicao)); } catch {}
  return atribuicao;
}
