// ════════════════════════════════════════════════
// public-tenant.js — resolve qual tenant esse acesso é (visitante
// sem login, sem custom claim) e busca o perfil público via a
// function perfilPublico (não lê brokers/{tenantId} direto — esse
// doc tem campos privados como e-mail e IDs do Stripe).
// ════════════════════════════════════════════════
const FUNCTIONS_BASE = 'https://southamerica-east1-inmobly-project.cloudfunctions.net';

// <slug>.sitemob.app já diz o tenant direto pelo hostname — dá pra ler
// sem round-trip nenhum. Mas com domínio próprio conectado (ver
// functions/dominio.js) ou quando quem serve é o servirSite.js (o
// bundle é idêntico pra todo mundo, ver comentário lá), quem diz de
// quem é o site é a meta tag injetada na resposta. *.web.app fica só
// de transição, enquanto sites antigos (Hosting multisite, modelo
// anterior ao servirSite.js) ainda existirem. ?t=slug continua
// servindo pra testar/pré-visualizar no site padrão do projeto.
export function tenantIdAtual() {
  const host = location.hostname.match(/^([a-z0-9-]+)\.(sitemob\.app|web\.app)$/);
  if (host && host[1] !== 'inmobly-project') return host[1];

  const meta = document.querySelector('meta[name="pa-tenant"]')?.content;
  if (meta) return meta;

  return new URLSearchParams(location.search).get('t');
}

// Retorna null se o tenant não existir ou não estiver publicado —
// nesses casos o chamador deve mostrar o estado de indisponível.
// Timeout manual: sem isso, um fetch que nunca resolve (rede de
// celular instável, por exemplo) deixava a página carregando pra
// sempre — sem erro, sem fallback, o spinner nunca saía da tela.
export async function carregarPerfilPublico(tenantId) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/perfilPublico?tenant=${encodeURIComponent(tenantId)}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
