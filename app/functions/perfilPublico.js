/* ══════════════════════════════════════════════════════
   perfilPublico — endpoint público (sem auth) que o catálogo em
   site/index.html chama pra saber o nome/whatsapp/limite de imóveis
   de um tenant, sem expor brokers/{tenantId} inteiro (que tem e-mail
   e IDs do Stripe). Só devolve dados se o tenant existir E estiver
   published:true — senão 404, é o que faz meu-site.html "esconder"
   o catálogo até o corretor publicar.

   GET /perfilPublico?tenant=<slug>

   Hoje isto é o CAMINHO DE FALLBACK, não o normal: quem serve o site
   publicado é servirSite.js, que já lê o mesmo doc pra decidir se
   responde e por isso injeta este mesmo payload direto no HTML (ver
   perfilPayload.js). Este endpoint continua atendendo o preview de
   meu-site.html, os sites antigos em Hosting e qualquer acesso que
   não passe pelo servirSite.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onRequest } = require('firebase-functions/v2/https');
const { db } = require('./admin');
const { montarPerfilPublico } = require('./perfilPayload');

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

      res.status(200).json(montarPerfilPublico(broker, tenantId));
    } catch (err) {
      console.error(`[perfilPublico] erro buscando "${tenantId}":`, err);
      res.status(500).json({ error: 'erro interno' });
    }
  }
);
