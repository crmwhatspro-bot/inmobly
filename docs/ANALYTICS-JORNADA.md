# Analytics da jornada — GTM + GA4

**Container:** `GTM-MX2GH99M` · **Status:** tag instalada e sinal de
usuário implementado (seções 1 e 4). **Configuração no painel do
GTM/GA4 ainda NÃO foi feita** — seções 2, 3 e 5 são o passo a passo
pendente. Os eventos de conversão da seção 6 também não existem ainda.

Este documento é o manual de operação do analytics de marketing/produto.
Não confundir com o **painel interno de KPIs**
(`docs/PLANO-PAINEL-KPIS.md`), que é outro sistema de medição, próprio,
e continua sendo a fonte de verdade do funil de negócio — ver seção 1.3.

---

## 1. Contexto que determina a configuração

Quatro fatos do nosso setup que mudam o que você clica no GA4. Ler antes
de configurar, senão o resultado fica errado de um jeito silencioso.

### 1.1 Dois domínios, mesma raiz

| Onde | O quê | Servido por |
|---|---|---|
| `sitemob.app` (apex) | landing institucional | `functions/servirSite.js` → `functions/landing/index.html` |
| `painel.sitemob.app` | app logado + login/cadastro/checkout | Firebase Hosting (`app/public/`) |
| `<tenant>.sitemob.app` | catálogo público do corretor | `functions/servirSite.js` → `functions/site-assets/` |

Landing e painel são subdomínios da **mesma raiz**, então o cookie do
GA4 (`cookie_domain: auto`) é compartilhado e a sessão atravessa de um
pro outro sem configuração de cross-domain nem linker. Não crie
"lista de domínios" achando que precisa.

### 1.2 O catálogo do corretor está fora, de propósito

`GTM-MX2GH99M` **não** é injetado em `public/site/` nem em
`functions/site-assets/`. Aquelas páginas carregam o container **do
próprio corretor**, configurado por ele em Meu Site e injetado em
runtime (`public/site/js/imoveis.js`, constante `GTM_ID_REGEX`).

O motivo não é conflito técnico — o GTM aceita vários containers na
mesma página, todos compartilhando `window.dataLayer`. O motivo é que
quem visita o catálogo é lead **do corretor**, procurando imóvel, e não
alguém avaliando o Sitemob. Somar isso ao nosso funil afogaria o sinal
de aquisição sob o tráfego de todos os tenants juntos.

Se um dia quisermos medir o catálogo publicado, o caminho é um **segundo
container nosso** injetado pelo `servirSite.js` — nunca o
`GTM-MX2GH99M`.

`interno-metricas.html` também ficou de fora: é ferramenta da equipe, e
sessão de time interno vira usuário falso no relatório.

### 1.3 O GA4 não substitui o `analytics_visits`

Já existe medição própria: o beacon `logVisita`
(`functions/analytics.js`) grava em `analytics_visits/`, e é isso que o
painel interno lê. Os dois sistemas continuam rodando lado a lado e
**os números não vão bater** — adblock derruba o GTM e não derruba o
beacon, que é um `fetch` pro nosso próprio domínio.

Divisão de trabalho:

- **`analytics_visits` + painel interno** → funil de negócio (visita
  virou conta? conta virou assinante?), porque cruza com `brokers/` na
  mesma query, sem export pro BigQuery.
- **GA4** → comportamento (de onde vem, o que clica, onde abandona) e
  as integrações de mídia paga.

### 1.4 A área logada é uma SPA

`shell.js:469` navega com `history.pushState` e só troca o `<main>` — o
HTML das outras páginas vem por `fetch` e **o snippet do GTM dentro dele
nunca roda de novo**. Painel → Meus Imóveis → Domínio é *um*
carregamento de GTM.

Sem o passo 3.4, o GA4 registra só a primeira tela de cada sessão e
todo o resto do uso do produto some.

---

## 2. Passo a passo — GTM

### 2.1 Variável integrada

Variáveis → *Configurar* (bloco "Variáveis integradas") → marcar
**Page Hostname**.

### 2.2 `Lookup - app_area`

Variáveis → Nova → **Tabela de pesquisa**. Entrada: `{{Page Hostname}}`.

| Entrada | Saída |
|---|---|
| `sitemob.app` | `marketing` |
| `www.sitemob.app` | `marketing` |
| `painel.sitemob.app` | `app` |

Valor padrão: `marketing`.

### 2.3 `DLV - traffic_type`

Variáveis → Nova → **Variável de camada de dados** · Nome da variável:
`traffic_type`.

### 2.4 `DLV - user_id`

Variáveis → Nova → **Variável de camada de dados** · Nome da variável:
`user_id`.

### 2.5 `ES - Sitemob padrão`

