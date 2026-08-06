# Inmobly Control Plane

Projeto Firebase **central e único** (não é um por broker) — guarda a fonte da
verdade de plano/billing de todos os clientes do Inmobly e roda o painel interno da
Punto Alto (`painel/`). É o único projeto pago (Blaze) de toda a arquitetura, porque
o sync de plano e o billing exigem Cloud Functions.

Ver [`../docs/REGRAS-DE-NEGOCIO.md`](../docs/REGRAS-DE-NEGOCIO.md) para o contexto de
planos/limites/preços que esse projeto aplica.

⚠️ **Nada aqui foi testado contra infraestrutura real ainda** — o projeto
`inmobly-control`, os secrets por broker e os produtos no Stripe ainda não existem.
Este diretório é a estrutura + primeira versão do código, revisar antes do primeiro
deploy.

## Estrutura

```
firestore.rules          ← equipe Punto Alto tem acesso total; cada broker só
                            escreve o subcampo `usage` do próprio doc
firestore.indexes.json   ← índice composto status+trialEndsAt (filtro "trial vencendo")
firebase.json            ← hosting do painel/ + firestore + functions
painel/                  ← painel interno (HTML/CSS/JS puro, mesmo padrão do template/)
  index.html
  css/painel.css
  js/firebase.js         ← init do projeto central (config literal, só existe 1)
  js/painel.js           ← lista brokers, filtros, detalhe com links
functions/
  index.js                ← ponto de entrada único, só re-exporta os 3 abaixo
  admin.js                 ← app default do Firebase Admin, inicializado 1x
  sync.js                   ← syncPlanoParaBroker (central → broker, ver abaixo)
  checkout.js                ← criarCheckoutSession (broker → Stripe)
  webhook.js                  ← stripeWebhook (Stripe → central)
  package.json
```

## Schema de `brokers/{slug}`

```
brokers/{slug}                    // doc id = slug (mesmo do broker.config.json)
├─ name, slug, email              // email = admin.email daquele broker
├─ firebaseProjectId, siteUrl
├─ plan: 'trial' | 'starter' | 'pro'
├─ status: 'trialing' | 'active' | 'past_due' | 'canceled'
├─ trialEndsAt, imoveisLimit, domainIncluded
├─ stripeCustomerId, stripeSubscriptionId   // preenchidos pelo stripeWebhook
├─ usage: { imoveisCount, imoveisUpdatedAt }
├─ customDomainStatus: 'none' | 'requested' | 'configuring' | 'active'
└─ createdAt, updatedAt

brokers/{slug}/purchases/{id}     // histórico de produtos avulsos, id = session.id do Stripe
├─ product: 'emprendimento-page' | 'domain-setup'
├─ status: 'paid' | 'pending' | 'refunded'
└─ amountUsd, stripePaymentIntentId, createdAt
```

## Como o billing funciona (as 3 functions)

```
/admin do broker → criarCheckoutSession → Stripe Checkout (hospedado pela Stripe)
                                                  │
                                     cliente paga │
                                                  ▼
                                          stripeWebhook → escreve brokers/{slug}
                                                  │
                                    doc mudou     │
                                                  ▼
                                       syncPlanoParaBroker → config/plan no
                                                              Firestore DAQUELE broker
```

`criarCheckoutSession` verifica o `idToken` do login do `/admin` do broker contra o
Firebase Auth **daquele projeto específico** (não o central) antes de criar a sessão
— evita que alguém pague um checkout carimbando o slug de outro broker.

`stripeWebhook` trata assinatura (`customer.subscription.created/updated/deleted`) e
compra avulsa (`checkout.session.completed` com `mode: payment`) separadamente —
detalhe de cada mapeamento comentado no topo de `webhook.js`.

## Setup (quando for para produção)

### Firebase

1. Criar o projeto no [Firebase Console](https://console.firebase.google.com) — nome
   sugerido `inmobly-control` (pode precisar de sufixo, ID de projeto é global).
2. Ativar plano **Blaze** (obrigatório para Cloud Functions).
3. Authentication → ativar provedor **Google**.
4. Registrar um app Web e colar os valores em `painel/js/firebase.js`
   (substituir os `'PREENCHER'`).
5. Editar `TEAM_EMAILS` em `painel/js/painel.js` **e** a função `isTeam()` em
   `firestore.rules` — as duas listas precisam ficar em sincronia manualmente.
6. `cd functions && npm install`.
7. Cadastrar os secrets: `firebase functions:secrets:set STRIPE_SECRET_KEY` e
   `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` (valor do passo Stripe
   abaixo).
8. Deploy: `firebase deploy` (roda hosting + firestore rules/indexes + functions).
9. Por broker existente: gerar a service account key do projeto Firebase daquele
   broker e cadastrar como secret (`broker-sa-<slug>`) — passo a passo comentado no
   topo de `functions/sync.js`. Sem isso, o `syncPlanoParaBroker` não sincroniza
   plano pra aquele broker (fica só logado como aviso, não quebra o resto).
10. Criar manualmente o primeiro doc em `brokers/{slug}` para cada cliente existente
    (ainda não tem formulário de onboarding automatizado — é esperado escrever via
    Firebase Console ou um script pontual).

### Stripe

1. Criar os produtos e preços — tabela completa com valores e `lookup_key` de cada
   um em `docs/REGRAS-DE-NEGOCIO.md`. Os `lookup_key` são o que `checkout.js` e
   `webhook.js` usam pra identificar o preço — **cadastrar exatamente com esses
   nomes**, ou o código não reconhece.
2. Criar o coupon `LANCAMENTO50` (`percent_off: 50`, aplicado só na Página de
   Emprendimento) — com `max_redemptions` ou `redeem_by` definido, pra não precisar
   lembrar de desativar manualmente quando o preço de lançamento acabar.
3. Developers → Webhooks → Add endpoint, URL da function `stripeWebhook`
   (`https://<region>-inmobly-control.cloudfunctions.net/stripeWebhook` — confirmar
   URL real após o primeiro deploy), eventos:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copiar a **Signing secret** desse endpoint pro secret `STRIPE_WEBHOOK_SECRET`
   (passo 7 do Firebase acima).
5. Testar em modo test antes de ir pra live — `stripe listen --forward-to
   <url>/stripeWebhook` via Stripe CLI simula eventos localmente.

## O que ainda não existe (de propósito)

- **Botão de upgrade no `/admin` do broker** — `criarCheckoutSession` existe no lado
  do servidor, mas nenhum broker consegue chamá-lo ainda porque o `/admin` (em
  `template/admin/`) não tem UI nem `fetch()` pra isso. É o próximo passo óbvio antes
  de qualquer teste ponta a ponta real.
- **Automação de domínio próprio** — v1 é concierge manual (ver regras de negócio,
  seção 6). A credencial por broker que este projeto já precisa (Secret Manager) é a
  mesma que a automação de domínio reaproveitaria depois.
- **Medição real de leitura/escrita diária do Spark** — o painel mostra só uma
  estimativa de armazenamento por contagem de imóveis, não uso real via Cloud
  Monitoring API (ver `docs/REGRAS-DE-NEGOCIO.md`, decisão de não construir isso
  antes de ter um cliente perto do teto de verdade).
