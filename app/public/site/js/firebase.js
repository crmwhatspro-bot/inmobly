/* ══════════════════════════════════════════════════════
   Sitemob App — init do Firebase (SITE PÚBLICO)
   Um único projeto (inmobly-project) pra toda a jornada de
   signup/login/checkout — diferente do template/ antigo, que
   tinha config templada por broker.

   ⚠️  SEM firebase-auth aqui, de propósito, e não é para voltar.
   O visitante do catálogo nunca tem conta: o único uso do Firebase
   nesta página é ler imóveis públicos (firestore.rules libera
   `allow read: if true`). Enquanto o getAuth() existiu neste arquivo
   ele custava, em toda visita e no caminho crítico da renderização,
   ~40KB do SDK de auth MAIS ~93KB de __/auth/iframe.js num terceiro
   domínio (inmobly-project.firebaseapp.com) MAIS uma chamada a
   getProjectConfig — tudo pra sustentar um login que esta página não
   tem. O login mora em public/js/firebase.js, que é outro arquivo e
   segue com auth normalmente.
   ══════════════════════════════════════════════════════ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDwAI2N6W61-lRNE71uEiWQ75ZWxGd9PsU",
  authDomain: "inmobly-project.firebaseapp.com",
  projectId: "inmobly-project",
  storageBucket: "inmobly-project.firebasestorage.app",
  messagingSenderId: "473192241461",
  appId: "1:473192241461:web:116c4fa8564c4165ed147c"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export { db };
