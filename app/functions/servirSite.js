/* ══════════════════════════════════════════════════════
   servirSite — serve o catálogo público (bundle de site-assets/) pra
   QUALQUER corretor, resolvendo quem é pelo Host header da requisição
   em vez de precisar de um Hosting site dedicado por tenant.

   Substitui o modelo antigo (publicarSite.js criando um site novo via
   Hosting REST API por corretor — teto de dezenas de sites por
   projeto, ver README) por uma única function atrás da Cloudflare:
     · *.sitemob.app                → wildcard, cada corretor tem
       <tenantId>.sitemob.app de graça, sem criar nada por conta.
     · domínio próprio do corretor  → Cloudflare for SaaS (Custom
       Hostnames) recebe o tráfego e repassa pro fallback origin
       (tenants.sitemob.app), preservando o Host original — é esse
       Host que usamos pra descobrir de quem é.

   O bundle em si é idêntico pra todo mundo (mesma lógica de sempre,
   ver comentário em public-tenant.js) — a única coisa que muda por
   tenant é a tag <meta name="pa-tenant">, que antes era gravada no
   arquivo publicado (um upload por tenant) e agora é injetada aqui,
   por requisição, sem precisar de deploy nenhum quando um corretor
   conecta um domínio novo.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const { onRequest } = require('firebase-functions/v2/https');
const { db } = require('./admin');
const RESERVADOS = require('./reservados');

const ASSETS_DIR = path.join(__dirname, 'site-assets');
const LANDING_DIR = path.join(__dirname, 'landing');

// A raiz do domínio não é tenant nenhum — é a landing page institucional
// do Sitemob. www fica de bônus, caso alguém digite assim.
const APEX_HOSTS = new Set(['sitemob.app', 'www.sitemob.app']);

const MIME_POR_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

// Subdomínio de *.sitemob.app diz o tenant direto (RESERVADOS fica de
// fora — são hostnames de infraestrutura, não de corretor). Se não bater
// com o padrão, é domínio próprio: busca em brokers por customDomain
// (gravado por functions/dominio.js quando o corretor conecta).
//
// O host vem de x-original-host, não do Host header padrão — quem
// chama esta function é sempre o Worker da Cloudflare (ver
// cloudflare-worker.js), nunca o navegador direto. Precisa ser assim
// porque o Cloud Run só aceita requisição cujo Host bata com o próprio
// domínio dele (*.a.run.app); o Worker reescreve o Host pra isso ao
// repassar a requisição e guarda o hostname real do visitante nesse
// header à parte, que é o que interessa pra descobrir o tenant.
async function resolverTenantId(host) {
  const m = host.match(/^([a-z0-9-]+)\.sitemob\.app$/);
  if (m && !RESERVADOS.has(m[1])) return m[1];

  const snap = await db.collection('brokers').where('customDomain', '==', host).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

// Resolve o path público pedido pra um arquivo dentro de baseDir —
// "/" vira index.html; qualquer coisa fora de baseDir (ex.: "../..")
// é rejeitada, ainda que hoje o path venha só do próprio Express.
function caminhoArquivo(baseDir, urlPath) {
  const relativo = urlPath === '/' || urlPath === '' ? '/index.html' : urlPath;
  const absoluto = path.normalize(path.join(baseDir, relativo));
  if (!absoluto.startsWith(baseDir)) return null;
  return fs.existsSync(absoluto) && fs.statSync(absoluto).isFile() ? absoluto : null;
}

const PLACEHOLDER_TENANT = '<meta name="pa-tenant" id="meta-pa-tenant" content="">';

function enviarArquivo(res, arquivo, tenantId) {
  const ext = path.extname(arquivo);
  let conteudo = fs.readFileSync(arquivo);
  if (ext === '.html' && tenantId) {
    conteudo = Buffer.from(
      conteudo.toString('utf8').replace(PLACEHOLDER_TENANT,
        `<meta name="pa-tenant" id="meta-pa-tenant" content="${tenantId}">`),
      'utf8'
    );
  }

  res.set('Content-Type', MIME_POR_EXT[ext] || 'application/octet-stream');
  // HTML nunca cacheia (o tenant muda por requisição, e a landing pode
  // mudar sem aviso); estático pode.
  res.set('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=3600');
  res.status(200).send(conteudo);
}

exports.servirSite = onRequest(
  { region: 'southamerica-east1', memory: '256MiB', invoker: 'public' },
  async (req, res) => {
    const host = String(req.headers['x-original-host'] || req.headers.host || '').split(':')[0].toLowerCase();

    if (APEX_HOSTS.has(host)) {
      const arquivo = caminhoArquivo(LANDING_DIR, req.path);
      if (!arquivo) { res.status(404).send('Não encontrado.'); return; }
      enviarArquivo(res, arquivo);
      return;
    }

    const tenantId = await resolverTenantId(host);
    if (!tenantId) {
      res.status(404).send('Site não encontrado.');
      return;
    }

    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    if (!brokerSnap.exists || !brokerSnap.data()?.published) {
      res.status(404).send('Este site ainda não foi publicado.');
      return;
    }

    const arquivo = caminhoArquivo(ASSETS_DIR, req.path);
    if (!arquivo) {
      res.status(404).send('Não encontrado.');
      return;
    }

    enviarArquivo(res, arquivo, tenantId);
  }
);
