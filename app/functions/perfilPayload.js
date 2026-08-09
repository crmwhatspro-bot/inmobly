/* ══════════════════════════════════════════════════════
   perfilPayload — a forma canônica do perfil PÚBLICO de um tenant:
   quais campos de brokers/{tenantId} podem sair pra internet e quais
   não. Fica num módulo à parte porque hoje dois caminhos diferentes
   entregam exatamente o mesmo objeto pro navegador:

     · functions/perfilPublico.js  — o endpoint GET (fallback: preview
       em meu-site.html, sites antigos, qualquer acesso que não passe
       pelo servirSite).
     · functions/servirSite.js     — injeta o payload direto no HTML
       (<script id="pa-perfil">), poupando do visitante um round-trip
       inteiro no caminho crítico da renderização.

   ⚠️  Regra que justifica este arquivo existir: brokers/{tenantId} tem
   campo privado (email de login, IDs do Stripe, customerId). Se algum
   dia alguém acrescentar campo aqui, ele vira público NOS DOIS lugares
   de uma vez — que é exatamente a intenção. O contrário (whitelist
   duplicada, uma em cada arquivo) é como um campo privado vaza por só
   um dos dois caminhos sem ninguém notar.
   ══════════════════════════════════════════════════════ */

const LIMITE_TRIAL = 6;

// Mesma lógica de app/public/js/tenant.js#limiteEfetivo — duplicada
// aqui porque um é módulo ES pro navegador e o outro é CommonJS pra
// Cloud Function, não dá pra compartilhar arquivo sem um passo de
// build que esse projeto não tem. Manter as duas em sincronia.
function limiteEfetivo(broker) {
  if (!broker) return LIMITE_TRIAL;
  if (broker.status === 'active')   return broker.imoveisLimit ?? Infinity;
  if (broker.status === 'trialing') return broker.imoveisLimit ?? LIMITE_TRIAL;
  return LIMITE_TRIAL;
}

// O shape que site/js/imoveis.js#aplicarPerfil espera. Tudo opcional
// exceto name/whatsapp — o catálogo cai num texto padrão razoável
// quando o resto vem null.
function montarPerfilPublico(broker, tenantId) {
  const limite = limiteEfetivo(broker);
  return {
    name: broker.name || tenantId,
    whatsapp: broker.whatsapp || null,
    logo: broker.logo || null,
    headline: broker.headline || null,
    subheadline: broker.subheadline || null,
    about: broker.about || null,
    keywords: broker.keywords || null,
    // contactEmail, não broker.email — esse é o e-mail de login/conta,
    // nunca deve ser exposto por um endpoint público.
    email: broker.contactEmail || null,
    instagramUrl: broker.instagramUrl || null,
    accentColor: broker.accentColor || '#C8922A',
    language: broker.language || 'es',
    gtmId: broker.gtmId || null,
    // Infinity não serializa em JSON (vira null de qualquer jeito
    // via JSON.stringify) — explícito aqui pra não depender disso.
    imoveisLimit: Number.isFinite(limite) ? limite : null,
  };
}

module.exports = { montarPerfilPublico, limiteEfetivo, LIMITE_TRIAL };