Variáveis → Nova → **Configurações de eventos do Google tag**.
Parâmetros:

| Parâmetro | Valor |
|---|---|
| `app_area` | `{{Lookup - app_area}}` |
| `traffic_type` | `{{DLV - traffic_type}}` |
| `user_id` | `{{DLV - user_id}}` |

### 2.6 Amarrar na tag

Na tag do Google (GA4), em **Configurações de eventos compartilhadas**,
selecionar `ES - Sitemob padrão`. Repetir em **toda** tag de evento GA4
criada depois (seção 6) — é isso que faz os três parâmetros viajarem em
todos os hits, não só no primeiro.

Publicar o container.

---

## 3. Passo a passo — GA4

### 3.1 Isolar o tráfego interno (regra por IP)

Administrador → *Coleta e modificação de dados* → **Fluxos de dados** →
stream web → **Configurar definições da tag** → *Mostrar tudo* →
**Definir tráfego interno** → Criar:

- Nome: `Equipe Punto Alto`
- `traffic_type` = `internal`
- Correspondência de IP: IPs de casa/escritório

Pega desde o primeiro hit, inclusive na landing — mas só por IP. Cai no
4G e você reaparece nos relatórios. A segunda camada (seção 4) cobre o
resto.

### 3.2 Ativar o filtro

Administrador → *Coleta e modificação de dados* → **Filtros de dados**.
Já existe um filtro `Internal Traffic` em estado **Teste**. Abrir →
Estado do filtro → **Ativo**.

> **Três avisos que custam dinheiro:**
> 1. Filtro **não é retroativo** — dado sujo que já entrou fica sujo.
> 2. Em **Ativo** o hit é descartado na entrada, sem recuperação.
> 3. Deixe em **Teste** por um dia e confira na Análise exploratória
>    com a dimensão **Nome do filtro de dados de teste** se está pegando
>    só você, antes de ativar.

### 3.3 Registrar as dimensões personalizadas

Administrador → **Definições personalizadas** → Criar. Parâmetro custom
que não é registrado o GA4 recebe e ignora.

| Nome | Escopo | Parâmetro |
|---|---|---|
| `Área do app` | Evento | `app_area` |
| `Plano` | Usuário | `plano` *(opcional, ver seção 7)* |

Também não é retroativo: vale do registro pra frente.

### 3.4 Ligar o pageview das rotas SPA

Administrador → Fluxos de dados → stream → **Medição avançada**
(engrenagem) → em **Visualizações de página**, *Mostrar configurações
avançadas* → ligar **Alterações de página com base em eventos do
histórico do navegador**.

Isso transforma o `pushState` de `shell.js:469` em `page_view`. Detalhe
que joga a favor: o router faz `document.title = doc.title` (`shell.js:467`)
**antes** do `pushState`, então o título capturado é o da página nova.
Não precisa mexer no código.

### 3.5 Separar aquisição de produto nos relatórios

Não crie uma segunda propriedade pro painel — isso quebraria a
continuidade landing → conta, que é exatamente a métrica que importa.

Use **Comparações**, no topo de qualquer relatório padrão:

- `Área do app` exatamente `marketing` → funil de aquisição
- `Área do app` exatamente `app` → uso do produto

Sem isso, o corretor que abre o painel 40 vezes por mês domina o número
de sessões e a conversão da landing parece péssima.

---

## 4. O sinal de usuário (implementado)

`marcarSinalAnalytics()` em `shell.js` grava
`localStorage['sitemob_ga']` com `traffic_type` (`internal` /
`external`, via `ehDaEquipe()` de `js/equipe.js`) e `user_id`.

Todas as 12 páginas de `app/public/` leem essa chave num bloco síncrono
no `<head>`, **antes** do snippet do GTM, e empurram os valores pro
`dataLayer`.

Por que o rodeio: o GTM dispara o `page_view` no `<head>`, muito antes
do Firebase Auth resolver — naquele instante não dá pra saber quem
abriu. O veredito é gravado numa visita e aplicado a partir da seguinte.

**Limitações conhecidas, por desenho:**

- O **primeiro** pageview de um navegador novo escapa da classificação.
  É o que a regra de IP da seção 3.1 cobre.
- A landing não enxerga a chave: `localStorage` é por origem, e ela mora
  em `sitemob.app`. Lá só vale o IP.
- `user_id` é o **tenantId**, nunca o e-mail. Mandar dado que identifica
  a pessoa direto viola a política do Google e a LGPD, e derruba a
  propriedade se o Google perceber.

---

## 5. Validação

Ordem que pega os erros mais rápido:

1. **Modo de visualização do GTM** em `painel.sitemob.app`: confirmar
   que a tag do Google dispara e que `{{Lookup - app_area}}` = `app`.
