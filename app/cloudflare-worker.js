/* ══════════════════════════════════════════════════════
   cloudflare-worker.js — roda na zona sitemob.app (Cloudflare Workers).
   NÃO faz parte do `firebase deploy` — precisa ser colado no dashboard
   da Cloudflare (Workers & Pages → Create Worker) ou publicado via
   `wrangler`, e depois ligado a rotas na própria zona. Este arquivo é
   só o código-fonte de referência; ver checklist de setup no README.

   Job único: qualquer requisição que chega na zona — seja
   <tenantId>.sitemob.app, o apex sitemob.app, ou um domínio próprio de
   corretor cujo Custom Hostname tem fallback origin = tenants.sitemob.app
   (ver functions/dominio.js) — precisa ser repassada pra servirSite
   (Cloud Function), preservando o hostname ORIGINAL num header à parte
   (x-original-host). Não dá pra só apontar um CNAME direto pro Cloud
   Run porque ele só aceita requisição cujo Host bata com o próprio
   domínio dele (*.cloudfunctions.net / *.a.run.app) — daí o Worker no
   meio, cujo trabalho é justamente essa troca de Host mantendo o
   original guardado à parte (é o que functions/servirSite.js lê pra
   descobrir de quem é o site).

   Rota que aponta pra este Worker (Workers Routes, na mesma zona
   sitemob.app) — UMA só, e precisa ser exatamente esta:
     */*

   `*/*` (e não `sitemob.app/*` + `*.sitemob.app/*`) porque esses dois
   padrões cobrem só hostnames DA zona, e um domínio próprio de corretor
   não é um deles — `*/*` é o padrão documentado pra pegar TODO tráfego
   que entra na zona, custom hostnames incluídos:
   developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/

   Efeito colateral conhecido do `*/*`: ele ignora `custom_origin_server`
   por hostname. Não usamos esse recurso — todo custom hostname cai no
   mesmo fallback origin.

   ── 522 logo depois de conectar um domínio (comportamento normal) ──
   Existe uma janela entre o CNAME do corretor entrar no ar e a
   Cloudflare ativar o Custom Hostname. Dentro dela o TLS já responde
   (certificado emitido) mas o mapeamento ainda não existe, então a
   requisição vai na origem real do fallback origin — o A 192.0.2.1,
   inalcançável de propósito — e volta 522. Observado ao vivo em
   catalogo.puntoalto.com.py: 522 às 14:55, 200 às 15:01, sem nenhuma
   mudança de config no meio. Não é bug de rota; é só esperar.

   DNS necessário na zona (qualquer IP serve de conteúdo — o Worker
   intercepta antes de qualquer origem real ser consultada, contanto
   que o registro esteja "Proxied", nuvem laranja, nunca "DNS only"):
     sitemob.app          A     192.0.2.1   Proxied
     *.sitemob.app        A     192.0.2.1   Proxied
     tenants.sitemob.app  A     192.0.2.1   Proxied   ← é este hostname
       que vira o "Fallback origin" em SSL/TLS → Custom Hostnames, e é
       pra ele que o corretor aponta o CNAME do domínio próprio dele.

   DESTINO usa a URL própria do Cloud Run (gerada por trás da function
   v2 servirSite, uma por serviço, sem prefixo de path) — testada e
   confirmada contra infra real durante o setup. Cogitamos usar o alias
   *.cloudfunctions.net/servirSite em vez disso (mais "oficial"), mas
   esse alias exige manter o path /servirSite na frente de cada
   requisição, e não confirmamos se o roteamento dele aceita path extra
   depois do nome da function — por ora, ficar com o que já foi testado
   e funciona. Atualizar aqui se servirSite for re-deployada como um
   Cloud Run service novo (a URL muda nesse caso).
   ══════════════════════════════════════════════════════ */

const DESTINO = 'https://servirsite-5gw6ff2u4q-rj.a.run.app';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const destino = new URL(DESTINO);
    destino.pathname = url.pathname;
    destino.search = url.search;

    const headers = new Headers(request.headers);
    headers.set('x-original-host', url.hostname);

    return fetch(destino.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
  },
};
