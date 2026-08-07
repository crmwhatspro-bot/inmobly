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
  planos.html (Plano), em-breve.html (Meu Site / Leads / Domínio / Perfil /
  Configurações — stubs honestos, sem funcionalidade ainda)
```

Um usuário que já tem tenant e já fez o tour pula direto pra `painel.html` —
`js/tenant.js` decide isso lendo o custom claim `tenantId` + `onboardingCompleted`.

### App shell (pós-login)

`painel.html`, `admin.html`, `planos.html` e `em-breve.html` compartilham a
mesma casca — sidebar fixa à esquerda (Dashboard / Meus Imóveis / Meu Site /
Leads / Domínio / Plano, com "Em breve" nos itens sem UI própria ainda) +
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
  de imóveis com barrinha) e o avatar (foto do Google se existir, senão
  iniciais do nome).
- `em-breve.html`/`js/em-breve.js` — placeholder genérico pros itens do
  menu sem UI ainda; `?f=site|leads|dominio|perfil|configuracoes` decide o
  título/texto mostrado.
- **Pendente**: aplicar um product tour (destacando os itens da sidebar)
  depois que essa interface for validada — combinado, ainda não construído.

## Estrutura

```
firestore.rules          ← ver schema abaixo
firestore.indexes.json
firebase.json            ← hosting de public/ + firestore + functions
public/
  login.html, criar-conta.html, tour.html, obrigado.html  ← jornada pré-app
  painel.html, admin.html, planos.html, em-breve.html     ← dentro do app shell
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
  index.js, package.json
```

## Schema de `brokers/{tenantId}`

Igual ao do `control-plane/` antigo, **mais** `onboardingCompleted` (novo, controla se
pula o tour) — e agora é o único doc que existe, não tem mais sync entre "central" e
"o Firestore de cada broker":

```
brokers/{tenantId}                // doc id = slug escolhido no signup
├─ name, email
├─ ownerUid                          ← novo — uid do dono, usado por criarConta.js
│                                       pra ficar idempotente por retry (ver função)
├─ plan: 'trial' | 'starter' | 'pro'
├─ status: 'trialing' | 'active' | 'past_due' | 'canceled'
├─ trialEndsAt, imoveisLimit, domainIncluded
├─ stripeCustomerId, stripeSubscriptionId
├─ usage: { imoveisCount, imoveisUpdatedAt }
├─ customDomainStatus: 'none' | 'requested' | 'configuring' | 'active'
├─ onboardingCompleted: boolean       ← novo — controla se pula o tour
├─ createdAt, updatedAt
├─ purchases/{id}                    ← igual ao antigo, sem mudança de schema
└─ imoveis/{id}                      ← NOVO: era top-level no projeto do broker,
    └─ fotos/{id}                       agora aninhado sob o tenant (mesma forma)
```

O CRUD de `imoveis` (criar/editar/desativar/excluir + fotos) já está migrado —
`public/admin.html` + `public/js/admin-imoveis.js`. O que ainda usa o modelo antigo
(projeto isolado) é só o **catálogo público** que os clientes dos brokers veem
(`template/imoveis.html`/`template/index.html`) — ver pendências abaixo.

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
6. Deploy: `firebase deploy` (hosting + firestore rules/indexes + functions).
7. Atualizar `BASE_URL` em `functions/checkout.js` se/quando tiver domínio próprio
   (hoje aponta pro `*.web.app` do projeto).

### Stripe

Mesmos produtos/`lookup_key`/coupon documentados em
`docs/REGRAS-DE-NEGOCIO.md` (seção 7) — não muda com o pivô, o pivô só troca *como*
o checkout é criado, não os produtos vendidos. Webhook endpoint aponta pra
`stripeWebhook` desse projeto, mesmos 4 eventos de antes.

## O que ainda não existe (de propósito)

Já tem lugar reservado na sidebar do app shell (item visível, mas cai em
`em-breve.html` — não é link morto, é honesto sobre o status):

- **Meu Site** — pré-visualização + configuração (whatsapp, publicar) do
  catálogo público que o cliente final do broker vê. Design já fechado
  (ver conversa que precedeu este commit): resolve o tenant por
  `location.hostname` (um Hosting site por tenant, criado via botão
  "Publicar site" — também não construído ainda) com fallback `?t=slug`
  pra teste, function `perfilPublico` pra não expor `brokers/{tenantId}`
  inteiro publicamente. Ainda não implementado.
- **Leads** — a aba "Leads" que existia no `template/admin/` antigo não foi
  portada, só o CRUD de imóveis. `brokers/{tenantId}/leads` já existe no
  schema/rules, só não tem UI ainda.
- **Domínio** — segue igual ao que já estava definido em
  `docs/REGRAS-DE-NEGOCIO.md`, seção 6: concierge manual por enquanto.
- **Meu perfil / Configurações** (dropdown do avatar) — edição de dados da
  conta, ainda não construído.

⚠️ **`admin.html`/`admin-imoveis.js` também não foram testados contra infraestrutura
real ainda** — só `node --check` (sintaxe), verificação de IDs cruzados entre
HTML/JS, e balanceamento de tags. A lógica de compressão de fotos e batch-write é a
mesma do `template/` original (que também nunca rodou nesse app novo), só os
caminhos do Firestore mudaram.
