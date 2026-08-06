// ════════════════════════════════════════════════
// App default do Firebase Admin — inicializado uma única vez (módulo
// cacheado pelo Node), reaproveitado por criarConta.js, checkout.js
// e webhook.js. Um projeto só agora, nada de apps secundários por
// broker como no control-plane/ antigo.
// ════════════════════════════════════════════════
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

module.exports = { app, db, auth };
