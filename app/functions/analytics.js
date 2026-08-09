/* ══════════════════════════════════════════════════════
   analytics.js — os dois beacons do produto.

     logVisita  → visita da landing (topo de funil, nosso marketing)
     logEvento  → clique de contato no catálogo de um corretor
                  (resultado que o produto entrega pra ele)

   São coisas diferentes de propósito: um mede se ALGUÉM CHEGA até a
   gente, o outro se o produto GERA NEGÓCIO pra quem já é cliente.
   ------------------------------------------------------
   logVisita — beacon de topo de funil. A landing (functions/landing/
   index.html) chama isso uma vez por pageview e o doc gravado em
   `analytics_visits/` é a ÚNICA fonte de "quantas visitas o site
   teve" — não existe GA/GTM na landing (o `gtmId` do schema é do
   corretor, injetado no catálogo público dele, nada a ver com aqui).

   Por que Firestore próprio e não GA4: pra cruzar visita com dado de
   negócio (a visita virou conta? virou assinante?) o GA4 exigiria
   export pro BigQuery e um join fora do app. Aqui a mesma query do
   painel interno lê `analytics_visits` e `brokers` lado a lado —
   ver public/js/interno-metricas.js.

   POST /logVisita
     { visitorId, sessionId, path, referrer, utm*, lang,
       novoVisitante, novaSessao }

   Escrita é SEMPRE por aqui (Admin SDK), nunca client-side direto na
   collection — por isso `analytics_visits` tem `allow write: if false`
   nas rules. A superfície aberta é este endpoint, que valida formato e
   corta tamanho antes de gravar qualquer coisa.

   ⚠️  NÃO TESTADO CONTRA INFRA REAL.
   ══════════════════════════════════════════════════════ */

const { onRequest } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { db } = require('./admin');

// Só a própria zona chama isso — a landing (apex) e, se um dia
// precisar, o painel. Aberto pra `*` seria um convite a inflar as
// métricas de qualquer aba do mundo.
const ORIGENS = [
  /^https:\/\/(www\.)?sitemob\.app$/,
  /^https:\/\/[a-z0-9-]+\.sitemob\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

// Formato gerado pelo tracker da landing: hex de 32 chars (crypto) ou
// o fallback base36. Qualquer coisa fora disso é lixo/abuso e a visita
// é descartada — sem id válido ela não serve nem pra contar único nem
// pra casar com o signup.
const ID_REGEX = /^[a-z0-9]{8,40}$/;

const MAX_TEXTO = 300;

// Bots inflam "visitas" sem serem gente. Filtro simples de user-agent —
// não pega tudo, mas tira o grosso (crawlers de busca e os previews de
// link que WhatsApp/Facebook disparam a cada compartilhamento, que no
// nosso caso seriam ruído puro).
const BOT_REGEX = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|gtmetrix|facebookexternalhit|whatsapp|telegram|preview|monitor|curl|wget|python-requests|axios/i;

function texto(v, max = MAX_TEXTO) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

function id(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return ID_REGEX.test(s) ? s : null;
}

// Host do referrer separado do referrer inteiro — é por host que a
// tabela de canais do painel agrupa ("google.com", "instagram.com"),
// e fazer isso na hora de gravar evita ter que parsear URL de novo a
// cada carregamento do painel.
function host(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, '').slice(0, 120) || null; }
  catch { return null; }
}

exports.logVisita = onRequest(
  { region: 'southamerica-east1', cors: ORIGENS, memory: '128MiB', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('método não permitido'); return; }

    const ua = String(req.headers['user-agent'] || '');
    // 204 (e não 4xx) de propósito: pro bot, e pro navegador que
    // mandou lixo, a resposta é a mesma "ok, ignorei" — nada de
    // devolver pista de qual validação reprovou.
    if (BOT_REGEX.test(ua)) { res.status(204).send(''); return; }

    const corpo = req.body || {};
    const visitorId = id(corpo.visitorId);
    const sessionId = id(corpo.sessionId);
    if (!visitorId || !sessionId) { res.status(204).send(''); return; }

    const referrer = texto(corpo.referrer, 500);

    try {
      await db.collection('analytics_visits').add({
        visitorId,
        sessionId,
        ts: new Date(),
        path:        texto(corpo.path, 200) || '/',
        referrer,
        referrerHost: host(referrer),
        utmSource:   texto(corpo.utmSource, 120),
        utmMedium:   texto(corpo.utmMedium, 120),
        utmCampaign: texto(corpo.utmCampaign, 120),
        utmTerm:     texto(corpo.utmTerm, 120),
        utmContent:  texto(corpo.utmContent, 120),
        lang:        texto(corpo.lang, 12),
        // "primeiro pageview desse visitante/sessão" — quem decide é o
        // client (é ele que sabe se o localStorage/sessionStorage já
        // tinha o id). Serve de atalho: contar visitante único sem
        // varrer todos os docs distintos. O painel hoje ainda faz a
        // contagem por Set de visitorId, mas com volume alto esses
        // flags viram a base de um agregado diário barato.
        novoVisitante: corpo.novoVisitante === true,
        novaSessao:    corpo.novaSessao === true,
        // mobile/desktop cru do UA — não guardamos o UA inteiro nem IP
        // de propósito: nada aqui precisa identificar uma pessoa.
        dispositivo: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
      });
      res.status(204).send('');
    } catch (err) {
      console.error('[logVisita] falha ao gravar visita:', err);
      res.status(500).send('erro interno');
    }
  }
);

