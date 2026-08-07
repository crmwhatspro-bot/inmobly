// ════════════════════════════════════════════════
// painel.html — Dashboard. Auth-gate e dados do broker agora vêm
// de shell.js (initShell), que também monta a sidebar/topbar.
// ════════════════════════════════════════════════
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);

initShell({ active: 'dashboard', title: 'Dashboard' }).then(({ tenantId, broker }) => {
  $('nomeNegocio').textContent = broker.name || tenantId;
  $('slugAtual').textContent = tenantId;
  $('planoAtual').textContent = broker.plan || 'trial';
  $('imoveisAtual').textContent = `${broker.usage?.imoveisCount ?? 0} / ${broker.imoveisLimit ?? 6}`;
});
