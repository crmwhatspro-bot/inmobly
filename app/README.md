# Inmobly App — SaaS self-service multi-tenant

Substitui o modelo antigo de **um projeto Firebase isolado por broker**
(`template/` + `control-plane/`, mantidos como referência, não apagados) por um
**único projeto compartilhado** (`inmobly-project`, plano Blaze), com signup
automatizado, checkout integrado e um único `/login` em vez de um `/admin` por site
de corretor.

Ver [`../docs/REGRAS-DE-NEGOCIO.md`](../docs/REGRAS-DE-NEGOCIO.md) para planos/preços
(seção 1, sobre custo de infra, **precisa ser recalculada** pro modelo compartilhado —
ver aviso no topo daquele documento).

⚠️ **Nada aqui foi testado contra infraestrutura real ainda.** `inmobly-project` já
existe e está em Blaze (feito pelo usuário), mas os produtos no Stripe, os secrets e
o primeiro deploy ainda não. JS syntax-checked e os módulos de `functions/` foram
`require()`ados com sucesso (imports resolvem), mas nada rodou contra Firestore/Auth/
Stripe reais.

## A jornada construída

```
public/inmobiliario.html (puntoalto/v1, outro repo)
        │  CTA "já quero começar"
        ▼
  login.html          → Google Sign-In
        │
        ▼ (sem tenant ainda)
  criar-conta.html     → escolhe nome + slug → chama criarConta()
        │
        ▼
  tour.html            → 4 slides de onboarding → marca onboardingCompleted
        │
        ▼
  planos.html          → Starter/Pro → chama criarCheckoutSession() → Stripe
        │
        ▼ (Stripe success_url)
  obrigado.html        → confirmação, manda pro painel
        │
        ▼
  ══════════ a partir daqui, tudo dentro do app shell (ver abaixo) ══════════
        ▼
  painel.html (Dashboard)  → status atual + atalhos
        │
        ▼
  admin.html (Meus Imóveis) → CMS real: CRUD de imóveis, fotos, comodidades
                          (brokers/{tenantId}/imoveis)
        │
        ▼
  meu-site.html (Meu Site) → configura whatsapp + botão Publicar site
                          → chama a function publicarSite() (cria o
                          Hosting site <slug>.web.app + deploy do catálogo)
        │
        ▼ (published: true)
  site/index.html          → catálogo público (sem login), ao vivo em
                          https://<slug>.web.app — resolve o tenant por
                          location.hostname (?t=slug só serve de fallback
                          pra testar sem ter publicado ainda)
        │
  planos.html (Plano), em-breve.html (Leads / Domínio / Perfil /
  Configurações — stubs honestos, sem funcionalidade ainda)
```

Um usuário que já tem tenant e já fez o tour pula direto pra `painel.html` —
`js/tenant.js` decide isso lendo o custom claim `tenantId` + `onboardingCompleted`.

### App shell (pós-login)

`painel.html`, `admin.html`, `meu-site.html`, `planos.html` e `em-breve.html`
compartilham a mesma casca — sidebar fixa à esquerda (Dashboard / Meus
Imóveis / Meu Site / Leads / Domínio / Plano, com "Em breve" só nos itens
sem UI própria ainda: Leads e Domínio) +
topbar com dropdown de avatar (Meu perfil / Configurações / Sair). Antes
disso cada página tinha seu próprio header solto e nenhuma navegação entre
elas — só dava pra "descobrir" outra página por um botão específico.

- `css/shell.css` — toda a casca (sidebar, topbar, dropdown de avatar,
  card "Novidades" e bloco de perfil/plano/uso no rodapé da sidebar,
  conversão pra bottom-nav no mobile). Antes vivia dentro de `admin.css`
  como `.admin-sidebar`/`.admin-topbar`, sem estar de fato conectado no
  `admin.html` — por isso a tela ficava em branco (ver commit anterior).
  Nomes de classe mantidos com prefixo `admin-` por herança, mas o arquivo
  não é mais exclusivo do CMS de imóveis.
