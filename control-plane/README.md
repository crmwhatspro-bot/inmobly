# PAIm Control Plane

Projeto Firebase **central e único** (não é um por broker) — guarda a fonte da
verdade de plano/billing de todos os clientes do PAIm e roda o painel interno da
Punto Alto (`painel/`). É o único projeto pago (Blaze) de toda a arquitetura, porque
o sync de plano exige Cloud Functions.

Ver [`../docs/REGRAS-DE-NEGOCIO.md`](../docs/REGRAS-DE-NEGOCIO.md) para o contexto de
planos/limites que esse projeto aplica.

⚠️ **Nada aqui foi testado contra infraestrutura real ainda** — o projeto
`paim-control` e os secrets por broker ainda não existem. Este diretório é a
estrutura + primeira versão do código, revisar antes do primeiro deploy.

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
  index.js                ← syncPlanoParaBroker: replica plan/status/limite pro
                             Firestore de cada broker via service account no
                             Secret Manager
```

## Schema de `brokers/{slug}`

```
brokers/{slug}                    // doc id = slug (mesmo do broker.config.json)
├─ name, slug, email              // email = admin.email daquele broker
├─ firebaseProjectId, siteUrl
├─ plan: 'trial' | 'starter' | 'pro'
├─ status: 'trialing' | 'active' | 'past_due' | 'canceled'
├─ trialEndsAt, imoveisLimit, domainIncluded
├─ stripeCustomerId, stripeSubscriptionId   // null até o webhook existir
├─ usage: { imoveisCount, imoveisUpdatedAt }
├─ customDomainStatus: 'none' | 'requested' | 'configuring' | 'active'
└─ createdAt, updatedAt

brokers/{slug}/purchases/{id}     // histórico de produtos avulsos
├─ product: 'emprendimento-page' | 'domain-setup'
├─ status: 'paid' | 'pending' | 'refunded'
└─ amountUsd, stripePaymentIntentId, notes, createdAt
```

## Setup (quando for para produção)

1. Criar o projeto no [Firebase Console](https://console.firebase.google.com) — nome
   sugerido `paim-control` (pode precisar de sufixo, ID de projeto é global).
2. Ativar plano **Blaze** (obrigatório para Cloud Functions).
3. Authentication → ativar provedor **Google**.
4. Registrar um app Web e colar os valores em `painel/js/firebase.js`
   (substituir os `'PREENCHER'`).
5. Editar `TEAM_EMAILS` em `painel/js/painel.js` **e** a função `isTeam()` em
   `firestore.rules` — as duas listas precisam ficar em sincronia manualmente.
6. Deploy: `firebase deploy` (roda hosting + firestore rules/indexes + functions).
7. Por broker existente: gerar a service account key do projeto Firebase daquele
   broker e cadastrar como secret (`broker-sa-<slug>`) — passo a passo comentado no
   topo de `functions/index.js`. Sem isso, o `syncPlanoParaBroker` não sincroniza
   plano pra aquele broker (fica só logado como aviso, não quebra o resto).
8. Criar manualmente o primeiro doc em `brokers/{slug}` para cada cliente existente
   (ainda não tem formulário de onboarding automatizado — é esperado escrever via
   Firebase Console ou um script pontual).

## O que ainda não existe (de propósito)

- **Webhook do Stripe** — não desenhado ainda. `stripeCustomerId`/`stripeSubscriptionId`
  ficam `null` até lá; o painel funciona com dados escritos manualmente.
- **Automação de domínio próprio** — v1 é concierge manual (ver regras de negócio,
  seção 6). A credencial por broker que este projeto já precisa (Secret Manager) é a
  mesma que a automação de domínio reaproveitaria depois.
- **Medição real de leitura/escrita diária do Spark** — o painel mostra só uma
  estimativa de armazenamento por contagem de imóveis, não uso real via Cloud
  Monitoring API (ver `docs/REGRAS-DE-NEGOCIO.md`, decisão de não construir isso
  antes de ter um cliente perto do teto de verdade).
