// ════════════════════════════════════════════════
// tour.html — 4 slides de onboarding. Ao terminar (ou pular), marca
// brokers/{tenantId}.onboardingCompleted e segue pra planos.html.
// ════════════════════════════════════════════════
import { db, onAuthChange } from './firebase.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { tenantIdAtual } from './tenant.js';

const $ = (id) => document.getElementById(id);
const slides = document.querySelectorAll('.tour__slide');
const dotsEl = $('tourDots');
const btnVoltar  = $('btnVoltar');
const btnAvancar = $('btnAvancar');
const TOTAL = slides.length;
let atual = 1;
let tenantId = null;

onAuthChange(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  tenantId = await tenantIdAtual();
  if (!tenantId) { location.href = 'criar-conta.html'; return; }
  montarDots();
  render();
});

function montarDots() {
  dotsEl.innerHTML = '';
  for (let i = 1; i <= TOTAL; i++) {
    const d = document.createElement('span');
    d.className = 'tour__dot' + (i === 1 ? ' is-active' : '');
    dotsEl.appendChild(d);
  }
}

function render() {
  slides.forEach(s => s.classList.toggle('hidden', Number(s.dataset.slide) !== atual));
  dotsEl.querySelectorAll('.tour__dot').forEach((d, i) => d.classList.toggle('is-active', i + 1 === atual));
  btnVoltar.hidden = atual === 1;
  btnAvancar.textContent = atual === TOTAL ? 'Ver planos →' : 'Continuar →';
}

async function concluirOnboarding() {
  try {
    await updateDoc(doc(db, 'brokers', tenantId), { onboardingCompleted: true, updatedAt: new Date() });
  } catch (e) {
    console.warn('Não foi possível marcar onboarding como concluído:', e.message);
  }
  location.href = 'planos.html';
}

btnAvancar.addEventListener('click', () => {
  if (atual < TOTAL) { atual++; render(); }
  else concluirOnboarding();
});

btnVoltar.addEventListener('click', () => {
  if (atual > 1) { atual--; render(); }
});

$('btnPular').addEventListener('click', concluirOnboarding);