- `js/shell.js` — `initShell({active, title})`: renderiza sidebar/topbar e
  **centraliza o auth-gate** (login → tenantId → broker) que antes estava
  triplicado em `painel.js`/`admin-imoveis.js`/`planos.js`. Cada página
  chama isso e recebe `{user, tenantId, broker}` de volta pra sua própria
  lógica de conteúdo. Também popula o rodapé da sidebar (nome, plano, uso
  de imóveis com barrinha, CTA "Assinar"/"Regularizar"/"Reativar" — some
  quando `status === 'active'`, texto muda conforme o motivo) e o avatar
  (foto do Google se existir, senão iniciais do nome).
- `em-breve.html`/`js/em-breve.js` — placeholder genérico pros itens do
  menu sem UI ainda; `?f=leads|dominio|perfil|configuracoes` decide o
  título/texto mostrado.
- **Navegação no mobile (≤900px)**: dois níveis, não mais a sidebar
  inteira comprimida numa barra inferior (6 rótulos de duas palavras
  numa fatia de ~60px sempre quebravam linha e ficavam ilegíveis).
  - `.admin-bottombar` — barra fixa no rodapé, só ícone, só os itens
    `primary: true` no array `NAV` (Dashboard, Meus Imóveis, Meu Site,
    Plano — Leads/Domínio ficam de fora, são só stub "Em breve").
  - Hambúrguer no canto superior esquerdo da topbar (`.admin-topbar__hamburger`,
    escondido no desktop) abre a sidebar completa — mesmo conteúdo do
    desktop (logo, todos os 6 itens com rótulo, rodapé com
    Novidades/perfil/plano/uso/Assinar) — como um drawer deslizando da
    esquerda sobre um backdrop escurecido. `js/shell.js#wireDrawer()`
    cuida do abrir/fechar (clique no backdrop, Escape, ou o próprio
    hambúrguer).
- **Pendente**: aplicar um product tour (destacando os itens da sidebar)
  depois que essa interface for validada — combinado, ainda não construído.

### Meu Site / catálogo público

`meu-site.html`+`js/meu-site.js` — o corretor configura `whatsapp` (escrita
direta em `brokers/{tenantId}`) e clica "Publicar site", que chama a
function `publicarSite` (onCall). `site/index.html` é o catálogo que o
cliente final vê, sem login:

- **`publicarSite` (`functions/publicarSite.js`)** — cria (se ainda não
  existir — 409 é tratado como sucesso) um Hosting site dedicado com
  `siteId = tenantId`, faz o deploy do bundle estático de
  `functions/site-assets/` nele (fluxo completo da Hosting REST API:
  criar versão → hash sha256 do gzip de cada arquivo → `populateFiles` →
  upload dos arquivos que a API pedir → finalizar versão → criar release)
  e só então marca `published: true`. Se qualquer etapa falhar, não marca
  `published` — evita "publicado" mentiroso sem o site de fato existir.
  Usa as credenciais padrão da function (`applicationDefault()`) pra
  chamar a API do Hosting, então precisa de `roles/firebasehosting.admin`
  na service account (ver Setup abaixo — não concedido por padrão, mesmo
  tipo de passo manual já feito pras outras functions).
- **`functions/site-assets/`** — CÓPIA de `public/site/`. Uma Cloud
  Function só enxerga o que está dentro da própria pasta de deploy
  (`functions/`), não lê `public/site/` de fora dela. **Sempre que
  `public/site/` mudar, copiar de novo pra `functions/site-assets/`** —
  sem isso, "Publicar site" continua publicando uma versão desatualizada
  do catálogo pra todo mundo que clicar. Nenhum passo automático garante
  essa sincronia hoje.
- **Despublicar continua simples**: `updateDoc(..., {published: false})`
  direto do client — não desfaz o Hosting site nem os arquivos, só faz
  `perfilPublico` parar de responder (o catálogo publicado fica "no ar"
  mas mostra a tela de indisponível).
