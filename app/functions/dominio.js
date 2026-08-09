/* ══════════════════════════════════════════════════════
   dominio.js — conecta um domínio próprio (ex.: catalogo.suaempresa.com.py)
   ao catálogo do tenant, via Cloudflare for SaaS (Custom Hostnames) —
   não mais via Hosting REST API (sites.domains), que amarrava 1 domínio
   a 1 Hosting site e esbarrava no teto de sites por projeto (ver
   README, "Limite de sites por projeto"). Agora existe 1 site só
   (servirSite.js, atrás da zona sitemob.app na Cloudflare) pra
   qualquer quantidade de corretores.

   Fluxo pro corretor, bem mais simples que o antigo:
     1. conectarDominio({ dominio }) → cria o Custom Hostname na
        Cloudflare, devolve um único valor fixo (cnameTarget,
        "tenants.sitemob.app") que não muda de corretor pra corretor.
     2. O corretor cadastra UM CNAME no DNS dele:
        <dominio> CNAME tenants.sitemob.app
        (fora do nosso controle — provedor de domínio de cada um).
     3. verificarDominio() → PATCH no mesmo recurso (é o que a doc da
        Cloudflare pede pra "cutucar" a validação depois que o CNAME já
        está apontando — sem isso, se o CNAME não existia no momento do
        POST inicial, a validação pode ficar parada) e devolve o status
        atualizado, cacheado em brokers/{tenantId}.customDomainStatus.
     4. removerDominio() → deleta o Custom Hostname, volta a usar só
        <tenantId>.sitemob.app.

   Diferença estrutural importante em relação ao Hosting: os endpoints
   de item único (GET/PATCH/DELETE) da API de Custom Hostnames são
   indexados pelo ID que a Cloudflare gera na criação (um UUID), não
   pelo nome do domínio — por isso brokers/{tenantId} agora também
   guarda customDomainId, não só customDomain.

   Usa CLOUDFLARE_API_TOKEN (secret, `firebase functions:secrets:set`)
   com permissão "Zone → SSL and Certificates → Edit" restrita à zona
   sitemob.app — validado manualmente contra a API real antes de
   escrever este arquivo (token ativo, permissão confirmada com
   HTTP 200 em GET .../custom_hostnames).
   ══════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { db } = require('./admin');
const { exigirTrialAtivo } = require('./trial');

const CLOUDFLARE_API_TOKEN = defineSecret('CLOUDFLARE_API_TOKEN');
const CLOUDFLARE_ZONE_ID = '1cf07d69f4d22591a096139670379cc9'; // zona sitemob.app — não é segredo
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

// Hostname fixo, o mesmo pra qualquer corretor — é o fallback origin
// configurado no Cloudflare for SaaS da zona, que repassa pro
// servirSite.js preservando o Host original da requisição.
const CNAME_TARGET = 'tenants.sitemob.app';

async function chamarApi(token, caminho, opcoes = {}) {
  const res = await fetch(`${CLOUDFLARE_API}${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok || corpo?.success === false) {
    const erro = new Error(`${opcoes.method || 'GET'} ${caminho} → ${res.status}: ${JSON.stringify(corpo?.errors || corpo)}`);
    erro.status = res.status;
    throw erro;
  }
  return corpo.result;
}

// Bem permissivo de propósito — domínio + subdomínio, sem protocolo,
// sem caminho. A validação de verdade (se o domínio existe/resolve) é
// feita pela própria Cloudflare, não por aqui.
const DOMINIO_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// Reduz o status bruto do Custom Hostname (status/ssl.status — dezenas
// de valores possíveis, ver doc da Cloudflare) pro estado que
// brokers/{tenantId}.customDomainStatus grava e a tela em dominio.html
// mostra: 'requested' (conectado, cert ainda nem começou), 'configuring'
// (cert em progresso) ou 'active' (servindo de verdade). Fica só nesses
// valores de propósito — mais simples e estável do que expor os nomes
// de enum da Cloudflare direto pro client.
function statusResumido(h) {
  const status = (h.status || '').toLowerCase();
  const sslStatus = (h.ssl?.status || '').toLowerCase();
  if (status === 'active' && sslStatus === 'active') return 'active';
  if (sslStatus && sslStatus !== 'initializing') return 'configuring';
  return 'requested';
}

function resumirCustomHostname(h) {
  return {
    dominio: h.hostname,
    status: statusResumido(h),
    cnameTarget: CNAME_TARGET,
  };
}

async function tenantIdDoRequest(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'É preciso estar logado.');
  const tenantId = request.auth.token.tenantId;
  if (!tenantId) throw new HttpsError('failed-precondition', 'Conta sem tenant.');
  return tenantId;
}

exports.conectarDominio = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB', secrets: [CLOUDFLARE_API_TOKEN] },
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
    // Cada domínio conectado consome um Custom Hostname da nossa zona
    // na Cloudflare — trial vencido não abre mais nenhum. Os já
    // conectados continuam servindo normalmente (só verificar/remover
    // seguem liberados).
    exigirTrialAtivo(brokerSnap.data());

    const token = CLOUDFLARE_API_TOKEN.value();
    let hostname;
    try {
      hostname = await chamarApi(token, `/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
        method: 'POST',
        body: JSON.stringify({ hostname: dominio, ssl: { method: 'http', type: 'dv' } }),
      });
    } catch (err) {
      console.error(`[conectarDominio] falha criando custom hostname "${dominio}" (tenant "${tenantId}"):`, err);
      if (err.status === 409) throw new HttpsError('already-exists', 'Esse domínio já está conectado a outro site.');
      throw new HttpsError('internal', 'Não foi possível conectar o domínio agora. Tente de novo em instantes.');
    }

    const resumo = resumirCustomHostname(hostname);
    await db.doc('brokers/' + tenantId).update({
      customDomain: dominio,
      customDomainId: hostname.id,
      customDomainStatus: resumo.status,
      updatedAt: new Date(),
    });

    return resumo;
  }
);

exports.verificarDominio = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, memory: '256MiB', secrets: [CLOUDFLARE_API_TOKEN] },
  async (request) => {
    const tenantId = await tenantIdDoRequest(request);
    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    const { customDomain, customDomainId } = brokerSnap.data() || {};
    if (!customDomain || !customDomainId) {
      throw new HttpsError('failed-precondition', 'Nenhum domínio conectado ainda.');
    }

    const token = CLOUDFLARE_API_TOKEN.value();
    let hostname;
    try {
      // PATCH (não GET) de propósito — é o que a doc da Cloudflare pede
      // pra "cutucar" a revalidação quando o CNAME não estava apontando
      // ainda no momento do POST inicial (ver comentário no topo do
      // arquivo). Reenviar a mesma config de ssl é inofensivo quando já
      // está tudo certo, e é o que reflete o estado mais atual.
      hostname = await chamarApi(token, `/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${customDomainId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ssl: { method: 'http', type: 'dv' } }),
      });
    } catch (err) {
      console.error(`[verificarDominio] falha consultando "${customDomain}" (tenant "${tenantId}"):`, err);
      throw new HttpsError('internal', 'Não foi possível verificar o domínio agora. Tente de novo em instantes.');
    }

    const resumo = resumirCustomHostname(hostname);
    await db.doc('brokers/' + tenantId).update({ customDomainStatus: resumo.status, updatedAt: new Date() });
    return resumo;
  }
);

exports.removerDominio = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30, memory: '256MiB', secrets: [CLOUDFLARE_API_TOKEN] },
  async (request) => {
    const tenantId = await tenantIdDoRequest(request);
    const brokerSnap = await db.doc('brokers/' + tenantId).get();
    const { customDomainId } = brokerSnap.data() || {};
    if (!customDomainId) return { ok: true }; // nada pra remover — idempotente

    const token = CLOUDFLARE_API_TOKEN.value();
    try {
      await chamarApi(token, `/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${customDomainId}`, { method: 'DELETE' });
    } catch (err) {
      // 404 = já não existe do lado da Cloudflare — segue e limpa o Firestore mesmo assim
      if (err.status !== 404) {
        console.error(`[removerDominio] falha removendo custom hostname (tenant "${tenantId}"):`, err);
        throw new HttpsError('internal', 'Não foi possível remover o domínio agora. Tente de novo em instantes.');
      }
    }

    await db.doc('brokers/' + tenantId).update({
      customDomain: null,
      customDomainId: null,
      customDomainStatus: 'none',
      updatedAt: new Date(),
    });
    return { ok: true };
  }
);