2. Repetir na landing: `app_area` = `marketing`.
3. **DebugView do GA4**, navegando painel → meu-site → indicações:
   têm que aparecer **3** `page_view` com `page_location` diferentes. Se
   aparecer 1, o passo 3.4 não foi feito.
4. Logar com `crmwhatspro@gmail.com`, recarregar (a segunda carga é que
   conta) e conferir `traffic_type: internal` no evento.
5. Logar com uma conta de teste comum e conferir `traffic_type: external`
   — o flag tem que ser sobrescrito, não grudar no navegador.
6. Conferir que `user_id` chega e **não** é e-mail.

---

## 6. Eventos da jornada — o que falta implementar

Só `page_view` está coberto hoje. Cada linha abaixo precisa de um
`dataLayer.push` no código e de uma tag de evento GA4 no container
(usando `ES - Sitemob padrão`, seção 2.6).

| Etapa | Evento GA4 | Onde disparar |
|---|---|---|
| Clique no CTA da landing | `cta_landing` | `functions/landing/index.html`, âncoras pra `painel.sitemob.app` |
| Cadastro concluído | `sign_up` | `criar-conta.js:76`, depois do `await criarConta(...)` |
| Login | `login` | `login.js`, no sucesso do auth |
| Tour concluído | `tour_concluido` | `product-tour.js`, no passo final |
| Primeiro imóvel cadastrado | `imovel_criado` | `admin-imoveis.js`, no salvar |
| Site publicado | `site_publicado` | `meu-site.js:403`, depois de `publicarSiteFn()` |
| Domínio conectado | `dominio_conectado` | `dominio.js`, no sucesso da verificação DNS |
| Checkout aberto | `begin_checkout` | `planos.js:46`, antes do redirect pro Stripe |
| Assinatura paga | `purchase` | ver ressalva abaixo |

**Formato do push** (o nome vai em `event`, o resto vira parâmetro):

```js
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ event: 'sign_up', metodo: 'google' });
```

No GTM, cada um vira um acionador **Evento personalizado** com o nome
exato + uma tag de evento GA4.

### Ressalva do `purchase`

Quem confirma pagamento é o `stripeWebhook`, assíncrono — `obrigado.html`
é só a tela de retorno e **não escreve nada** (ver cabeçalho de
`obrigado.js`). Disparar `purchase` ali no client tem dois furos: F5 na
página conta a venda de novo, e quem fecha o navegador antes do redirect
não conta nunca.

Duas saídas, em ordem de preferência:

1. **Measurement Protocol a partir do `stripeWebhook`** — conta a venda
   real, uma vez, sem depender do navegador. Precisa do
   `client_id` do GA4, que teria que ser capturado no `begin_checkout` e
   guardado em `brokers/{tenantId}`.
2. **Client-side com dedupe** — mais barato. Exige incluir
   `{CHECKOUT_SESSION_ID}` no `success_url` (`functions/checkout.js:131`,
   hoje ele só passa `?next=`) e usar esse id como `transaction_id`; o
   GA4 descarta `purchase` repetido com o mesmo `transaction_id`.

Enquanto nenhuma das duas existir, **receita no GA4 fica em branco** —
o número de assinantes confiável continua sendo o do painel interno.

---

## 7. Melhorias opcionais

- **Propriedade de usuário `plano`** (`trial` / `starter` / `pro`):
  incluir em `marcarSinalAnalytics()` a partir do `broker`, registrar
  como dimensão de **escopo usuário** (seção 3.3). Permite ler retenção
  por plano sem exportar nada.
- **Audiência "trial vencido sem assinar"** no GA4, alimentando
  remarketing.
- **Segundo container no catálogo público** (ver 1.2), se um dia quisermos
  provar pro corretor quanto tráfego o site dele recebe.

---

## 8. Armadilhas

- **Não** colocar `GTM-MX2GH99M` em `public/site/` ou
  `functions/site-assets/`. Se alguém fizer isso, o funil de aquisição
  vira lixo em 24h. Ver 1.2.
- **`app/public/site/` e `app/functions/site-assets/` são cópias** que
  precisam ficar em sincronia (`/sync-site-assets`). Mudança de tracking
  no catálogo tem que ir nas duas.
- **`<meta charset>` tem que continuar sendo a primeira linha do
  `<head>`.** Os blocos de analytics somam ~1,1 KB e empurrariam o
  charset pra fora da janela de 1024 bytes que o parser HTML usa pra
  detectar encoding — acentuação quebrada em qualquer contexto que não
  mande o header `Content-Type` com charset.
- **Filtros e dimensões do GA4 não são retroativos.** Configure tudo
  antes de mandar tráfego pago pra cá.
