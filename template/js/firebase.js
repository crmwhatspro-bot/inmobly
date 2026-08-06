import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAnalytics, logEvent } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js';
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc, increment }
                                   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
                                   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── Config ─────────────────────────────────────
// Valores injetados pelo scripts/build.js a partir do broker.config.json
const firebaseConfig = {
  apiKey:            "{{FB_API_KEY}}",
  authDomain:        "{{FB_AUTH_DOMAIN}}",
  projectId:         "{{FB_PROJECT_ID}}",
  storageBucket:     "{{FB_STORAGE_BUCKET}}",
  messagingSenderId: "{{FB_SENDER_ID}}",
  appId:             "{{FB_APP_ID}}",
  measurementId:     "{{FB_MEASUREMENT_ID}}",
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Analytics é opcional — projeto Firebase sem Google Analytics não pode quebrar o site
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn('Analytics indisponível:', e?.message);
}

// ── Track helper ───────────────────────────────
export function track(event, params = {}) {
  if (!analytics) return;
  try { logEvent(analytics, event, params); } catch {}
}

// ── Eventos prontos ────────────────────────────
export const trackEvents = {
  whatsappClick:  (source)   => track('whatsapp_click',        { source }),
  formSubmit:     (page)     => track('contact_form_submit',   { page }),
  ctaClick:       (cta)      => track('cta_click',             { cta }),
  sectionView:    (section)  => track('section_view',          { section }),
  langSwitch:     (lang)     => track('language_switch',       { language: lang }),
  serviceClick:   (service)  => track('service_card_click',    { service }),
  modalOpen: (modalId, modalTitle) => {
    track('modal_open', { modal_id: modalId, modal_title: modalTitle });
    setDoc(doc(db, 'stats', 'modals'), { [modalId]: increment(1) }, { merge: true })
      .catch(() => {});
  },
};

// expõe globalmente para inline onclicks e scripts não-módulo
window.trackEvents = trackEvents;

// ── Salvar lead no Firestore ───────────────────
export async function saveLead(formData, colecao = 'leads') {
  try {
    await addDoc(collection(db, colecao), {
      ...formData,
      createdAt: serverTimestamp(),
      page: window.location.pathname,
    });
    return { ok: true };
  } catch (e) {
    console.error('Firestore error:', e);
    return { ok: false, error: e.message };
  }
}

// ── Auth ───────────────────────────────────────
const googleProvider = new GoogleAuthProvider();

export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function logoutAdmin() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export { db, auth };
