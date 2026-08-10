# Sitemob — Regras de Negócio

Documento vivo. Registra as decisões de modelo de negócio que influenciam o build do
Sitemob (produto da Punto Alto) — planos, limites, billing e produtos avulsos.
Qualquer mudança aqui deve ser revisada contra o schema do Firestore e as regras de
segurança antes de virar código.

> ⚠️ **Pivô de arquitetura**: a seção 1 (custo por broker) foi calculada pro modelo
> antigo — **um projeto Firebase isolado por corretor no plano Spark gratuito**.
> Com o pivô pra SaaS multi-tenant (ver [`../app/README.md`](../app/README.md)), a
> premissa de custo ~$0 por broker **não vale mais como estava**: agora é um projeto
> único em Blaze, com todos os tenants dividindo a mesma cota de Firestore — o
> "noisy neighbor" (um broker com catálogo grande consumindo a cota de todos) é um
> risco novo que não existia antes. **Números de planos/preços nas seções 4 e 7
> continuam valendo como referência**; o cálculo de margem que os validou precisa
> ser refeito.

---

## 1. Custo por broker (infraestrutura)

- **Um projeto Firebase por broker**, plano **Spark (gratuito)**: 50 mil leituras / 20 mil
  escritas / 20 mil exclusões por dia, 1GiB de armazenamento no Firestore, 10GB de
  hosting com 360MB/dia de transferência grátis. Dentro desses limites, custo marginal
  de infraestrutura por broker é **~$0**.
- Fotos são salvas como data-URL dentro dos próprios documentos do Firestore (sem
  Firebase Storage) — desde fev/2026 o Storage foi removido do plano Spark, então essa
  decisão do template original deixou de ser opcional e precisa continuar assim.
- Billing (webhook do Stripe) exige Cloud Functions → precisa de **um único projeto
  central em plano Blaze** (não um por broker). A cota grátis do Blaze para Functions
  (2 milhões de invocações/mês) cobre o volume de webhooks de assinatura com folga.
- **Custo variável real por cliente pagante** = taxa do Stripe (~2,9% + $0,30 por
  cobrança em USD, mais alto em cartão internacional). Isso é o que deveria entrar no
  cálculo de margem, não a infraestrutura.

## 2. Trial gratuito

- **14 dias, sem cartão de crédito.** Fricção mínima para começar; conversão em
  assinatura é uma ação explícita do corretor, não uma cobrança automática de cartão
  esquecido.
- **Limite de 6 imóveis.** O grid do catálogo (`imoveis.css`) é 1 coluna no mobile,
  2 no tablet, 3 no desktop — 6 fecha as duas larguras sem card órfão numa linha
  incompleta (3 não fecha o breakpoint de 2 colunas). Também é convincente o
  suficiente como demonstração sem parecer um catálogo vazio.
- **0 emprendimentos** no trial — a geração de página de emprendimento é sempre um
  produto avulso (ver seção 4), independente do plano.

## 3. Moeda e gateway de pagamento

- **Só USD, via Stripe.** Verificado antes de assumir o contrário: Paraguai não é
  país suportado para abertura de conta Stripe, e o Guarani (PYG) não aparece nem na
  lista de moedas com valor mínimo de cobrança do Stripe. Cobrar nativamente em
  Guaranies via Stripe não é viável sem uma segunda integração (gateway local) ou um
  Merchant of Record — decisão consciente de não fazer isso agora para manter uma
  única integração de billing.
- Preço em Gs. pode aparecer como **referência informativa** na página de vendas, mas
  a cobrança real é sempre em USD.

## 4. Planos — diferenciam só em volume de imóveis e domínio

Nenhuma função do CMS fica trancada por plano. Todo plano pago tem acesso a 100% das
funcionalidades do sistema — a única diferença é quantidade de imóveis e domínio.
Isso simplifica a regra do Firestore para uma contagem simples, não uma matriz de
feature-flags por plano.

| Plano | Imóveis | Domínio | Preço indicativo |
|---|---|---|---|
| **Trial** | até 6 | `*.web.app` | grátis, 14 dias |
| **Starter** | até 40 | `*.web.app` | ~USD 79/mês |
| **Pro** | ilimitado | próprio, incluído | ~USD 129/mês |

