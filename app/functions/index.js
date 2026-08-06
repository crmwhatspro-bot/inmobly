/* ══════════════════════════════════════════════════════
   Inmobly App — Cloud Functions
   Ponto de entrada único; a lógica de cada function fica no
   arquivo correspondente.
   ══════════════════════════════════════════════════════ */
exports.criarConta           = require('./criarConta').criarConta;
exports.criarCheckoutSession = require('./checkout').criarCheckoutSession;
exports.stripeWebhook        = require('./webhook').stripeWebhook;