- **Não lê `brokers/{tenantId}` direto** (tem e-mail, IDs do Stripe) — o
  catálogo chama `perfilPublico?tenant=slug`, que só responde se
  `published === true` (404 senão) e devolve uma projeção pública dos
  campos abaixo. `imoveis`/`fotos` continuam lidos direto do Firestore
  client-side, já eram públicos.
- **Resolve o tenant** por `location.hostname` em produção
  (`<slug>.web.app`) com fallback `?t=slug` pra testar antes de publicar.
- **Conteúdo**: hero (logo + `headline` + `subheadline` + WhatsApp) +
  filtros básicos (operação/tipo/cidade, cidade montada dinamicamente a
  partir dos imóveis do corretor) + grid + modal de detalhe + seção
  "Sobre" (`about`, só aparece se preenchido) antes do rodapé + rodapé
  com WhatsApp/e-mail/Instagram. Referência visual: o mesmo site Nando
  Barros que `template/` já clonava desde o início do projeto — não é
  mais a versão "enxuta" original, essa foi abandonada depois de ver o
  resultado. Ainda sem depoimentos/FAQ/formulário de contato — não
  pedidos até agora. `site/js/imoveis.js` é a versão adaptada de
  `template/js/imoveis.js` (paths viram `brokers/{tenantId}/imoveis/...`,
  idioma fixo em `es`).
- **Identidade visual** — `meu-site.html` deixa o corretor configurar
  `name`, `logo` (upload comprimido pro mesmo padrão canvas→WebP/JPEG do
  CMS de imóveis, sem Storage, teto de 180KB) e `accentColor` (cor de
  destaque, um de 6 presets curados — não um color-picker livre, pra
  evitar combinação feia). O site público aplica a cor em tempo real via
  `site/js/cores.js`, que reproduz o algoritmo `misturar()` de
  `scripts/build.js` (mistura a cor base com preto/branco pra gerar as
  variações dark/light/ghost/glow) — só que rodando no navegador do
  visitante em vez de 1x num passo de build, porque a mesma página serve
  qualquer tenant.
- **Textos do site** — `headline`, `subheadline`, `about`, `keywords`,
  tudo opcional: sem preencher, o site cai num texto padrão razoável
  (nunca fica quebrado ou vazio).
- **Contato** — além do `whatsapp` (obrigatório pra publicar), `email` e
  `instagramUrl` opcionais, aparecem no rodapé do site público se
  preenchidos.
- **Preview em popup** — botão "Pré-visualizar site" abre um modal com
  `site/index.html?preview=1` num `<iframe>` — o `src` só é setado nesse
  clique (não carrega sozinho ao abrir a página). Nesse modo o catálogo
  não chama Firestore nem `perfilPublico`: espera receber o perfil por
  `postMessage` do formulário (reenviado, com debounce, a cada campo
  editado, mesmo antes de salvar — inclusive com o modal já aberto) e
  mostra 3 imóveis de exemplo fixos só pra ilustrar o layout do grid, já
  que um corretor recém-cadastrado ainda não tem imóveis reais pra
  mostrar.
- **Três seções de salvamento** (Identidade / Textos / Contato), cada
  uma com seu próprio botão — evita um formulário gigante com um único
  "Salvar" para tudo, e mantém o WhatsApp junto do resto do contato em
  vez de isolado como antes.
- **Limite de sites por projeto**: Firebase Hosting tem uma cota de sites
  por projeto (dezenas, não milhares). Não é problema na validação inicial
  do produto, mas é uma parede que existe — não resolvida agora de
  propósito, só registrada aqui pra não esquecer quando a base de
  corretores crescer.

## Estrutura

