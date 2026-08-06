/* ══════════════════════════════════════════════════════
   Inmobly Control Plane — Cloud Functions
   Ponto de entrada único; a lógica de cada function fica no
   arquivo correspondente. Ver README.md deste diretório para setup.
   ══════════════════════════════════════════════════════ */
exports.syncPlanoParaBroker  = require('./sync').syncPlanoParaBroker;
exports.criarCheckoutSession = require('./checkout').criarCheckoutSession;
exports.stripeWebhook        = require('./webhook').stripeWebhook;
