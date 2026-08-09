/* ══════════════════════════════════════════════════════
   reservados.js — slugs que não podem virar tenantId porque colidem
   com subdomínios de infraestrutura de *.sitemob.app (ver
   servirSite.js, que trata esses hostnames como especiais em vez de
   tentar resolver como tenant) ou são nomes óbvios demais pra deixar
   um corretor tomar. Fonte única — servirSite.js e criarConta.js usam
   a mesma lista, pra não ficar uma reconhecendo um reservado que a
   outra não bloqueou.
   ══════════════════════════════════════════════════════ */
module.exports = new Set([
  'painel', 'tenants', 'www', 'api', 'app', 'admin', 'mail', 'ftp', 'inmobly-project',
]);