```
firestore.rules          ← ver schema abaixo
firestore.indexes.json
firebase.json            ← hosting de public/ + firestore + functions
public/
  login.html, criar-conta.html, tour.html, obrigado.html  ← jornada pré-app
  painel.html, admin.html, meu-site.html, planos.html,
  em-breve.html                                           ← dentro do app shell
  site/                     ← catálogo público, pasta autocontida (ver seção
                              acima) — css/js próprios, não usa os de public/
  css/app.css              ← visual da jornada (login/tour/obrigado) — próprio
                              do Inmobly, não é o tema por broker
  css/shell.css            ← sidebar + topbar do app shell, ver seção acima
  css/tokens.css           ← "assado" a partir de template/css/tokens.css: mesmos
                              {{CLR_PRIMARY}}/{{CLR_ACCENT}}/etc. de sempre, só que
                              resolvidos 1x pra cores fixas do Inmobly (não há
                              build.js aqui, então não podem ficar como placeholder)
  css/base.css, components.css, admin.css
                            ← copiados verbatim de template/css/ (zero placeholder
                              nesses três — só tokens.css precisou ser assado).
                              admin.css hoje só tem o que é específico de "Meus
                              Imóveis" (métricas, tabela, formulário) — a sidebar/
                              topbar saiu de lá pra shell.css
  js/firebase.js           ← init do projeto único (config literal, PREENCHER)
  js/tenant.js             ← lê custom claim tenantId, decide a próxima página, e
                              agora também limiteEfetivo(broker) — lê o limite do
                              plano direto do doc do tenant, sem o config/plan
                              sincronizado que o template/js/plano.js antigo usava
  js/shell.js              ← sidebar/topbar/auth-gate compartilhados, ver seção acima
  js/admin-imoveis.js      ← CRUD de imóveis, portado de
                              template/js/admin-imoveis.js: mesma compressão de
                              fotos (canvas → WebP/JPEG, máx 900px, sem Storage),
                              caminhos trocados pra brokers/{tenantId}/imoveis/...
  js/<pagina>.js            ← um arquivo por página, mesmo padrão do template/ antigo
functions/
  admin.js                 ← app default do Firebase Admin, inicializado 1x
  criarConta.js             ← signup: cria brokers/{slug} + seta custom claim
  checkout.js                ← criarCheckoutSession (onCall — bem mais simples
                                que a versão cross-project do control-plane/)
  webhook.js                  ← stripeWebhook (quase idêntico ao control-plane/,
                                 sempre escreveu só no doc "central")
  perfilPublico.js              ← onRequest público (cors:true), usado por
                                   site/index.html — ver seção "Meu Site" acima
  publicarSite.js                 ← onCall: cria o Hosting site do tenant e
                                     faz deploy de site-assets/ — ver seção
                                     "Meu Site" acima
  site-assets/                      ← CÓPIA de public/site/, ver aviso na
                                       seção "Meu Site" acima
  index.js, package.json
```

## Schema de `brokers/{tenantId}`

Igual ao do `control-plane/` antigo, **mais** `onboardingCompleted` (novo, controla se
pula o tour) — e agora é o único doc que existe, não tem mais sync entre "central" e
"o Firestore de cada broker":

```
brokers/{tenantId}                // doc id = slug escolhido no signup
├─ name, email                       ← email = login/conta (setado 1x por
│                                       criarConta.js, NUNCA editável pelo tenant
│                                       nem exposto por perfilPublico). name é
│                                       editável em meu-site.html (identidade)
├─ ownerUid                          ← novo — uid do dono, usado por criarConta.js
│                                       pra ficar idempotente por retry (ver função)
├─ plan: 'trial' | 'starter' | 'pro'
├─ status: 'trialing' | 'active' | 'past_due' | 'canceled'
├─ trialEndsAt, imoveisLimit, domainIncluded
├─ stripeCustomerId, stripeSubscriptionId
├─ usage: { imoveisCount, imoveisUpdatedAt }
├─ customDomainStatus: 'none' | 'requested' | 'configuring' | 'active'
├─ onboardingCompleted: boolean       ← novo — controla se pula o tour
├─ whatsapp: string                   ← novo — meu-site.html, formato "595..." (sem +)
├─ published: boolean                 ← novo — meu-site.html; site/index.html só
│                                        mostra o catálogo se isso for true
├─ logo, accentColor: string                 ← novo — meu-site.html, identidade
│                                              visual (accentColor = hex, um dos 6
│                                              presets, validado no client E na
│                                              regra do Firestore, formato ^#hex$)
├─ headline, subheadline, about, keywords: string
│                                             ← novo — meu-site.html, textos do
│                                              site público, todos opcionais
├─ contactEmail, instagramUrl: string         ← novo — meu-site.html, contato do
│                                              site público (além do whatsapp) —
│                                              contactEmail e não `email` de propósito,
│                                              ver nota acima
├─ createdAt, updatedAt
├─ purchases/{id}                    ← igual ao antigo, sem mudança de schema
└─ imoveis/{id}                      ← NOVO: era top-level no projeto do broker,
    └─ fotos/{id}                       agora aninhado sob o tenant (mesma forma)
```

