/* ══════════════════════════════════════════════════════
   Sitemob App — Cloud Functions
   Ponto de entrada único; a lógica de cada function fica no
   arquivo correspondente.
   ══════════════════════════════════════════════════════ */
exports.criarConta           = require('./criarConta').criarConta;
exports.criarCheckoutSession = require('./checkout').criarCheckoutSession;
exports.stripeWebhook        = require('./webhook').stripeWebhook;
exports.perfilPublico        = require('./perfilPublico').perfilPublico;
exports.publicarSite         = require('./publicarSite').publicarSite;
exports.conectarDominio      = require('./dominio').conectarDominio;
exports.verificarDominio     = require('./dominio').verificarDominio;
exports.removerDominio       = require('./dominio').removerDominio;
