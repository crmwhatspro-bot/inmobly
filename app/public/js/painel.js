// ════════════════════════════════════════════════
// painel.html — Dashboard. Auth-gate e dados do broker agora vêm
// de shell.js (initShell), que também monta a sidebar/topbar.
// ════════════════════════════════════════════════
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);

// Chave YYYY-MM em UTC — tem que ser a MESMA conta que
// functions/analytics.js#logEvento usa pra montar a chave do contador,
// senão o mês exibido aqui não é o mês incrementado lá.
const mesAtual = () => new Date().toISOString().slice(0, 7);

initShell({ active: 'dashboard', title: 'Dashboard' }).then(({ tenantId, broker }) => {
  $('nomeNegocio').textContent = broker.name || tenantId;
  $('slugAtual').textContent = tenantId;
  $('planoAtual').textContent = broker.plan || 'trial';
  $('imoveisAtual').textContent = `${broker.usage?.imoveisCount ?? 0} / ${broker.imoveisLimit ?? 6}`;

  // Cliques nos botões de contato do catálogo público (WhatsApp,
  // e-mail, Instagram), contados por logEvento. Vem de contador
  // desnormalizado no próprio doc do broker — o corretor não lê
  // analytics_events, que tem evento de todo mundo.
  const doMes = broker.usage?.contatosPorMes?.[mesAtual()] ?? 0;
  const total = broker.usage?.contatosCliques ?? 0;
  $('contatosMes').textContent = doMes;
  // "Cliques", não "contatos recebidos": abrir o WhatsApp não garante
  // que a mensagem foi enviada. Prometer menos aqui evita o corretor
  // achar que o número é de conversas de verdade.
  $('contatosNota').textContent = total
    ? `${total} clique(s) no total, desde sempre`
    : 'ainda sem cliques — publique seu site pra começar a receber';
});
