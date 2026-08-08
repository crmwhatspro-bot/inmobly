/* ══════════════════════════════════════════════════════
   Sitemob App — init do Firebase
   Um único projeto (inmobly-project) pra toda a jornada de
   signup/login/checkout — diferente do template/ antigo, que
   tinha config templada por broker.
   ══════════════════════════════════════════════════════ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyDwAI2N6W61-lRNE71uEiWQ75ZWxGd9PsU",
  authDomain: "inmobly-project.firebaseapp.com",
  projectId: "inmobly-project",
  storageBucket: "inmobly-project.firebasestorage.app",
  messagingSenderId: "473192241461",
  appId: "1:473192241461:web:116c4fa8564c4165ed147c"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export function loginWithGoogle() { return signInWithPopup(auth, googleProvider); }
export function logout()          { return signOut(auth); }
export function onAuthChange(cb)  { return onAuthStateChanged(auth, cb); }
export { db, auth };