Comportamento em downgrade, `past_due`/`unpaid` (pagamento falhou) ou expiração de
trial sem conversão: **os imóveis excedentes ficam ocultos do catálogo público, mas
preservados e visíveis (sinalizados) no admin** — nada é apagado, e o campo `ativo`
que o corretor controla manualmente não é tocado pelo sistema. Voltar a assinar (ou
regularizar o pagamento) reativa tudo na hora. Evita perda de dados e mantém
incentivo claro para reativar, em vez de bloquear o site inteiro.

**`unpaid` é tratado igual a `past_due`** — ambos reduzem o limite efetivo pro nível
do trial (6 imóveis) até a assinatura ser regularizada. Implementado em
`template/js/plano.js` (`limiteEfetivo()`), consumido por `imoveis.js` (corta o
catálogo público) e `admin-imoveis.js` (sinaliza os imóveis acima do limite com um
banner + badge, e bloqueia criar novos enquanto estiver acima). Edição/exclusão dos
imóveis já existentes continua liberada mesmo em `past_due` — bloquear isso também
faria o corretor não conseguir nem corrigir a própria situação.

## 5. Produtos avulsos — exclusivos pra assinante ativo

Recurso avulso ≠ recurso de plano. Qualquer coisa do sistema que não seja "quantos
imóveis" ou "domínio" entra aqui, não numa tier de assinatura — mantém a estrutura de
planos simples e permite adicionar novos produtos depois sem reabrir a tabela de
planos.

**Exige `status: 'active'`** — corretor no trial, com pagamento em atraso
(`past_due`/`unpaid`) ou cancelado não pode comprar avulso, só quem já é assinante
pago de verdade. Checado em `criarCheckoutSession` (`functions/checkout.js`), a única
barreira que importa; o frontend (`paginas.js`) só evita o clique morto escondendo
o botão de compra atrás de "Assine um plano pra comprar" antes disso.

| Produto | Cobrança | Preço | Por quê |
|---|---|---|---|
| **Página de Emprendimento** (estilo Nobile Inn) | Única | **USD 200** (preço de lançamento, 50% off) · preço de tabela USD 400 | Projeto de landing page sob medida (copy própria em 3 idiomas, narrativa de investimento, tipologias, galeria) — trabalho real de design/copy, não uma feature que se liga. Preço de lançamento enquanto o Sitemob ainda tem zero assinantes — objetivo é validar demanda do produto, não maximizar ticket. Subir de volta pra USD 400 (ou próximo disso) depois de ter tração, removendo o desconto em vez de recriar o Price no Stripe. |
| **Configuração de domínio próprio** | Única | USD 39 | Trabalho pontual (registros DNS + cadastro no Firebase Hosting); SSL renova sozinho depois, não sobra tarefa recorrente. Cobrar recorrente por algo sem custo recorrente corroeria a confiança do cliente sem motivo. |

> Nota de implementação: no Stripe, o Price da Página de Emprendimento deve ser
> criado no valor de tabela (USD 400) e o desconto de lançamento aplicado via
> **Coupon/Promotion Code de 50%**, não como um Price separado de USD 200. Preços no
> Stripe são imutáveis — se o valor "real" mudar direto no Price, perde-se
> continuidade de relatório e fica mais difícil remover o desconto depois sem
> recriar objetos. Ver lista de produtos Stripe.

### Por que "Página de Emprendimento" não vira recorrente

Preço/tipologias/disponibilidade da página bespoke continuam puxando do documento do
imóvel no Firestore (mesmo sendo uma página com narrativa/design sob medida) — só a
parte de copy e layout é feita à mão. Assim, quando o corretor muda um preço ou marca
uma unidade como vendida, atualiza sozinho pelo `/admin`, sem precisar reabrir o
projeto. Isso é o que mantém a cobrança única honesta: se toda mudança de preço
exigisse trabalho de novo, seria recorrente disfarçado de único, corroendo a margem
sem ninguém perceber.

Revisão de conteúdo/design *além* de dado (trocar a narrativa inteira, redesenhar
seção) fica fora do escopo do valor único — vira um novo projeto cotado à parte, não
uma manutenção recorrente incluída.

## 6. Domínio próprio — quem executa

Tecnicamente é nativo do Firebase Hosting (mesmo no plano Spark): cadastra o domínio,
o Firebase devolve registros DNS, e emite SSL grátis sozinho quando o DNS propaga.

- **V1: manual/concierge.** Quando o corretor contrata, alguém da Punto Alto cadastra
  o domínio no Console do projeto Firebase daquele broker — é um passo de onboarding
  pago, não uma feature de software. Reaproveita o processo que já existe no
  `SETUP.md`, zero engenharia nova.
