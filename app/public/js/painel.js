// ════════════════════════════════════════════════
// painel.html — stub pós-onboarding. Mostra o status direto de
// brokers/{tenantId}; não é o CMS completo (isso é a próxima etapa,
// migrar template/admin/ pro modelo multi-tenant).
// ════════════════════════════════════════════════
import { logout, onAuthChange } from './firebase.js';
import { tenantIdAtual, buscarBroker } from './tenant.js';

const $ = (id) => document.getElementById(id);

$('btnSair').addEventListener('click', () => logout().then(() => location.href = 'login.html'));

onAuthChange(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  $('userEmail').textContent = user.email;

  const tenantId = await tenantIdAtual();
  if (!tenantId) { location.href = 'criar-conta.html'; return; }

  const broker = await buscarBroker(tenantId);
  if (!broker) return;

  $('nomeNegocio').textContent = broker.name || tenantId;
  $('slugAtual').textContent = tenantId;
  $('planoAtual').textContent = `${broker.plan || 'trial'} · ${broker.status || 'trialing'}`;
  $('imoveisAtual').textContent = `${broker.usage?.imoveisCount ?? 0} de ${broker.imoveisLimit ?? 6}`;
  $('dominioAtual').textContent = broker.domainIncluded ? (broker.customDomainStatus || 'pendente') : 'inmobly.app';
});