O CRUD de `imoveis` (criar/editar/desativar/excluir + fotos) já está migrado —
`public/admin.html` + `public/js/admin-imoveis.js`. O catálogo público que os
clientes dos brokers veem também já existe, com Hosting site dedicado por
tenant (`public/site/` + `functions/publicarSite.js`, ver seção "Meu Site"
acima).

## Setup (quando for para produção)

### Firebase (`inmobly-project`, já criado e em Blaze)

1. Authentication → ativar provedor **Google**.
2. Registrar um app Web e colar os valores em `public/js/firebase.js`
   (substituir os `'PREENCHER'`).
3. Editar a allowlist em `firestore.rules` (`isTeam()`) com os e-mails reais da
   equipe Punto Alto.
4. `cd functions && npm install`.
5. Cadastrar os secrets: `firebase functions:secrets:set STRIPE_SECRET_KEY` e
   `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`.
6. Conceder `roles/firebasehosting.admin` à service account padrão do
   compute — necessário pra `publicarSite` poder criar Hosting sites e
   fazer deploy via API. Mesmo padrão dos outros grants já feitos
   (`cloudbuild.builds.builder`, `run.invoker`, `datastore.user`,
   `firebaseauth.admin`). Copiar e rodar o bloco inteiro de uma vez — ele
   mesmo resolve o número do projeto, não precisa substituir nada à mão:
   ```
   PROJECT_NUMBER=$(gcloud projects describe inmobly-project --format="value(projectNumber)")
   gcloud projects add-iam-policy-binding inmobly-project \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/firebasehosting.admin"
   ```
7. Deploy: `firebase deploy` (hosting + firestore rules/indexes + functions).
8. Atualizar `BASE_URL` em `functions/checkout.js` se/quando tiver domínio próprio
   (hoje aponta pro `*.web.app` do projeto).

### Stripe

Mesmos produtos/`lookup_key`/coupon documentados em
`docs/REGRAS-DE-NEGOCIO.md` (seção 7) — não muda com o pivô, o pivô só troca *como*
o checkout é criado, não os produtos vendidos. Webhook endpoint aponta pra
`stripeWebhook` desse projeto, mesmos 4 eventos de antes.

## O que ainda não existe (de propósito)

Já tem lugar reservado na sidebar do app shell (item visível, mas cai em
`em-breve.html` — não é link morto, é honesto sobre o status):

- **Leads** — a aba "Leads" que existia no `template/admin/` antigo não foi
  portada, só o CRUD de imóveis. `brokers/{tenantId}/leads` já existe no
  schema/rules, só não tem UI ainda.
- **Domínio** — segue igual ao que já estava definido em
  `docs/REGRAS-DE-NEGOCIO.md`, seção 6: concierge manual por enquanto.
- **Meu perfil / Configurações** (dropdown do avatar) — edição de dados da
  conta, ainda não construído.

⚠️ **Nada disso foi testado contra infraestrutura real ainda** — só
`node --check` (sintaxe), verificação de IDs cruzados entre HTML/JS, e
balanceamento de tags. A lógica de compressão de fotos e batch-write do CMS
é a mesma do `template/` original (que também nunca rodou nesse app novo),
só os caminhos do Firestore mudaram.