- **Futuro (não construir agora): self-serve automatizado** via Firebase Hosting
  Domains API (`projects.sites.domains`), chamado pelo mesmo projeto central de
  billing que vai precisar de credencial de admin por broker para sincronizar plano —
  reaproveitaria essa mesma credencial, sem criar um mecanismo de acesso novo. Só vale
  a pena construir quando o volume de upgrades justificar.

## 7. Produtos no Stripe

Cadastrar exatamente com esses `lookup_key` — é o que `control-plane/functions/checkout.js`
e `webhook.js` usam pra identificar cada preço, não o ID opaco (que muda entre modo
test e live).

| Produto | Tipo | Preço | `lookup_key` |
|---|---|---|---|
| Sitemob Starter | Recorrente, mensal | USD 79,00 | `sitemob_starter_monthly` |
| Sitemob Pro | Recorrente, mensal | USD 129,00 | `sitemob_pro_monthly` |
| Página de Emprendimento | Única | USD 400,00 (valor de tabela) | `sitemob_emprendimento_page` |
| Configuração de Domínio Próprio | Única | USD 39,00 | `sitemob_domain_setup` |

Coupon `LANCAMENTO50` (`percent_off: 50`) aplicado automaticamente pelo `checkout.js`
só em `sitemob_emprendimento_page`, enquanto dura o preço de lançamento (ver seção 5).
Trial não tem produto no Stripe — nunca toca o Stripe, é autogerenciado sem cartão.

## 8. Indique e ganhe

Programa de indicação entre corretores — quem já é cliente indica outro corretor; se o
indicado converter (virar assinante pago de verdade, não só trial), quem indicou ganha
um cupom.

- **Link de indicação**: `https://painel.sitemob.app/criar-conta.html?ref=<slug-de-quem-indicou>`
  — reaproveita o slug já existente do broker, sem gerar um código novo separado.
  Página própria no painel: `indicacoes.html` (item "Indique e ganhe" na sidebar).
- **Gatilho da recompensa**: a primeira vez que o broker indicado (`referredBy`) tem
  a assinatura marcada `active` no `stripeWebhook` (`processarSubscription` em
  `functions/webhook.js`) — nunca em renovação mensal, nem em produto avulso comprado
  durante o trial. Idempotente via `referralRewarded` no doc do indicado.
- **Recompensa**: cupom de **10% off, uma fatura** (`percent_off: 10`,
  `duration: once`) — um Promotion Code novo por indicação premiada
  (`INDICA-<slug>-<n>`), até **5 códigos por indicador**. Sem data de validade
  (`expires_at` nunca setado); cada código vale 1 uso. Um código novo por indicação
  (em vez de ir aumentando o limite de um código só) porque a API do Stripe não
  permite alterar `max_redemptions` depois que o Promotion Code já foi criado.
