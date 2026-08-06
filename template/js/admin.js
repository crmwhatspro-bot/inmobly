import { loginWithGoogle, logoutAdmin, onAuthChange, db } from './firebase.js';
import { collection, query, orderBy, limit, getDocs, getCountFromServer, where, Timestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const ADMIN_EMAIL    = '{{ADMIN_EMAIL}}';

const loginScreen    = document.getElementById('admin-login');
const dashboard      = document.getElementById('admin-dashboard');
const googleBtn      = document.getElementById('google-signin-btn');
const loginError     = document.getElementById('login-error');
const logoutBtn      = document.getElementById('logout-btn');
const leadsTableBody = document.getElementById('leads-tbody');
const metricTotal    = document.getElementById('metric-total');
const metricHoje     = document.getElementById('metric-hoje');
const metricSemana   = document.getElementById('metric-semana');

// ── Auth state ─────────────────────────────────
onAuthChange(user => {
  if (user && user.email === ADMIN_EMAIL) {
    loginScreen.style.display = 'none';
    dashboard.classList.add('visible');
    if (loginError) loginError.style.display = 'none';
    carregarDados();
  } else {
    if (user) logoutAdmin(); // conta Google errada — deslogar imediatamente
    loginScreen.style.display = 'grid';
    dashboard.classList.remove('visible');
  }
});

// ── Login com Google ───────────────────────────
googleBtn?.addEventListener('click', async () => {
  if (loginError) loginError.style.display = 'none';
  googleBtn.disabled = true;
  try {
    await loginWithGoogle();
  } catch {
    if (loginError) loginError.style.display = 'block';
    googleBtn.disabled = false;
  }
});

// ── Logout ─────────────────────────────────────
logoutBtn?.addEventListener('click', () => logoutAdmin());

// ── Carregar dados ─────────────────────────────
async function carregarDados() {
  await Promise.all([carregarMetricas(), carregarLeads()]);
}

async function carregarMetricas() {
  const agora        = new Date();
  const inicioDia    = new Date(agora); inicioDia.setHours(0,0,0,0);
  const inicioSemana = new Date(agora); inicioSemana.setDate(agora.getDate() - agora.getDay());
  inicioSemana.setHours(0,0,0,0);

  const colecoes = ['leads', 'leads_imovel'];
  let total = 0, hoje = 0, semana = 0;

  for (const col of colecoes) {
    const ref = collection(db, col);

    const snapTotal  = await getCountFromServer(ref);
    const snapHoje   = await getCountFromServer(query(ref, where('createdAt', '>=', Timestamp.fromDate(inicioDia))));
    const snapSemana = await getCountFromServer(query(ref, where('createdAt', '>=', Timestamp.fromDate(inicioSemana))));

    total  += snapTotal.data().count;
    hoje   += snapHoje.data().count;
    semana += snapSemana.data().count;
  }

  if (metricTotal)  metricTotal.textContent  = total;
  if (metricHoje)   metricHoje.textContent   = hoje;
  if (metricSemana) metricSemana.textContent = semana;
}

async function carregarLeads() {
  if (!leadsTableBody) return;

  leadsTableBody.innerHTML = '';
  const colecoes = ['leads', 'leads_imovel'];
  const todos = [];

  for (const col of colecoes) {
    const snap = await getDocs(query(collection(db, col), orderBy('createdAt', 'desc'), limit(20)));
    snap.forEach(doc => todos.push({ ...doc.data(), _colecao: col }));
  }

  todos.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  if (!todos.length) {
    leadsTableBody.innerHTML = '<tr><td colspan="6" class="admin-empty">Nenhum lead ainda.</td></tr>';
    return;
  }

  todos.slice(0, 20).forEach(lead => {
    const data   = lead.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || '—';
    const pagina = lead._colecao === 'leads_imovel' ? 'Landing imóvel' : 'Home';
    leadsTableBody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${lead.name || '—'}</td>
        <td>${lead.email || '—'}</td>
        <td>${lead.whatsapp || '—'}</td>
        <td><span class="badge-page">${pagina}</span></td>
        <td class="text-muted">${lead.interesse || lead.fase || lead.tipologia || '—'}</td>
        <td class="text-muted">${data}</td>
      </tr>
    `);
  });
}
