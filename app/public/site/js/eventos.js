// ════════════════════════════════════════════════
// eventos.js — registra os cliques de contato do catálogo público
// (WhatsApp, e-mail, Instagram, telefone) chamando a function
// logEvento. É o único sinal de RESULTADO que o produto tem: todo
// contato sai daqui por link externo e, sem isto, desaparece — não
// existe formulário nesta página.
//
// Um listener delegado no document, em vez de wiring botão a botão:
// os CTAs são vários (nav, hero, rodapé, botão de cada imóvel no
// modal de detalhe, página de empreendimento) e alguns são renderizados
// depois, dentro de innerHTML. Delegar cobre todos, inclusive os que
// ainda nem existem quando isto roda.
//
// Fase de captura (`true` no addEventListener): o clique é registrado
// antes de qualquer handler poder chamar stopPropagation, e antes de a
// navegação pro WhatsApp levar a aba embora.
// ════════════════════════════════════════════════
import { tenantIdAtual } from './public-tenant.js';

const ENDPOINT = 'https://southamerica-east1-inmobly-project.cloudfunctions.net/logEvento';
const VID_KEY = 'sitemob-vid';

// O preview roda dentro de um <iframe> em meu-site.html — é o corretor
// olhando o próprio site antes de publicar. Contar cliques daí inflaria
// o número dele com o teste dele mesmo.
const MODO_PREVIEW = new URLSearchParams(location.search).get('preview') === '1';

// Hex de 32 chars, mesmo formato que functions/analytics.js valida.
// Este id é POR SITE (cada catálogo tem seu próprio storage de origem)
// e não tem relação com o visitorId da landing — não dá pra ligar as
// duas coisas entre domínios, nem é a intenção. Aqui ele serve só pra
// dar pra separar "10 cliques" de "10 pessoas" dentro do mesmo site.
function novoId() {
  const c = window.crypto;
  if (c && c.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '');
}

function visitorId() {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) { id = novoId(); localStorage.setItem(VID_KEY, id); }
    return id;
  } catch {
    // Storage bloqueado (modo privado, cookies off) — id efêmero. O
    // clique ainda conta; só não dá pra deduplicar por pessoa.
    return novoId();
  }
}

function tipoDoLink(href) {
  if (!href || href === '#') return null;
  if (href.startsWith('https://wa.me/')) return 'whatsapp';
  if (href.startsWith('mailto:')) return 'email';
  if (href.startsWith('tel:')) return 'telefone';
  try {
    if (new URL(href).hostname.replace(/^www\./, '') === 'instagram.com') return 'instagram';
  } catch { /* href relativo — não é contato */ }
  return null;
}

// De onde no layout o clique saiu. Os CTAs já têm id estável
// (nav-whatsapp, cta-whatsapp, footer-whatsapp, emp-whatsapp), então dá
// pra derivar sem tocar no markup; o do modal de detalhe vem pela
// classe, que é o único que se repete por imóvel.
function origemDoClique(a) {
  if (a.id) return a.id;
  if (a.classList.contains('imv-detail__cta')) return 'detalhe';
  return 'outro';
}

export function iniciarEventosContato() {
  if (MODO_PREVIEW) return;

  const tenantId = tenantIdAtual();
  if (!tenantId) return;

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;

    const tipo = tipoDoLink(a.getAttribute('href') || '');
    if (!tipo) return;

    try {
      fetch(ENDPOINT, {
        method: 'POST',
        // keepalive: o clique de WhatsApp tira a aba da frente na
        // hora; sem isso o navegador pode cancelar a requisição no
        // meio e justamente o contato que mais interessa some.
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          tipo,
          visitorId: visitorId(),
          origem: origemDoClique(a),
          // Preenchido pelo botão do modal de detalhe (data-ev-imovel)
          // e pela página de empreendimento (data-ev-pagina).
          imovelId: a.dataset.evImovel || null,
          paginaId: a.dataset.evPagina || null,
        }),
      }).catch(() => {}); // métrica nunca pode atrapalhar o contato
    } catch { /* idem */ }
  }, true);
}