- **Resgate**: duas formas, ambas manuais (nunca automático a partir do webhook — ver
  "Por que não empilhar" abaixo).
  1. O campo de código promocional do próprio Stripe Checkout (`allow_promotion_codes`,
     já ligado por padrão em `checkout.js` quando não há cupom automático) — o
     indicador digita o código em qualquer checkout futuro (assinar, trocar de plano,
     reassinar).
  2. Botão "Aplicar cupom na próxima fatura" em `indicacoes.html`, que chama
     `aplicarCupomIndicacao` (`functions/indicacoes.js`) — aplica o cupom direto na
     assinatura ATIVA do indicador via API do Stripe
     (`subscriptions.update(..., discounts: [...])`), sem precisar de um novo
     Checkout. Ação sob demanda (o corretor clica), nunca automática — evita o risco
     de concorrência que aplicar a cada indicação convertida teria. Como o coupon é
     `duration: once`, desconta a PRÓXIMA fatura a ser gerada, não retroage sobre uma
     fatura do ciclo atual que já foi paga (por isso o texto do botão fala em "próxima
     fatura", não "mensalidade atual"). Recusa se a assinatura já tem outro desconto
     ativo, pra não ter que lidar com o caso de mesclar dois discounts.
- **Por que não empilhar automaticamente até 50% numa fatura só**: avaliado e
  descartado por ora. Coupon é imutável no Stripe (só `name` é editável depois de
  criado, `percent_off` não), então "ir aumentando um cupom só" exigiria apagar e
  recriar a cada indicação. E aplicar automaticamente a cada evento do webhook
  (em vez de sob clique do corretor) teria risco real de corrida entre duas
  indicações convertendo perto uma da outra. Ver discussão completa no histórico do
  projeto — pode ser revisitado se a demanda justificar a complexidade.
- **Reembolso/chargeback do indicado**: perda aceitável — o cupom já concedido ao
  indicador não é revogado. Decisão consciente de manter simples, sem lógica de
  estorno de recompensa.

## 9. Cancelamento e gestão da assinatura

Self-service, na página Plano (`planos.html`, functions em `functions/assinatura.js`).

- **Cancelamento é sempre agendado pro fim do período pago** (`cancel_at_period_end`),
  nunca imediato. O mês já foi cobrado; derrubar o catálogo no meio dele criaria uma
  conversa de reembolso sem necessidade. Consequência técnica: o Stripe manda
  `customer.subscription.updated` com `status` ainda `active` — quem marca `canceled`
  é o `subscription.deleted` na virada do período. Por isso o doc tem
  `cancelAtPeriodEnd` e `currentPeriodEnd` separados do `status`.
- **Reativação até a virada** — enquanto o período não terminou, um clique desfaz
  (`cancel_at_period_end: false`). Depois disso é assinatura nova.
- **Pesquisa de motivo antes de confirmar**, em dois passos: primeiro o motivo, só
  então a tela de confirmação. Depois de confirmar ninguém responde pesquisa, e esse é
  o único momento em que dá pra saber por que o corretor está saindo. Usa o enum do
  próprio Stripe (`cancellation_details.feedback`: `too_expensive`, `missing_features`,
  `switched_service`, `unused`, `customer_service`, `low_quality`, `too_complex`,
  `other`) em vez de uma lista nossa, pra o motivo entrar também no relatório de churn
  do Stripe. Fica gravado no doc do broker (`cancellationFeedback`,
  `cancellationComment`, `cancellationRequestedAt`).
- **Retenção**: hoje só o degrau Pro → Starter, oferecido quando o motivo é
  `too_expensive` e o plano é Pro — reaproveita a troca de plano que
  `criarCheckoutSession` já faz. Oferta de desconto na saída ainda **não** está
  definida: aplicar o `50OFF` a quem ameaça cancelar é decisão de negócio em aberto
  (ver Pendências).
- **Portal do Stripe** (`criarPortalSession`) pra trocar cartão, ver e baixar faturas.
  Não é conveniência: a carência de inadimplência da seção 4 pressupõe que o corretor
  consiga corrigir o cartão durante as tentativas de recobrança, e sem o portal a
  única saída dele seria cancelar e assinar de novo. Exige uma configuração salva em
  Settings → Billing → Customer portal, **por modo** (test e live são separadas).

---

## Pendências em aberto (não bloqueiam o build atual)

- [ ] Definir exatamente o texto/UX do aviso quando o corretor atinge o limite de
      imóveis do plano (bloqueia criação? mostra banner de upgrade?).
- [x] ~~Definir o schema exato do documento central de billing (`brokers/{slug}`) e como
      ele replica `config/plan` para o Firestore de cada broker~~ — resolvido em
      `control-plane/` (projeto Firebase novo e dedicado `inmobly-control`, schema e
      Cloud Function de sync documentados em `control-plane/README.md`).
- [ ] Politica de reembolso / cancelamento de "Página de Emprendimento" já paga mas
      não entregue.
- [ ] Oferta de retenção na saída: aplicar o `50OFF` (ou um cupom mais curto) pra quem
      cancela por `too_expensive`? Hoje o fluxo só oferece o degrau Pro → Starter. Dar
      50% vitalício a quem ameaça sair cria um incentivo ruim — mas perder o cliente
      inteiro é pior. Decidir antes de o volume de cancelamentos crescer.
- [x] ~~Webhook do Stripe em si~~ — resolvido: `control-plane/functions/checkout.js`
      (`criarCheckoutSession`) e `webhook.js` (`stripeWebhook`) escritos e revisados.
- [ ] Botão/UI de upgrade no `/admin` de cada broker que efetivamente chama
      `criarCheckoutSession` — sem isso, o webhook não tem como ser exercitado de
      ponta a ponta, mesmo já existindo.
- [ ] Criar de fato o projeto `inmobly-control` no Firebase, os produtos no Stripe
      (seção 7) e testar as 3 Cloud Functions contra infraestrutura real — o que
      existe hoje foi escrito, revisado (`node --check` + `require()` bem-sucedido de
      cada módulo) e tem os `require`s confirmados, mas nunca rodou contra Firestore/
      Stripe reais.
