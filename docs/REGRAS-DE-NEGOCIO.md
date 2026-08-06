# Inmobly — Regras de Negócio

Documento vivo. Registra as decisões de modelo de negócio que influenciam o build do
Inmobly (produto da Punto Alto) — planos, limites, billing e produtos avulsos.
Qualquer mudança aqui deve ser revisada contra o schema do Firestore e as regras de
segurança antes de virar código.

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

## 5. Produtos avulsos — disponíveis para qualquer plano, inclusive Trial

Recurso avulso ≠ recurso de plano. Qualquer coisa do sistema que não seja "quantos
imóveis" ou "domínio" entra aqui, não numa tier de assinatura — mantém a estrutura de
planos simples e permite adicionar novos produtos depois sem reabrir a tabela de
planos.

| Produto | Cobrança | Preço | Por quê |
|---|---|---|---|
| **Página de Emprendimento** (estilo Nobile Inn) | Única | **USD 200** (preço de lançamento, 50% off) · preço de tabela USD 400 | Projeto de landing page sob medida (copy própria em 3 idiomas, narrativa de investimento, tipologias, galeria) — trabalho real de design/copy, não uma feature que se liga. Preço de lançamento enquanto o Inmobly ainda tem zero assinantes — objetivo é validar demanda do produto, não maximizar ticket. Subir de volta pra USD 400 (ou próximo disso) depois de ter tração, removendo o desconto em vez de recriar o Price no Stripe. |
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
- [ ] Webhook do Stripe em si (o que escreve `plan`/`status`/`stripeSubscriptionId`
      em `brokers/{slug}` quando uma assinatura muda) — o control-plane já tem o lado
      de *sync pra fora* (central → broker) pronto, falta o lado que recebe o evento
      do Stripe e decide o que escrever.
- [ ] Criar de fato o projeto `inmobly-control` no Firebase e testar o
      `syncPlanoParaBroker` contra infraestrutura real — o que existe hoje foi
      desenhado e revisado, não executado.
