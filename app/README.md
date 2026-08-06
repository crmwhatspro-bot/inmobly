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
  painel.html          → status atual (STUB — CMS completo ainda não migrado)
```

Um usuário que já tem tenant e já fez o tour pula direto pra `painel.html` —
`js/tenant.js` decide isso lendo o custom claim `tenantId` + `onboardingCompleted`.

## Estrutura

```
firestore.rules          ← ver schema abaixo
firestore.indexes.json
firebase.json            ← hosting de public/ + firestore + functions
public/
  login.html, criar-conta.html, tour.html, planos.html, obrigado.html, painel.html
  css/app.css             ← visual próprio do Inmobly (não é o tema por broker)
  js/firebase.js          ← init do projeto único (config literal, PREENCHER)
  js/tenant.js            ← lê custom claim tenantId + decide a próxima página
  js/<pagina>.js           ← um arquivo por página, mesmo padrão do template/ antigo
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

**`template/js/plano.js`, `imoveis.js`, `admin-imoveis.js` ainda não foram migrados**
pra ler `brokers/{tenantId}/imoveis` em vez de `imoveis` top-level de um projeto
isolado. Isso é o que falta pra `painel.html` deixar de ser um stub — é o próximo
passo depois deste.

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

- **CMS multi-tenant** — `template/admin/` + `template/js/admin-imoveis.js` e
  `imoveis.js` ainda operam no modelo antigo (projeto isolado, sem `tenantId`).
  `painel.html` é um placeholder de status até essa migração acontecer.
- **Site público por tenant** (a página que o cliente final vê, com o catálogo) —
  mesma pendência do item acima: precisa decidir entre gerar estático por tenant
  (automatizando o antigo `build.js` + deploy) ou virar um app único que resolve o
  tenant em tempo de execução. Ainda não decidido de propósito (ver conversa que
  precedeu esse commit).
- **Domínio próprio automatizado** — segue igual ao que já estava definido em
  `docs/REGRAS-DE-NEGOCIO.md`, seção 6: concierge manual por enquanto.
