/* ══════════════════════════════════════════════════════
   dominio.js — conecta um domínio próprio (ex.: catalogo.suaempresa.com.py)
   ao site já publicado do tenant (<tenantId>.web.app), usando o recurso
   sites.domains da Hosting REST API v1beta1 — endpoint diferente do que
   publicarSite.js usa (aquele publica ARQUIVOS; este associa um DOMÍNIO
   ao site que já existe). Precisa que o tenant já tenha publicado o site
   pelo menos uma vez (senão o site do Hosting nem existe ainda).

   Fluxo pro corretor:
     1. conectarDominio({ dominio }) → cria a associação no Hosting,
        devolve os registros DNS que ele precisa cadastrar no provedor
        dele (provisioning.expectedIps — um ou mais IPs pra um
        registro A; certChallengeDns, se o Hosting pedir um TXT extra
        pra emitir o certificado).
     2. O corretor cadastra esses registros no DNS do domínio dele
        (fora do nosso controle — provedor de domínio de cada um).
     3. verificarDominio() → refaz o GET do recurso, atualiza o status
        cacheado em brokers/{tenantId}.customDomainStatus. Propagação de
        DNS + emissão do certificado SSL pode levar até 24h segundo a
        documentação do Firebase Hosting.
     4. removerDominio() → desfaz a associação, volta a usar só
        <tenantId>.web.app.

   ⚠️ NÃO TESTADO CONTRA INFRA REAL — a Hosting API v1beta1 pede
   confirmação de posse do domínio (verificação, historicamente via
   Search Console/Site Verification) antes de aceitar certos domínios;
   não está claro pelas fontes disponíveis se o endpoint sites.domains
   exige isso por fora ou se resolve sozinho pro caso de site
   multi-tenant como este. Testar com um domínio de verdade antes de
   oferecer pra cliente — se a Hosting API devolver erro de verificação
   de posse, esse fluxo credencial extra ainda precisa ser desenhado
   (Site Verification API, feito manualmente pela equipe Punto Alto por
   enquanto, não pelo corretor).

   Mesmo padrão de auth/erro de publicarSite.js: credenciais padrão da
   function (applicationDefault(), resolvida late — mesmo motivo do
   comentário em publicarSite.js) e o mesmo papel
   roles/firebasehosting.admin já concedido pra ela cobre isto também
   (é a mesma API, só recurso diferente).
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { applicationDefault } = require('firebase-admin/app');
const { db } = require('./admin');

const HOSTING_API = 'https://firebasehosting.googleapis.com/v1beta1';

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

// Bem permissivo de propósito — domínio + subdomínio, sem protocolo,
// sem caminho. A validação de verdade (se o domínio existe/resolve) é
// feita pelo próprio Hosting, não por aqui.
const DOMINIO_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// Reduz o status bruto da Hosting API (certStatus/dnsStatus/status —
// nomes de enum não confirmados contra uma resposta real, ver ⚠️ no
// README) pro estado que brokers/{tenantId}.customDomainStatus grava
// e que a tela em dominio.html mostra: 'none' (sem domínio),
// 'requested' (conectado, ainda sem DNS encontrado), 'configuring'
// (DNS já bate ou o certificado já começou a provisionar) ou 'active'
// (certificado ativo, servindo de verdade). Fica só nesses 4 valores
// de propósito — mais simples e estável do que expor os nomes de enum
// da Hosting API direto pro client.
function statusResumido(d) {
  const cert = (d.provisioning?.certStatus || '').toUpperCase();
  const dns = (d.provisioning?.dnsStatus || '').toUpperCase();
  if (d.status === 'DOMAIN_ACTIVE' || cert.includes('ACTIVE')) return 'active';
  if (dns.includes('MATCH') || cert) return 'configuring';
  return 'requested';
}

// Resume o objeto Domain (Hosting API) pro shape que a tela em
// dominio.html precisa — nunca devolve o objeto cru pro client.
function resumirDomain(d) {
  return {
    dominio: d.domainName,
    status: statusResumido(d),
    expectedIps: d.provisioning?.expectedIps || [],
    discoveredIps: d.provisioning?.discoveredIps || [],
  };
}

async function tenantIdDoRequest(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
  const tenantId = request.auth.token.tenantId;
  if (!tenantId) throw new HttpsError('failed-precondition', 'Conta sem tenant.');
  return tenantId;
}

exports.conectarDominio = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    const tenantId = await tenantIdDoRequest(request);
    const dominio = String(request.data?.dominio || '').trim().toLowerCase();
    if (!DOMINIO_REGEX.test(dominio)) {
      throw new HttpsError('invalid-argument', 'Domínio inválido — digite algo como catalogo.suaempresa.com.py.');
    }

    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    if (!brokerSnap.exists || !brokerSnap.data()?.published) {
      throw new HttpsError('failed-precondition', 'Publique seu site em "Meu Site" antes de conectar um domínio.');
    }

    let domain;
    try {
      domain = await chamarApi(`${HOSTING_API}/sites/${tenantId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName: dominio }),
      });
    } catch (err) {
      console.error(`[conectarDominio] falha associando "${dominio}" ao site "${tenantId}":`, err);
      if (err.status === 409) throw new HttpsError('already-exists', 'Esse domínio já está conectado a outro site.');
      throw new HttpsError('internal', 'Não foi possível conectar o domínio agora. Tente de novo em instantes.');
    }

    const resumo = resumirDomain(domain);
    await db.doc('brokers/' + tenantId).update({
      customDomain: dominio,
      customDomainStatus: resumo.status,
      updatedAt: new Date(),
    });

    return resumo;
  }
);

exports.verificarDominio = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    const tenantId = await tenantIdDoRequest(request);
    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    const dominio = brokerSnap.data()?.customDomain;
    if (!dominio) throw new HttpsError('failed-precondition', 'Nenhum domínio conectado ainda.');

    let domain;
    try {
      domain = await chamarApi(`${HOSTING_API}/sites/${tenantId}/domains/${encodeURIComponent(dominio)}`);
    } catch (err) {
      console.error(`[verificarDominio] falha consultando "${dominio}" no site "${tenantId}":`, err);
      throw new HttpsError('internal', 'Não foi possível verificar o domínio agora. Tente de novo em instantes.');
    }

    const resumo = resumirDomain(domain);
    await db.doc('brokers/' + tenantId).update({ customDomainStatus: resumo.status, updatedAt: new Date() });
    return resumo;
  }
);

exports.removerDominio = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    const tenantId = await tenantIdDoRequest(request);
    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    const dominio = brokerSnap.data()?.customDomain;
    if (!dominio) return { ok: true }; // nada pra remover — idempotente

    try {
      await chamarApi(`${HOSTING_API}/sites/${tenantId}/domains/${encodeURIComponent(dominio)}`, { method: 'DELETE' });
    } catch (err) {
      // 404 = já não existe do lado do Hosting — segue e limpa o Firestore mesmo assim
      if (err.status !== 404) {
        console.error(`[removerDominio] falha removendo "${dominio}" do site "${tenantId}":`, err);
        throw new HttpsError('internal', 'Não foi possível remover o domínio agora. Tente de novo em instantes.');
      }
    }

    await db.doc('brokers/' + tenantId).update({
      customDomain: null,
      customDomainStatus: 'none',
      updatedAt: new Date(),
    });
    return { ok: true };
  }
);
