/* ══════════════════════════════════════════════════════
   perfilPublico — endpoint público (sem auth) que o catálogo em
   site/index.html chama pra saber o nome/whatsapp/limite de imóveis
   de um tenant, sem expor brokers/{tenantId} inteiro (que tem e-mail
   e IDs do Stripe). Só devolve dados se o tenant existir E estiver
   published:true — senão 404, é o que faz meu-site.html "esconder"
   o catálogo até o corretor publicar.

   GET /perfilPublico?tenant=<slug>

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onRequest } = require('firebase-functions/v2/https');
const { db } = require('./admin');

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

exports.perfilPublico = onRequest(
  { region: 'southamerica-east1', cors: true },
  async (req, res) => {
    const tenantId = String(req.query.tenant || '').trim().toLowerCase();
    if (!tenantId) { res.status(400).json({ error: 'parâmetro "tenant" é obrigatório' }); return; }

    try {
      const snap = await db.doc('brokers/' + tenantId).get();
      const broker = snap.exists ? snap.data() : null;

      if (!broker || broker.published !== true) {
        res.status(404).json({ error: 'catálogo não encontrado' });
        return;
      }

      const limite = limiteEfetivo(broker);
      res.status(200).json({
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
      });
    } catch (err) {
      console.error(`[perfilPublico] erro buscando "${tenantId}":`, err);
      res.status(500).json({ error: 'erro interno' });
    }
  }
);
