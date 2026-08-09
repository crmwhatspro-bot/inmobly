// ════════════════════════════════════════════════
// equipe.js — allowlist da equipe Punto Alto, lado do client.
//
// ⚠️  DUPLICADA de propósito: a lista que REALMENTE protege os dados é
// a de `isTeam()` em firestore.rules. As duas não têm como ser um
// arquivo só — uma é módulo ES pro navegador, a outra é a linguagem
// de regras do Firestore, que não importa nada de fora. Mesmo caso de
// limiteEfetivo(), duplicado entre tenant.js e perfilPublico.js.
//
// Esta aqui serve só pra UI: decidir se interno-metricas.html mostra o
// painel ou a tela de "acesso restrito", em vez de deixar a pessoa
// olhar pra uma tela cheia de erro de permissão. Tirar um e-mail
// daqui NÃO revoga acesso — tem que sair das rules também; e adicionar
// só aqui não concede nada, todas as queries falham em
// permission-denied.
// ════════════════════════════════════════════════

export const EQUIPE = [
  'crmwhatspro@gmail.com',
  'diogomarquespy@gmail.com',
  // manter em sincronia com isTeam() em firestore.rules
];

export function ehDaEquipe(email) {
  return EQUIPE.includes(String(email || '').trim().toLowerCase());
}
