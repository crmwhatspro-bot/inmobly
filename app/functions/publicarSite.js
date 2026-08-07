/* ══════════════════════════════════════════════════════
   publicarSite — cria (se ainda não existir) um Hosting site
   dedicado do tenant (<slug>.web.app) e faz deploy do bundle
   estático do catálogo público, depois marca published:true.
   Chamado por meu-site.js ao clicar em "Publicar site".

   O conteúdo é quase sempre o mesmo pra qualquer tenant — quem resolve
   "de quem é esse site" é o próprio bundle, em tempo de execução,
   lendo location.hostname (ver public/site/js/public-tenant.js). A
   única exceção é index.html: popularEUpload() grava o tenantId numa
   meta tag (`pa-tenant`, vem vazia em site-assets/) antes de fazer o
   upload dele — sem isso, um domínio próprio conectado (ver
   functions/dominio.js) não bateria com o padrão *.web.app e o bundle
   não teria como saber de quem é o site.

   Os arquivos vêm de functions/site-assets/ — uma CÓPIA de
   public/site/, porque uma Cloud Function só enxerga o que está
   dentro da própria pasta de deploy (functions/), não consegue ler
   public/site/ de fora dela. Sempre que public/site/ mudar, copiar
   de novo pra functions/site-assets/ (sem isso, "Publicar site"
   passa a publicar uma versão desatualizada do catálogo).

   Fluxo (Firebase Hosting REST API v1beta1):
     1. POST  projects/{p}/sites?siteId={slug}      — cria o site (409 = já existe, ok)
     2. POST  sites/{slug}/versions                 — abre uma versão nova
     3. POST  {version}:populateFiles                — manda o hash (sha256 do
        gzip) de cada arquivo; a API devolve só os que precisam de upload
     4. POST  {uploadUrl}/{hash}                      — upload de cada arquivo
        (gzip), um por um
     5. PATCH {version}?updateMask=status              — finaliza a versão
     6. POST  sites/{slug}/releases?versionName=...     — publica de fato

   Usa as credenciais padrão da function (Application Default
   Credentials) pra chamar a API do Hosting — precisa que a service
   account tenha o papel roles/firebasehosting.admin, que NÃO vem
   concedido por padrão. Mesmo tipo de passo manual já feito antes
   pra cloudbuild.builds.builder / run.invoker / datastore.user /
   firebaseauth.admin — ver README.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { applicationDefault } = require('firebase-admin/app');
const { db } = require('./admin');

const PROJECT_ID = 'inmobly-project';
const ASSETS_DIR = path.join(__dirname, 'site-assets');
const HOSTING_API = 'https://firebasehosting.googleapis.com/v1beta1';

// Lazy — resolver applicationDefault() aqui embaixo, e não no topo do
// módulo, é proposital. No topo do módulo, o processo de "discovery"
// do Firebase CLI (que faz require() de tudo em functions/ só pra
// listar as functions, antes de deployar de verdade) tenta resolver
// as credenciais nesse ambiente local e trava até estourar o timeout
// de 10s ("Cannot determine backend specification") — mesmo sem
// nenhuma function ter sido chamada de verdade ainda.
let credential = null;
async function tokenDeAcesso() {
  if (!credential) credential = applicationDefault();
  const { access_token } = await credential.getAccessToken();
  return access_token;
}

async function chamarApi(url, opcoes = {}) {
  const token = await tokenDeAcesso();
  const res = await fetch(url, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.headers || {}) },
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    const erro = new Error(`${opcoes.method || 'GET'} ${url} → ${res.status}: ${texto}`);
    erro.status = res.status;
    throw erro;
  }
  return res.status === 204 ? null : res.json();
}

// Lista recursiva de functions/site-assets/, com o path "público" que
// o Hosting espera (com barra na frente: "/index.html", "/css/base.css"...).
function listarArquivos(dir, base = '') {
  let arquivos = [];
  for (const nome of fs.readdirSync(dir)) {
    const caminhoAbs = path.join(dir, nome);
    const caminhoPublico = base + '/' + nome;
    if (fs.statSync(caminhoAbs).isDirectory()) {
      arquivos = arquivos.concat(listarArquivos(caminhoAbs, caminhoPublico));
    } else {
      arquivos.push({ abs: caminhoAbs, publico: caminhoPublico });
    }
  }
  return arquivos;
}

async function criarSiteSeNaoExistir(tenantId) {
  try {
    await chamarApi(`${HOSTING_API}/projects/${PROJECT_ID}/sites?siteId=${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (err) {
    if (err.status !== 409) throw err; // 409 = site já existe — ok, segue o deploy
  }
}

async function criarVersao(tenantId) {
  const versao = await chamarApi(`${HOSTING_API}/sites/${tenantId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return versao.name; // "sites/{tenantId}/versions/{versionId}"
}

async function popularEUpload(versionName, tenantId) {
  const arquivos = listarArquivos(ASSETS_DIR);
  const gzipPorHash = new Map();
  const hashes = {};

  for (const arq of arquivos) {
    // index.html é o único arquivo que muda por tenant — grava o
    // tenantId na meta tag `pa-tenant` (vem vazia em site-assets/) pra
    // o bundle (idêntico pra todo mundo, ver comentário no topo do
    // arquivo) saber de quem é o site quando o hostname é um domínio
    // próprio e não bate com *.web.app (ver public-tenant.js).
    let conteudo = fs.readFileSync(arq.abs);
    if (arq.publico === '/index.html') {
      conteudo = Buffer.from(
        conteudo.toString('utf8').replace(
          '<meta name="pa-tenant" id="meta-pa-tenant" content="">',
          `<meta name="pa-tenant" id="meta-pa-tenant" content="${tenantId}">`
        ),
        'utf8'
      );
    }
    const gz = zlib.gzipSync(conteudo);
    const hash = crypto.createHash('sha256').update(gz).digest('hex');
    gzipPorHash.set(hash, gz);
    hashes[arq.publico] = hash;
  }

  const resultado = await chamarApi(`${HOSTING_API}/${versionName}:populateFiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: hashes }),
  });

  const token = await tokenDeAcesso();
  for (const hash of resultado.uploadRequiredHashes || []) {
    const res = await fetch(`${resultado.uploadUrl}/${hash}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: gzipPorHash.get(hash),
    });
    if (!res.ok) throw new Error(`upload do arquivo ${hash} falhou: ${res.status} ${await res.text().catch(() => '')}`);
  }
}

async function finalizarEPublicar(tenantId, versionName) {
  await chamarApi(`${HOSTING_API}/${versionName}?updateMask=status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'FINALIZED' }),
  });
  await chamarApi(`${HOSTING_API}/sites/${tenantId}/releases?versionName=${encodeURIComponent(versionName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

exports.publicarSite = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
    const tenantId = request.auth.token.tenantId;
    if (!tenantId) throw new HttpsError('failed-precondition', 'Conta sem tenant.');

    const snap = await db.doc('brokers/' + tenantId).get();
    const broker = snap.exists ? snap.data() : null;
    if (!broker?.whatsapp) {
      throw new HttpsError('failed-precondition', 'Configure seu WhatsApp antes de publicar.');
    }

    try {
      await criarSiteSeNaoExistir(tenantId);
      const versionName = await criarVersao(tenantId);
      await popularEUpload(versionName, tenantId);
      await finalizarEPublicar(tenantId, versionName);
    } catch (err) {
      console.error(`[publicarSite] falha publicando "${tenantId}":`, err);
      throw new HttpsError('internal', 'Não foi possível publicar o site agora. Tente de novo em instantes.');
    }

    await db.doc('brokers/' + tenantId).update({ published: true, updatedAt: new Date() });

    return { url: `https://${tenantId}.web.app` };
  }
);
