// ════════════════════════════════════════════════
// obrigado.html — destino do success_url do Stripe. Não escreve nada
// aqui: quem atualiza brokers/{tenantId} é o stripeWebhook, de forma
// assíncrona. Essa página só confirma visualmente e manda pro painel.
// ════════════════════════════════════════════════
import { onAuthChange } from './firebase.js';

onAuthChange((user) => {
  if (!user) location.href = 'login.html';
});

// Compra avulsa (ex.: Página de Emprendimento) manda direto pra onde
// dá pra usar o que acabou de ser pago, em vez do painel genérico —
// ver PROXIMA_PAGINA em functions/checkout.js.
const next = new URLSearchParams(location.search).get('next');
if (next && /^[a-z0-9_-]+\.html$/i.test(next)) {
  const btn = document.getElementById('obrigadoBtn');
  const texto = document.getElementById('obrigadoTexto');
  if (btn) { btn.href = next; btn.textContent = 'Continuar →'; }
  if (texto) texto.textContent = 'Seu pagamento foi confirmado.';
}
