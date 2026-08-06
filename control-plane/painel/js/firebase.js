/* ══════════════════════════════════════════════════════
   PAIm Control Plane — init do Firebase
   Diferente de template/js/firebase.js: aqui não tem build.js
   nem {{PLACEHOLDER}} porque só existe UM projeto central
   (paim-control), não um por cliente.

   PREENCHER depois de criar o projeto no Firebase Console:
   Configurações do projeto → Seus apps → Web app → SDK setup
   ══════════════════════════════════════════════════════ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            'PREENCHER',
  authDomain:        'PREENCHER',
  projectId:         'paim-control',
  storageBucket:     'PREENCHER',
  messagingSenderId: 'PREENCHER',
  appId:             'PREENCHER',
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export function loginWithGoogle() { return signInWithPopup(auth, googleProvider); }
export function logoutAdmin()     { return signOut(auth); }
export function onAuthChange(cb)  { return onAuthStateChanged(auth, cb); }
export { db, auth };