/* ══════════════════════════════════════════════════════
   logEvento — clique de contato no catálogo público de um corretor.

   Hoje TODO contato sai do site por link externo (wa.me, mailto:,
   Instagram) e desaparece: não há formulário, e `leads`/`leads_imovel`
   nas rules são resquício do template antigo, ninguém escreve neles.
   Sem isto, nem o corretor nem a gente sabe se o produto gerou um
   negócio sequer.

   ⚠️  É CLIQUE, não contato confirmado. Abrir o WhatsApp não é o mesmo
   que mandar mensagem — parte das pessoas desiste ali. Por isso o
   contador se chama `contatosCliques` e não `contatos`: se esse número
   virar copy de marketing um dia, tem que ser com uma frase que
   sobreviva a alguém conferindo.

   POST /logEvento
     { tenantId, tipo, visitorId, imovelId?, paginaId?, origem? }

   Grava em `analytics_events/` (genérica de propósito — tipo novo não
   precisa de pipeline novo) e incrementa contadores no doc do broker,
   pra o painel dele mostrar o número sem query nenhuma.
   ══════════════════════════════════════════════════════ */

const TIPOS_EVENTO = new Set(['whatsapp', 'email', 'instagram', 'telefone']);
const TENANT_REGEX = /^[a-z0-9-]{3,40}$/;

// O catálogo roda em <tenant>.sitemob.app OU no domínio próprio do
// corretor — não dá pra fixar uma lista de origens como em logVisita.
// A checagem é contra o tenant que o evento DIZ ser: o Origin tem que
// bater com o subdomínio dele ou com o customDomain cadastrado.
//
// Isso impede a inflação acidental e o caso "outro site abre o
// endpoint no navegador"; NÃO impede um script mandando Origin
// forjado, porque header nenhum é confiável fora do navegador. Se um
// dia isso virar problema de verdade, a resposta é App Check ou rate
// limit por IP, não uma checagem melhor de header.
function origemBate(origin, tenantId, broker) {
  let host;
  try { host = new URL(String(origin)).hostname.toLowerCase(); }
  catch { return false; }
  if (host === `${tenantId}.sitemob.app`) return true;
  return !!broker.customDomain && host === String(broker.customDomain).toLowerCase();
}

exports.logEvento = onRequest(
  { region: 'southamerica-east1', cors: true, memory: '128MiB', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('método não permitido'); return; }

    const ua = String(req.headers['user-agent'] || '');
    // 204 em tudo que é descartado — nunca devolver qual validação
    // reprovou. Ver a mesma decisão em logVisita.
    if (BOT_REGEX.test(ua)) { res.status(204).send(''); return; }

    const corpo = req.body || {};
    const tenantId = String(corpo.tenantId || '').trim().toLowerCase();
    const tipo = String(corpo.tipo || '').trim().toLowerCase();
    const visitorId = id(corpo.visitorId);

    if (!TENANT_REGEX.test(tenantId) || !TIPOS_EVENTO.has(tipo) || !visitorId) {
      res.status(204).send('');
      return;
    }

    try {
      const brokerRef = db.doc('brokers/' + tenantId);
      const snap = await brokerRef.get();
      if (!snap.exists) { res.status(204).send(''); return; }

      if (!origemBate(req.headers.origin, tenantId, snap.data())) {
        console.warn(`[logEvento] origem "${req.headers.origin}" não bate com o tenant "${tenantId}" — descartado`);
        res.status(204).send('');
        return;
      }

      const agora = new Date();
      // Chave YYYY-MM em UTC — o corte de mês do contador não precisa
      // ser exato ao fuso do corretor, só estável e comparável.
      const mes = agora.toISOString().slice(0, 7);

      await Promise.all([
        db.collection('analytics_events').add({
          tenantId, tipo, visitorId,
          ts: agora,
          imovelId: texto(corpo.imovelId, 60),
          paginaId: texto(corpo.paginaId, 60),
          origem:   texto(corpo.origem, 40),
          dispositivo: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
        }),
        // update() com FieldPath explícito, NUNCA set({'a.b': ...}):
        // no Admin SDK só update() interpreta ponto como caminho — em
        // set(), a chave vira um campo de nome literal "a.b" e o valor
        // aninhado nunca aparece. FieldPath também é o único jeito de
        // endereçar um segmento como "2026-08", que não é identificador
        // válido num caminho escrito como string.
        brokerRef.update(
          new FieldPath('usage', 'contatosCliques'), FieldValue.increment(1),
          new FieldPath('usage', 'contatosPorMes', mes), FieldValue.increment(1),
          new FieldPath('usage', 'contatoUltimoEm'), agora,
        ),
      ]);

      res.status(204).send('');
    } catch (err) {
      console.error(`[logEvento] falha ao registrar "${tipo}" de "${tenantId}":`, err);
      res.status(500).send('erro interno');
    }
  }
);
