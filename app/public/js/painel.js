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

  mostrarStatusDoSite(broker);
});

// O dashboard é a primeira tela depois do login, e era onde a confusão
// nascia: ele exibia `slug.sitemob.app` como se o endereço já estivesse
// no ar, e o "Comece por aqui" apontava pra Meus Imóveis — publicar o
// site não aparecia em lugar nenhum. Enquanto broker.published !== true,
// o endereço vem marcado como não publicado e a chamada principal vira
// "Publicar meu site".
function mostrarStatusDoSite(broker) {
  const publicado = broker.published === true;
  $('siteOfflineTag').hidden = publicado;
  if (publicado) return;

  $('quickActions').classList.add('admin-quickactions--alerta');
  $('qaTitulo').textContent = 'Seu site ainda não está no ar';
  $('qaSub').textContent = 'Seu catálogo só fica acessível pros seus clientes depois que você publica, na aba Meu Site.';
  $('qaBotoes').innerHTML = `
    <a href="meu-site.html" class="btn btn--accent btn--md">Publicar meu site →</a>
    <a href="admin.html" class="btn btn--outline-light btn--md">Gerenciar meus imóveis</a>`;
}
