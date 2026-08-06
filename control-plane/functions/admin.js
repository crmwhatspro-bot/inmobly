// ════════════════════════════════════════════════
// App default do Firebase Admin (projeto central inmobly-control) —
// inicializado uma única vez (módulo cacheado pelo Node) e
// reaproveitado por sync.js, checkout.js e webhook.js. Não confundir
// com os apps SECUNDÁRIOS nomeados que sync.js cria por broker.
// ════════════════════════════════════════════════
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp();
const db = getFirestore(app);

module.exports = { app, db };
