// ════════════════════════════════════════════════
// obrigado.html — destino do success_url do Stripe. Não escreve nada
// aqui: quem atualiza brokers/{tenantId} é o stripeWebhook, de forma
// assíncrona. Essa página só confirma visualmente e manda pro painel.
// ════════════════════════════════════════════════
import { onAuthChange } from './firebase.js';

onAuthChange((user) => {
  if (!user) location.href = 'login.html';
});
