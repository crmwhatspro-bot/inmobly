# Sitemob App — SaaS self-service multi-tenant

Substitui o modelo antigo de **um projeto Firebase isolado por broker**
(`template/` + `control-plane/`, mantidos como referência, não apagados) por um
**único projeto compartilhado** (`inmobly-project`, plano Blaze), com signup
automatizado, checkout integrado e um único `/login` em vez de um `/admin` por site
de corretor.

Ver [`../docs/REGRAS-DE-NEGOCIO.md`](../docs/REGRAS-DE-NEGOCIO.md) para planos/preços
(seção 1, sobre custo de infra, **precisa ser recalculada** pro modelo compartilhado —
ver aviso no topo daquele documento).

✅ **Já deployado e testado contra infraestrutura real** — `inmobly-project` está em
Blaze, a jornada (login → tour → app shell → publicar site → domínio → páginas de
emprendimento) foi validada em produção, com bugs reais encontrados e corrigidos no
processo (ver histórico de commits). O que ainda falta testar ponta a ponta:

- **Stripe** — produtos/coupons/promotion codes ainda não criados no Dashboard, e
  nenhum fluxo de checkout (assinatura nova, upgrade, compra avulsa) rodou contra o
  Stripe real ainda. Ver checklist em "Setup" abaixo.
- **Domínio próprio** — código deployado, mas nunca testado com um domínio de
  verdade (ver seção "Domínio próprio").

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
  menu sem UI ainda; `?f=perfil|configuracoes` decide o título/texto
  mostrado (Leads virou Páginas, Domínio ganhou página própria — nenhum
  dos dois usa mais esse stub).
- **Bug real corrigido: campos de `meu-site.html`/`dominio.html`
  renderizavam como formulário de tema claro dentro do painel escuro**
  — `.form-label`/`.form-input`/`.form-select`/`.form-textarea` de
  `components.css` são estilos genéricos pensados pra fundo claro
  (label quase ilegível, ~2:1 de contraste; input com fundo branco).
  `admin.html`/`paginas.html` escapavam disso por acaso, só porque
  seus campos ficam dentro de um `<form class="imv-form">` que já
  tinha o override certo — `meu-site.html`/`dominio.html` não usam essa
  classe (não têm um `<form>` só cobrindo tudo) e caíam direto no
  padrão claro. Corrigido escopando o override em `.admin-dashboard`
  (todo mundo que passa por `initShell()`) em vez de só `.imv-form`, pra
  nenhuma página futura repetir o mesmo bug.
- **Contraste geral do painel aumentado** — `--clr-text-muted` e
  `--clr-text-light-2` (`css/tokens.css`) clareados (eram
  `#9CA3AF`/`#A8B8CC`, ficaram `#B7BFC9`/`#C7D3E2`, ~7–12:1 de contraste
  nos fundos escuros usados, contra ~5–9:1 antes). `.btn--accent` e
  `.btn--whatsapp` (`css/components.css`) trocaram o texto branco por
  `var(--clr-primary)` (azul-marinho escuro) — texto branco em cima do
  dourado/verde do WhatsApp dava ~2,8:1 e ~2:1 de contraste (falha grave
  de acessibilidade), o texto escuro dá ~6,5:1 e ~9:1 nos mesmos fundos.
  Também: `<input>`/`<select>` do painel ganharam `::placeholder`
  explícito (antes dependia do cinza padrão do navegador, inconsistente
  entre browsers) e `.imv-sec__body` (padding interno dos cards) subiu
  de `--sp-5` (20px) pra `--sp-6` (24px). Escopo dessa revisão: só o
  painel/CMS (`public/css/*`) — o catálogo público (`site/css/*`) tem
  cor de destaque configurável por corretor (6 presets) e não foi
  incluído nessa passada.
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
- **Product tour** (`js/product-tour.js`) — 4 passos, todos dentro do
  painel (`painel.html`), nunca troca de tela: boas-vindas (menu
  inteiro), depois Meus Imóveis, Meu Site e Plano — cada passo destaca
  o botão correspondente do menu lateral (`.pa-tour-highlight`, contorno
  pulsando) com um card de instrução posicionado ao LADO do próprio
  botão (`posicionarCard()`, calcula a posição via
  `getBoundingClientRect()` do alvo — encosta à direita no desktop, cai
  pra faixa acima/abaixo do botão no mobile), em vez do card fixo no
  canto da tela de antes. Os botões do menu ganharam
  `data-tour="nav-desktop-{key}"` (sidebar) e `data-tour="nav-mobile-{key}"`
  (bottombar) em `shell.js` só pra servir de alvo confiável do tour,
  independente do texto/ícone. "Próximo" avança o passo sem navegar —
  `initShell()` só roda o tour quando `active === 'dashboard'`, então
  em qualquer outra página (`admin.html`, `meu-site.html` etc.) a
  chamada simplesmente não faz nada. Diferente de `tour.html` (os
  slides estáticos de onboarding logo após o signup, sem dado nenhum
  ainda). Chamado de dentro de `shell.js#initShell()`, então já roda em
  toda página que usa o shell sem precisar importar em cada uma.
  Estado em `localStorage['pa-tour-{tenantId}']`: `null`/ausente =
  nunca visto (começa no passo 0), um número = passo atual, `'done'` =
  terminado ou pulado, nunca mais aparece. "Pular tour" marca como
  `done` na hora.

### Meus Imóveis (`admin.html`)

- **Lista em linhas, não mais cards em grid** — cada imóvel é uma linha
  (capa pequena + título/meta/preço + ações), pensado pra escanear
  rápido uma lista maior. No mobile a capa fica maior (108px, contra
  80px no desktop) pra continuar reconhecível, mas o layout continua em
  linha — não vira card empilhado. As ações (`Editar`/`Ativar`) descem
  pra uma linha própria só se não couberem ao lado do texto.
- **Paginação client-side** — 10 por página por padrão, seletor pra
  20/30/40/50. Todos os imóveis já vêm numa query só (nada de cursor no
  Firestore, não vale a pena na escala atual); a paginação só corta o
  que é renderizado.
- **`usage.imoveisCount` finalmente é escrito** — as rules já validavam
  o formato desde o commit que criou o CMS, mas nada gravava esse campo
  de verdade: o rodapé da sidebar sempre mostrava a barra zerada, e
  nenhum gatilho de limite tinha como funcionar. `sincronizarUsage()`
  (chamada depois de criar/editar/excluir/ativar-desativar um imóvel)
  grava a contagem de imóveis ATIVOS em `brokers/{tenantId}.usage` e
  chama `shell.js#atualizarUso()` pra a barra da sidebar atualizar na
  hora, sem precisar recarregar a página.
- **Moeda por imóvel** — campo `imv-moeda` no editor (select), gravado
  como `moeda: 'USD'|'PYG'|'BRL'` no doc (padrão `USD` quando ausente,
  inclusive em imóveis antigos criados antes desse campo existir). Só
  essas 3 opções por enquanto — as que fazem sentido pro mercado
  paraguaio. O prefixo do campo de preço (`US$`/`Gs.`/`R$`) muda em
  tempo real conforme a moeda selecionada; `fmtPreco()` formata o valor
  com o símbolo e o agrupamento de milhar certos pra cada moeda (mesma
  função duplicada em `js/admin-imoveis.js` — lista do CMS — e
  `site/js/imoveis.js` — cards/detalhe do site público — sem módulo
  compartilhado entre os dois por enquanto).
- **Popups de cupom vitalício (`50OFF`)** — dois gatilhos, mesmo cupom,
  mesma mecânica de UI (`initCupomModal` em `admin-imoveis.js`), só
  corretores com `status: 'trialing'`:
  - **Primeiro imóvel** — dispara ao cadastrar o 1º imóvel, só uma vez
    por navegador (`localStorage`, chave `pa-upsell-primeiro-{tenantId}`).
    Antes disparava só no 4º dos 6 imóveis grátis do trial ("Você já tem
    4 dos 6 imóveis grátis"); a intenção mudou pra comemorar o primeiro
    imóvel em vez de avisar que o limite tá chegando. Reforça o
    onboarding com um link pra `meu-site.html`, incentivando o corretor
    a editar as informações do site e publicar agora pra ver esse
    primeiro imóvel no ar. Chave de `localStorage` nova de propósito
    (não reaproveita `pa-upsell4-*`) — quem já tinha visto a versão
    antiga vê essa de novo.
  - **Limite do trial atingido** — dispara toda vez que o corretor tenta
    cadastrar um 7º imóvel já com os 6 grátis usados (clique em "Novo
    Imóvel" bloqueado por `separarPorLimite()`); antes era um `alert()`
    simples, virou o mesmo modal de cupom, sem gate de `localStorage`
    (mostra de novo a cada tentativa, é uma ação bloqueada, não uma
    comemoração pontual).

  Os dois modais mostram o cupom `50OFF` (50% off **vitalício**, não
  mais o antigo `LANCAMENTO3` de 3 meses) como texto copiável
  (`navigator.clipboard`, com fallback textual se o clipboard estiver
  bloqueado) — o corretor pode guardar pra usar depois ou clicar
  "Assinar agora" e já abrir o checkout do Stripe com o desconto
  aplicado direto, sem passar por `planos.html`.

- **Cupom `50OFF` — 50% off vitalício** — criado no Stripe Dashboard
  (Product catalog → Coupons, ID `50OFF`, 50% off, duration **Forever**)
  com `Max redemptions` baixo, ajustado direto no Dashboard (não é algo
  que o código controla ou consulta). Combinado com o cliente: por
  enquanto fica aberto pros primeiros assinantes que virem os popups
  acima; depois de ~20-30 resgates, a ideia é restringir promoções
  futuras a durações mais curtas (6 meses, depois 3) trocando o coupon
  em `functions/checkout.js` (`PROMOS.primeiroImovel` /
  `PROMOS.limiteImoveis`) — o `50OFF` em si pode continuar existindo pra
  distribuição manual (WhatsApp, conversa de venda) via Promotion Code,
  já que `allow_promotion_codes: true` fica ligado em toda sessão que
  não está aplicando um cupom automático.
  - `functions/checkout.js` já sabe aplicá-lo (via `promo:
    'primeiroImovel'` ou `promo: 'limiteImoveis'`, nunca aceita o ID do
    cupom direto do client), mas não cria cupons sozinho — precisa
    existir no Dashboard antes, senão "Assinar agora" falha no Stripe
    com erro de cupom não encontrado.
  - Precisa também existir um **Promotion Code** com o texto exatamente
    `50OFF` apontando pra esse Coupon — pro caso do corretor só copiar o
    código e digitar depois, manualmente, no campo "Adicionar código
    promocional" do Checkout. Coupon e Promotion Code são objetos
    diferentes no Stripe: o Coupon sozinho não aparece nem é digitável
    na tela do Checkout, só é aplicável via API. Sem o Promotion Code, o
    botão "Assinar agora" continua funcionando, mas "copiar e usar
    depois" não tem efeito nenhum se o corretor tentar digitar o código
    manualmente.

  ⚠️ Nenhum desses fluxos foi testado contra infra real.

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
- **Publicar/despublicar é um switch, não mais 3 botões** — 3 botões
  lado a lado (Publicar/Atualizar/Despublicar) ficavam largos demais e
  no mobile o texto cortava. Agora é um `.imv-switch` (mesmo componente
  usado em "Anúncio ativo" no editor de imóveis) — ligado = publicado,
  desligado = despublicado — mais "Abrir site ↗" e "Atualizar" como
  ícones compactos ao lado, só quando já publicado.
- **"Atualizar site"** — ícone separado do switch. Chama a mesma
  `publicarSite` (segura pra rodar de novo, sempre cria uma
  versão/release nova no Hosting com o conteúdo mais recente de
  `site-assets/`) sem desligar `published`. Antes desse botão existir,
  a única forma de levar uma mudança de conteúdo pro site já publicado
  era despublicar (catálogo mostra "indisponível" por um tempo) e
  publicar de novo — provavelmente a causa de confusão de "por que
  ficou indisponível" relatada ao testar.
- **Preview (`#msPreviewModal`) não ficava mais "carregando" pra sempre
  no mobile** — o iframe do preview (`site/index.html?preview=1`) só
  esconde o spinner (`mostrarConteudo()`) depois de um handshake via
  `postMessage` com `meu-site.js` (iframe avisa `pa-preview-pronto` →
  pai responde com `pa-preview-perfil`). Se essa troca não completasse
  por qualquer motivo (aba/iframe em segundo plano no mobile, rede
  lenta, mensagem perdida), o spinner girava pra sempre, sem erro nem
  fallback visível. `iniciarPreview()` (`site/js/imoveis.js`) agora tem
  um `setTimeout` de 6s: se não recebeu o perfil de verdade até lá,
  mostra o conteúdo de exemplo mesmo assim (mesmo texto/fotos que já
  aparecia quando o corretor ainda não tinha preenchido nada) — se o
  perfil real chegar depois, ele substitui normalmente. No modo normal
  (site publicado de verdade, visitante real), `carregarPerfilPublico()`
  (`site/js/public-tenant.js`) ganhou o mesmo tipo de proteção: o
  `fetch` da function `perfilPublico` agora aborta em 12s em vez de
  poder ficar pendurado indefinidamente numa rede ruim.
- **Navbar própria, com nome/logo do corretor** — `site/index.html` não
  tinha navbar nenhuma até agora, apesar do CSS pra isso já existir
  desde antes (`--navbar-h` no padding do `.imv-hero` só fazia sentido
  com uma navbar fixa por cima, mas nada a renderizava). O site inteiro
  parecia um template sem identidade — rolar a página perdia qualquer
  sinal de "de quem é esse catálogo". Agora `.site-navbar` (fixa, fundo
  escuro + blur, não usa o `.navbar`/`.navbar--solid` genérico de
  `components.css` porque aquele componente pressupõe menu multi-página
  e hero clara com foto — aqui é página única e hero sempre escura, não
  precisa de burger/drawer/scroll-toggle) mostra `logo`+`name` do
  broker (`#nav-logo`/`#nav-nome`) e um CTA de WhatsApp, sempre visível.
  Os campos já existiam (Identidade visual em `meu-site.html`) — só
  faltava a navbar pra de fato usá-los fora do rodapé/hero.
- **Hero separado do Portfolio** — `headline`/`subheadline` (+ logo)
  ficavam todos espremidos dentro do `.imv-hero`, com o rótulo
  "Portfolio" como eyebrow ACIMA do título — não marcava a grade de
  imóveis, só decorava o hero. Agora o hero só tem headline+subheadline
  (logo saiu pra navbar), e `#portfolio-label` virou o cabeçalho de
  verdade da seção de filtros+grade, logo abaixo do hero — mesmo padrão
  já usado em "Sobre" (`#sobre-label` acima de `#sobre-titulo`). A
  sobreposição visual que `.imv-filters` fazia por cima do hero
  (`margin-top` negativo) foi removida — com o label no meio, o
  encaixe não fazia mais sentido; virou espaçamento normal.
- **Rodapé: direitos reservados à Punto Alto, não mais "Criado por
  Sitemob"** — a linha final do rodapé (`#footer-rights-prefix` +
  link) agora é fixa em todos os sites de todos os tenants: "Todos los
  derechos reservados a Punto Alto Marketing y Ventas — sponsored by
  startup CRM WhatsPro", com o nome da Punto Alto linkado pra
  puntoalto.com.py. Só o prefixo é traduzido (es/pt/en) — os nomes de
  marca (Punto Alto, CRM WhatsPro) ficam fixos em qualquer idioma, como
  já era com "Sitemob" antes. **Continua existindo** um `#footer-copy`
  separado, por tenant, com `© {ano} {nome do broker}` — esse não
  mudou, é o copyright do próprio corretor sobre o conteúdo dele.
- **Bug real corrigido: "indisponível" aparecia sempre, publicado ou
  não** — `#site-indisponivel` tinha `hidden` E um `style="display:flex"`
  inline ao mesmo tempo. Estilo inline sempre vence a regra padrão do
  navegador pra `[hidden]` (que é só `display:none`), então o bloco
  ficava visível *de qualquer jeito*, aparecendo embaixo do rodapé
  mesmo com o catálogo carregando certo. `display` agora só é setado
  via JS (`mostrarIndisponivel()`), nunca fixo no HTML.
- **Flash de conteúdo padrão corrigido** — o HTML estático tinha texto
  genérico ("Inmuebles disponibles" etc.) visível por um instante antes
  do fetch a `perfilPublico` resolver e sobrescrever com os dados reais
  do corretor. `#site-conteudo` começa `hidden`, um spinner
  (`#site-carregando`) fica visível até `aplicarPerfil()` já ter
  rodado com dados de verdade — nunca mais mostra o texto errado, nem
  por um instante.
- **Não lê `brokers/{tenantId}` direto** (tem e-mail, IDs do Stripe) — o
  catálogo chama `perfilPublico?tenant=slug`, que só responde se
  `published === true` (404 senão) e devolve uma projeção pública dos
  campos abaixo. `imoveis`/`fotos` continuam lidos direto do Firestore
  client-side, já eram públicos.
- **Resolve o tenant** por `location.hostname` em produção
  (`<slug>.web.app`), com fallback pra meta tag `pa-tenant` (gravada por
  `publicarSite.js` no HTML de cada tenant, ver seção "Domínio próprio"
  abaixo) quando o hostname é um domínio próprio, e `?t=slug` por
  último pra testar antes de publicar.
- **Conteúdo**: hero (logo + `headline` + `subheadline`, sem botão — o
  hero do template original também não tem CTA, só texto) + filtros
  básicos (operação/tipo/cidade, cidade montada dinamicamente a partir
  dos imóveis do corretor) + grid + modal de detalhe + seção CTA
  ("¿No encontraste lo que buscabas?", sempre visível, é onde o WhatsApp
  mora de verdade — não mais um botão gigante dominando o hero) + seção
  "Sobre" (`about`, só aparece se preenchido) antes do rodapé + rodapé
  com WhatsApp/e-mail/Instagram + linha de direitos reservados à Punto
  Alto (ver nota acima — não é mais "Creado con orgullo por Inmobly"
  linkando pro login, esse texto foi substituído). Referência visual: o mesmo site Nando
  Barros que `template/` já clonava desde o início do projeto — não é
  mais a versão "enxuta" original, essa foi abandonada depois de ver o
  resultado. Ainda sem depoimentos/FAQ/formulário de contato — não
  pedidos até agora. `site/js/imoveis.js` é a versão adaptada de
  `template/js/imoveis.js` (paths viram `brokers/{tenantId}/imoveis/...`).
- **Idioma** (`language`: `es`/`pt`/`en`, padrão `es`) — selecionável em
  Identidade visual. `site/js/imoveis.js` guarda um dicionário completo
  por idioma (`IDIOMAS`) cobrindo tanto os textos gerados por JS
  (cards, filtros, modal — já existia) quanto o que antes era texto
  estático direto no HTML (pills, opções dos `<select>`, seção CTA,
  rodapé) — esse segundo grupo precisou ganhar `id` em cada elemento
  pra `aplicarIdioma()` conseguir trocar. `STR` é reatribuída (não é
  `const`) pro idioma escolhido — todo o resto do arquivo que já lia
  `STR.algumaCoisa` continua funcionando sem saber que o idioma mudou.
  `<html lang>` também é atualizado. Rules restringem a um dos 3
  valores (`in ['es','pt','en']`).
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
- **Contato** — além do `whatsapp` (obrigatório pra publicar), `contactEmail`
  e `instagramUrl` opcionais, aparecem no rodapé do site público se
  preenchidos.
- **Preview em popup** — botão "Pré-visualizar site" abre um modal com
  `site/index.html?preview=1&t=<tenantId>` num `<iframe>` — o `src` só é
  setado nesse clique (não carrega sozinho ao abrir a página). Nesse
  modo o perfil (nome/logo/cor/textos) nunca vem de `perfilPublico`
  (exigiria `published:true`) — chega por `postMessage` do formulário,
  reenviado com debounce a cada campo editado, mesmo antes de salvar.
  **Os imóveis são outra história**: já são públicos e já existem de
  verdade assim que cadastrados em Meus Imóveis, então o preview busca
  eles direto do Firestore (`?t=` é só pra isso) — só cai pros 3 de
  exemplo fixos se o tenant realmente não tiver nenhum imóvel ainda.
  Headline/subheadline/sobre também mostram um texto de exemplo em vez
  de ficar em branco quando ainda não preenchidos — só no preview, o
  site publicado de verdade nunca mostra texto de exemplo. Um seletor
  de dispositivo (desktop/tablet/celular, canto superior direito do
  modal) troca a largura do iframe pra simular os três tamanhos.
- **Três seções de salvamento** (Identidade / Textos / Contato), cada
  uma com seu próprio botão — evita um formulário gigante com um único
  "Salvar" para tudo, e mantém o WhatsApp junto do resto do contato em
  vez de isolado como antes.
- **Cards sanfona, fechados por padrão** — as 3 seções eram
  `<section>`/`<div>` normais, todas abertas e expostas na tela ao
  mesmo tempo, muita coisa pra ver de uma vez só na primeira visita.
  Viraram `<details>`/`<summary>` nativos (`.ms-accordion`) — sem JS
  pra abrir/fechar, funciona de teclado de graça. Só o ícone de
  chevron (`.ms-accordion__chevron`) gira via `[open]` no CSS.
  **Bug corrigido**: o chevron ficava em posições diferentes em cada
  card — a causa era `.imv-sec__head p { margin-left: auto }`
  empurrando só o `<p>` pra direita, com `flex-wrap: wrap` quebrando
  de jeitos diferentes dependendo do tamanho de cada descrição.
  Título+descrição agora ficam num `.ms-accordion__text` (`flex:1`,
  não quebra linha) e é o próprio `.ms-accordion__chevron` que carrega
  `margin-left: auto` — sempre na ponta direita, não importa o texto.
- **Limite de sites por projeto**: Firebase Hosting tem uma cota de sites
  por projeto (dezenas, não milhares). Não é problema na validação inicial
  do produto, mas é uma parede que existe — não resolvida agora de
  propósito, só registrada aqui pra não esquecer quando a base de
  corretores crescer.

### Domínio próprio (`dominio.html`)

O corretor conecta um domínio dele (ex.: `catalogo.suaempresa.com.py`) ao
catálogo já publicado, em vez de ficar só em `<tenantId>.web.app`. Item
"Domínio" do menu, antes um stub "Em breve", agora é uma página de
verdade.

- **`functions/dominio.js`** — 3 functions novas usando o recurso
  `sites.domains` da Hosting REST API v1beta1 (endpoint diferente do
  que `publicarSite.js` usa — aquele publica arquivos, este associa um
  domínio a um site que já existe):
  - `conectarDominio({ dominio })` — exige o site já publicado
    (`broker.published === true`, senão nem existe o Hosting site pra
    associar), cria a associação, devolve o status + os IPs que a
    Hosting API espera (`provisioning.expectedIps`) pro corretor
    configurar como registro A no DNS dele.
  - `verificarDominio()` — refaz o GET da associação, atualiza o status
    cacheado no Firestore. Chamado tanto pelo botão "Verificar
    novamente" quanto automaticamente toda vez que `dominio.html` abre.
  - `removerDominio()` — desfaz a associação (idempotente — sem domínio
    conectado, só retorna `ok`), volta a usar só `<tenantId>.web.app`.
  - Mesmo padrão de auth/erro/credenciais de `publicarSite.js`
    (`applicationDefault()` resolvida late, mesmo `chamarApi()`). O
    papel `roles/firebasehosting.admin` já concedido pra `publicarSite`
    cobre isso também — é a mesma API, só recurso diferente.
- **`brokers/{tenantId}.customDomain`/`.customDomainStatus`** — só um
  CACHE do último status conhecido, gravado pelas functions acima via
  Admin SDK (ignora rules). **Não** estão na lista de campos que
  `firestore.rules` deixa o tenant escrever sozinho de propósito — só
  as Cloud Functions (que de fato chamam a Hosting API) podem gravar
  esses campos, pra nunca existir um `customDomain` "fantasma" sem
  associação real por trás. `customDomainStatus` fica só em
  `'none' | 'requested' | 'configuring' | 'active'` —
  `functions/dominio.js#statusResumido()` reduz o `certStatus`/`dnsStatus`/
  `status` brutos da Hosting API pra esses 4 valores antes de gravar ou
  devolver pro client; `js/dominio.js` só traduz o enum pra
  badge/texto/explicação (`SITUACAO`), nunca interpreta nome de enum da
  Hosting API diretamente.
- **Resolução do tenant num domínio próprio** — o bundle público
  (`site/js/imoveis.js` + `public-tenant.js`) é idêntico pra qualquer
  tenant; hoje ele descobria "de quem é esse site" só por
  `location.hostname` bater com `<slug>.web.app`. Um domínio próprio
  não bate nesse padrão. Corrigido em duas pontas: `site/index.html`
  ganhou `<meta name="pa-tenant" content="">` (vazia por padrão) e
  `publicarSite.js#popularEUpload()` agora grava o `tenantId` ali antes
  de fazer o upload de `index.html` — é o único arquivo do bundle que
  passou a mudar por tenant, todo o resto continua idêntico.
  `tenantIdAtual()` lê essa meta tag como segundo fallback (depois do
  padrão `*.web.app`, antes do `?t=` usado só em preview/teste).
- ⚠️ **NÃO TESTADO CONTRA INFRA REAL — testar com um domínio de
  verdade antes de oferecer pra qualquer cliente.** Duas incertezas
  concretas que só um teste real resolve:
  1. Não ficou claro, pelas fontes disponíveis, se a Hosting API pede
     alguma verificação de posse do domínio (historicamente, esse tipo
     de conexão pedia prova de posse via Google Search Console/Site
     Verification, feita à parte) antes de aceitar a associação, ou se
     resolve isso sozinha nesse fluxo multi-site. Se o `conectarDominio`
     falhar com algo parecido com "verification required" ou
     "permission denied", esse passo extra de verificação de posse
     ainda precisa ser desenhado — hoje o código assume que não é
     necessário.
  2. `statusResumido()` (`functions/dominio.js`) reduz `certStatus`/
     `dnsStatus`/`status` pra `'requested'`/`'configuring'`/`'active'`
     só com base nos nomes de enum que aparecem na documentação pública
     — os valores exatos devolvidos pela API de verdade (`CERT_ACTIVE`?
     `ACTIVE`? outro nome?) não foram confirmados contra uma resposta
     real.

### Google Tag Manager (`meu-site.html`)

Campo opcional pro corretor colar o ID do container dele
(`GTM-XXXXXXX`) — uma nova seção sanfona "Google Tag Manager" em "Meu
Site", com um mini-tutorial de 4 passos (criar conta em
tagmanager.google.com, tipo Web, copiar o ID, colar no campo) direto
acima do input, já que a maioria dos corretores nunca mexeu nisso.

- **`brokers/{tenantId}.gtmId`** — igual aos outros campos de
  Identidade/Textos/Contato: o próprio tenant grava direto
  (`updateDoc` client-side), sem passar por Cloud Function — não chama
  nenhuma API externa, só salva uma string. `firestore.rules` valida o
  formato (`^(GTM-[A-Z0-9]+)?$` — vazio ou um container ID válido,
  nunca outra coisa) antes de aceitar a escrita.
- **`perfilPublico.js`** projeta `gtmId` igual aos outros campos
  públicos (nome, whatsapp, etc.) — sem isso o campo ficaria só no
  Firestore, nunca chegando no catálogo publicado.
- **Injeção no site público** (`site/js/imoveis.js#injetarGTM()`) —
  réplica em JS do snippet oficial de instalação do GTM (que normalmente
  vai direto no HTML) — aqui precisa ser via JS porque `index.html` é o
  mesmo bundle pra qualquer tenant, o ID só existe em tempo de
  execução. Roda dentro de `aplicarPerfil()`, só quando
  `!MODO_PREVIEW && p.gtmId` — **nunca no preview do modal em
  "Pré-visualizar site"**, de propósito: sem essa trava, cada tecla
  digitada no formulário (o preview reenvia o perfil com debounce a
  cada edição) dispararia uma "visita" de teste no GTM de verdade do
  corretor. Valida o formato do ID de novo antes de montar a URL do
  script (defesa em profundidade — não confia só na validação já
  feita na escrita do Firestore) e guarda contra injeção duplicada
  (`#pa-gtm-script`) caso `aplicarPerfil()` seja chamado mais de uma
  vez.

### Product tour — abandono expira

`js/product-tour.js` mostrava o passo salvo (`localStorage`,
`pa-tour-{tenantId}`) toda vez que `lerPasso()` via um índice numérico —
mas nada distinguia "acabei de mostrar agora" de "mostrei há dias e o
corretor ignorou": se ele navegasse pra outra área sem clicar em
"Próximo"/"Pular tour", o passo ficava preso no mesmo índice pra
sempre e reaparecia igual em toda visita futura. Agora cada exibição
grava também um timestamp (`pa-tour-ts-{tenantId}`); se passar mais de
`EXPIRA_MS` (2 minutos) sem interação, o passo expira sozinho e marca
`'done'` — nunca mais interrompe. Um corretor que de fato clica
"Próximo" a cada passo renova o prazo a cada clique e completa o tour
normalmente, entre páginas, sem esbarrar nisso.

### Checkout — troca de plano não duplicava mais assinatura

`functions/checkout.js` sempre criava uma Checkout Session NOVA em
`mode: 'subscription'`, mesmo pra quem já tinha assinatura ativa — o
que criaria uma SEGUNDA assinatura paralela no Stripe (cobrando os
dois planos ao mesmo tempo) em vez de trocar a existente, apesar do
texto em `planos.html` já prometer "assinar um plano diferente troca
automaticamente". Agora, se `broker.stripeSubscriptionId` existe e a
assinatura no Stripe ainda está `active`/`past_due`, `criarCheckoutSession`
troca o item da assinatura atual direto pela API
(`stripe.subscriptions.update(...)`, `proration_behavior: 'create_prorations'`)
e retorna `{ updated: true, plan }` em vez de uma URL de checkout —
`planos.js` mostra uma mensagem de sucesso inline nesse caso, sem
redirect. Se a troca direta falhar por qualquer motivo, cai pro fluxo
normal (nova Checkout Session) em vez de travar o usuário.

⚠️ Nenhum fluxo de checkout (assinatura nova, upgrade, ou compra
avulsa) foi testado contra o Stripe real ainda. Antes de testar com
cartão de teste: confirmar que `STRIPE_SECRET_KEY` é uma chave de
**test mode** (`sk_test_...`), que os Prices existem no Stripe com os
`lookup_key` exatos usados no código (`inmobly_starter_monthly`,
`inmobly_pro_monthly`, `inmobly_emprendimento_page`), e que o webhook
endpoint em Stripe Dashboard → Developers → Webhooks aponta pra
`stripeWebhook` desse projeto com os 4 eventos certos e o
`STRIPE_WEBHOOK_SECRET` correspondente configurado.

### Páginas de Empreendimento (`paginas.html`)

Item "Leads" do menu lateral não fazia sentido (nunca teve UI, só um
stub "Em breve") — virou "Páginas", primeira UI real de um produto que
já existia nas regras de negócio (`docs/REGRAS-DE-NEGOCIO.md`, seção
5) mas nunca tinha sido construído: uma página institucional avulsa
por empreendimento, US$ 400 de tabela / US$ 200 de lançamento (cupom
`LANCAMENTO50`, já aplicado automaticamente pelo backend — ver
`COUPON_LANCAMENTO` em `checkout.js`, não mudou nesse commit).

- **Compra é pré-paga, criação é separada** — clicar em "Comprar
  página" abre o checkout do Stripe (`priceLookupKey:
  'inmobly_emprendimento_page'`, `mode: 'payment'`). Quando o webhook
  processa o `checkout.session.completed`, credita
  `brokers/{tenantId}.usage.paginasCompradas` (+1, protegido contra
  reentrega do mesmo evento — só incrementa se o doc de `purchases/`
  ainda não existia). O botão do topo da lista é dinâmico: sobra saldo
  (`paginasCompradas > paginas.length`) → "+ Nova página" (abre o
  editor direto, sem checkout); sem saldo → "Comprar página — US$
  200" (abre o checkout). O formulário também barra a criação sem
  saldo como segunda camada, caso o botão fique dessincronizado.
- **Lista em linha, mesmo padrão de Meus Imóveis** — `imv-admin-row`,
  paginação client-side, badge de status (Publicada/Rascunho)
  reaproveitando `imv-admin-badge--destaque`/`--limite` sem CSS novo.
- **Mais campos que um imóvel simples**, como pedido: previsão de
  entrega, unidades disponíveis, link de tour virtual/vídeo, além do
  que já existe em imóvel (nome, estágio, localização, valor,
  comodidades, descrição). Capa é uma imagem só (não galeria) — mesmo
  algoritmo de compressão canvas→WebP/JPEG de `admin-imoveis.js`, sem
  Firebase Storage.
- **`brokers/{tenantId}/paginas/{id}`** — regras espelham `imoveis`
  (leitura pública, escrita só do tenant admin) pensando já na página
  institucional pública que ainda não existe (ver abaixo).
- **`obrigado.html` agora aceita `?next=`** — depois de pagar uma
  Página de Emprendimento, o botão da tela de confirmação manda direto
  pra `paginas.html` em vez do painel genérico (`PROXIMA_PAGINA` em
  `checkout.js`).

- **Página pública** (`site/emprendimiento.html?id=<paginaId>`) —
  o que faltava: o switch "Página publicada" agora de fato gera um link
  compartilhável. Mesmo bundle multi-tenant de `site/index.html`
  (mesma resolução de tenant via `public-tenant.js#tenantIdAtual()` —
  hostname `*.web.app`, meta `pa-tenant` gravada por `publicarSite.js`
  em domínio próprio, ou `?t=` pra testar), só que lendo
  `brokers/{tenantId}/paginas/{id}` direto (leitura pública já liberada
  nas rules) em vez de `perfilPublico`. Só mostra conteúdo se
  `publicada === true` — rascunho ou id inexistente cai no mesmo estado
  "página não disponível" do catálogo. Hero com a foto de capa (ou
  gradiente escuro se não tiver capa), fatos-chave (unidades
  disponíveis, previsão de entrega, endereço), comodidades (reaproveita
  `.imv-feats` de imoveis.css), descrição, botão de tour virtual (só o
  link — não embeda iframe de terceiro) e CTA de WhatsApp com mensagem
  pré-preenchida citando o nome do empreendimento. Suporta os mesmos
  3 idiomas do catálogo (dicionário próprio e menor em
  `emprendimiento.js`, sem módulo compartilhado com `imoveis.js` — mesmo
  padrão de duplicação já aceito em `MOEDA`/`fmtPreco`).
  - `publicarSite.js#popularEUpload()` deixou de gravar a meta
    `pa-tenant` só em `/index.html`: agora checa QUALQUER arquivo
    `.html` que contenha o placeholder da meta tag, então
    `emprendimiento.html` (e qualquer página pública futura) já sai
    coberta sem precisar lembrar de atualizar uma lista.
  - **"Copiar link"** — novo botão na linha de cada página já publicada,
    em `paginas.html`. Prefere o domínio próprio quando já está
    `active` (`broker.customDomain`/`customDomainStatus`, ver seção
    "Domínio próprio"), senão cai no `<tenantId>.web.app` padrão.
  - Perfil do corretor (nome/logo/whatsapp pro navbar/rodapé/CTA) usa
    `carregarPerfilPublico()` normalmente, mas **não bloqueia** a
    página se vier `null` (catálogo principal nunca publicado) — a
    Página de Empreendimento é um produto pago à parte, independente
    do plano de assinatura ou de o corretor ter publicado o catálogo.

### Painel interno de KPIs (`interno-metricas.html`)

Painel **da equipe Punto Alto**, não do corretor: visitas do site →
contas criadas → assinaturas fechadas, mais receita e uso de produto.
Não confundir com `painel.html` (dashboard de cada tenant) nem com
`admin.html` (o CMS "Meus Imóveis" de cada tenant).

Três peças novas, porque nada disso existia:

**1. Tracking de visita.** A landing (`functions/landing/index.html`)
não tinha GA, GTM nem beacon nenhum — zero dado de topo de funil (o
`gtmId` do schema é do corretor, injetado no catálogo público dele,
nada a ver com isso). Agora um bloco no fim do `<body>` gera um
`visitorId` (localStorage, persiste) e um `sessionId` (sessionStorage,
morre com a aba) e chama `logVisita` (`functions/analytics.js`) com
`keepalive` no load, gravando um doc em `analytics_visits/`.

Firestore próprio em vez de GA4/GTM de propósito: pra cruzar visita
com dado de negócio ("essa visita virou conta? virou assinante?"), o
GA4 exigiria export pro BigQuery e um join fora do app. Aqui a mesma
página lê `analytics_visits` e `brokers` lado a lado.

Escrita na collection é **negada pra todo mundo** nas rules — quem
grava é a function (Admin SDK). Se `create` fosse aberto, qualquer um
com a config do Firebase (que é pública, está em `js/firebase.js`)
escreveria no nosso funil. A superfície exposta é o endpoint, que
valida formato de id, corta tamanho de string e descarta user-agent de
bot antes de gravar.

**2. Correlação visita → conta.** `sitemob.app` (landing) e
`painel.sitemob.app` (signup) são subdomínios diferentes:
localStorage não atravessa. O tracker carimba `?vid=&sid=` (+ os
`utm_*` da URL atual) em todo `<a>` que aponta pro painel — em JS, não
no `href` hardcoded, porque o id só existe em runtime.

Do outro lado, `js/atribuicao.js` guarda esse parâmetro em
localStorage assim que ele aparece, **first-touch**. Tem que ser
persistido e não lido direto da URL no submit: quem não está logado
cai em `criar-conta.html`, é mandado pra `login.html` (que perde o
query param), volta do popup do Google e só então cria a conta.
`capturarAtribuicao()` roda no top-level de `criar-conta.js` e
`login.js` — antes de qualquer redirect, senão o dado some no salto.

`criarConta` grava no doc: `acquisitionVisitorId`,
`acquisitionSessionId`, `acquisitionUtmSource/Medium/Campaign`. O utm
fica espelhado no broker (não só em `analytics_visits`) pra dar pra
quebrar contas por canal sem refazer o join toda vez.

**3. Transições de assinatura.** `brokers` só guardava o status
ATUAL, então não dava pra dizer "quantos assinaram em julho", só
"quantos estão ativos agora". O `stripeWebhook` passou a carimbar
`activatedAt` (primeira conversão a pagante — só a primeira; uma
reativação não sobrescreve), `canceledAt` e `statusChangedAt`, e a
gravar uma linha em `brokers/{id}/statusHistory/` a cada mudança
**real** de status. O "real" importa: `subscription.updated` chega em
qualquer mexida na assinatura, quase sempre com o mesmo status — sem
comparar com o valor anterior, `statusChangedAt` viraria "última vez
que o Stripe mandou um evento".

Isso só vale daqui pra frente: quem já era `active` antes não tem
`activatedAt` e não entra em "assinaturas fechadas no período" (o
painel mostra esse número à parte). Churn mensal e LTV continuam
**não calculáveis** até haver histórico acumulado — o desenho está
pronto, a conta não.

**A página em si** (`interno-metricas.html` + `js/interno-metricas.js`
+ `css/interno.css`) é autocontida: não usa `initShell()`, porque
aquele shell é o chrome do painel por-corretor e o auth-gate dele
exige o custom claim `tenantId` — quem entra aqui normalmente não tem
tenant nenhum e seria expulso pra `criar-conta.html`. Gate próprio:
Google Sign-In + e-mail na allowlist de `js/equipe.js`.

Essa allowlist é uma **cópia** da de `isTeam()` em `firestore.rules`, e
não tem como ser um arquivo só (uma é módulo ES, a outra é a linguagem
de regras do Firestore, que não importa nada de fora — mesmo caso de
`limiteEfetivo()`, duplicado entre `tenant.js` e `perfilPublico.js`).
A das rules é a que protege de verdade; a do client só decide mostrar
o painel ou a tela de "acesso restrito". **Ao adicionar alguém, mudar
nas duas** — só no client, a pessoa vê a tela e toda query falha em
`permission-denied`; só nas rules, é barrada na porta tendo acesso.

**Estrutura de app, não de relatório.** Sidebar fixa à esquerda,
topbar com título/período/menu de perfil, e uma view por assunto —
trocadas por hash (`#/trials`), sem recarregar nem refazer as queries
(o modelo calculado fica em memória; só mudar o período refaz o
fetch). Views:

- **Visão geral** — resumo do negócio + movimento do período +
  **"Movimento por dia"** (uma linha por KPI do funil, ver abaixo) +
  **"Precisa de atenção"**, uma fila de
  trabalho: inadimplentes, testes acabando em ≤3 dias, pagantes que não
  abrem o painel há mais de 30 dias, testes expirados nos últimos 14
  dias. Uma conta pode aparecer em mais de uma linha — são ações
  diferentes, não duplicata.
- **Aquisição** — visitas, sessões, visitantes únicos, funil com as
  taxas entre etapas e tabela de canais (utm_source → host do referrer
  → direto), com a conversão de cada canal.
- **Contas grátis** — os trials: entrada (`createdAt`), saída
  (`trialEndsAt`, ou `activatedAt` pra quem converteu), situação
  (`faltam Nd` / `expirado` / `converteu`), imóveis, site no ar,
  último acesso, origem. Filtros: em teste / expirados sem converter /
  converteram / todos.
- **Assinantes** — MRR, ticket médio, distribuição por plano, e o
  movimento do período (novas × cancelamentos × MRR líquido). A tabela
  linka direto pro cliente no dashboard do Stripe, que é de onde sai
  fatura e histórico de pagamento — nada disso é replicado aqui.
- **Contatos** — cliques nos botões de contato dos catálogos, por tipo,
  por dia e por corretor (ver "Contatos gerados" abaixo).
- **Todas as contas** — a base inteira, uma linha por tenant.
- **Produto** — imóveis por conta, sites publicados, onboarding,
  contas sem nenhum imóvel, e **retenção** (contas vivas em 7/30 dias).
- **Dados da conta** — fora da sidebar, chega pelo menu de perfil no
  canto superior direito: dados do login de equipe atual e a lista de
  quem tem acesso. Só "Dados da conta" e "Sair" no menu; não há
  "Configurações" porque não haveria o que configurar.

**O seletor de período** é um botão só na topbar, com os presets em
linhas dentro de um painel — não um segmentado de `7d/30d/90d`, porque
ali a largura da topbar crescia junto com a quantidade de presets.
Preset novo é uma linha no registro `PERIODOS` do JS e nada de layout;
a lista do menu é renderizada a partir dele. Semana começa no **domingo**
(que é o que `getDay()` já numera como 0). A escolha fica no
`localStorage` — quem trabalha sempre em "este mês" não reseleciona a
cada sessão; se o storage falhar ou vier corrompido, cai no padrão de
30 dias sem quebrar nada.

Por baixo, o painel deixou de pensar em "quantos dias atrás" e passou a
pensar em **faixa** — `{ inicio, fim }`, cada lado podendo ser `null` =
sem limite daquele lado. Quase todo preset é aberto no fim ("até
agora") e só carrega `inicio`; "mês passado" e "personalizado" são os
únicos fechados, e foram eles que exigiram a mudança. As duas pontas
filtram o mesmo campo (`ts`) que já é o do `orderBy`, então continua
sendo índice de campo único e o `firestore.indexes.json` não muda.
Datas invertidas no personalizado são trocadas em silêncio — a intenção
é óbvia e recusar só faria a pessoa adivinhar o erro.

Cuidado que fica mais visível com faixas longas: o teto de
`MAX_VISITAS` (10.000) corta pelo `orderBy ts desc + limit`, ou seja,
some o **começo** da faixa — os primeiros dias do gráfico aparecem
baixos sem terem sido baixos. Por isso o aviso de truncamento é
destacado (`.status--aviso`) em vez de ser mais uma frase no fim da
linha de status. Quando 10k virar pouco de verdade, o caminho é o
agregado diário (`metrics_daily`), não um teto maior.

**Como adicionar uma view**: uma `<section class="view"
data-view="...">` no HTML e uma entrada no registro `VIEWS` do JS
(label, ícone, `render`, opcionalmente `badge` e `usaPeriodo`).
Sidebar, roteamento, título da topbar e visibilidade do seletor de
período saem disso sozinhos. Os helpers de componente (`cardsHTML`,
`tabelaHTML`, `funilHTML`, `barraDistHTML`, `tagHTML`, `graficoLinhas`)
cobrem o visual sem CSS novo — foi por isso que o CSS ficou organizado
em blocos genéricos (`.card`, `.tabela`, `.barra-dist`, `.gl`) em vez
de classes por tela.

**Os gráficos de tempo** (`graficoLinhas`) são todos o mesmo
componente: recebem a série diária densa de `serieDiaria()` — um ponto
por dia, com zero nos dias vazios, senão o eixo mente — e uma lista de
**painéis**, cada um com o próprio eixo Y, todos dividindo o mesmo eixo
X e o mesmo cursor. Um painel por ordem de grandeza: visitas vivem na
casa dos milhares, contatos nas dezenas e assinaturas em 0–2, e
qualquer par desses no mesmo eixo achata o menor contra o chão. A saída
que parece óbvia — dois eixos Y, um de cada lado — é pior: a razão
entre as escalas é arbitrária, então o ponto onde as linhas se cruzam
passa a contar uma história que o dado não tem. (Era esse o defeito das
barras que existiam antes, que escalavam cada série pelo próprio
máximo.) Com painéis separados a comparação continua sendo de FORMA —
os picos batem no mesmo dia? — sem fingir comparação de volume.

Cada KPI tem uma cor fixa no painel inteiro (`SERIES`, no JS): a linha
violeta de "contatos gerados" da Visão geral é a mesma do gráfico da
view de Contatos. Cor segue a métrica, nunca a posição no gráfico. Os
hexes saem de uma paleta categórica validada contra o fundo `#111820`
(separação em daltonismo e contraste), e o painel de conversão pula
alguns slots de propósito — magenta ao lado de verde-água é
praticamente a mesma cor em deuteranopia. Trocar essas cores pede
revalidar, não só olhar. Hover e setas do teclado mostram o mesmo
tooltip, e o `<details>` "Ver os números" abre a tabela com todos os
valores — o tooltip nunca é o único caminho pro dado.

Sobre "contas vivas": o painel sabia quantas contas existem, não
quantas estão sendo usadas — e `status` só vira `canceled` quando a
pessoa já desistiu, tarde demais pra reagir. `shell.js` carimba
`lastActiveAt` no doc do tenant a cada abertura do painel, no máximo
1× a cada 12h (a métrica é em dias; sem essa trava seria uma escrita
por page load, por usuário — e `initShell()` roda de novo a cada
navegação do router SPA, daí a trava extra em memória). É campo
separado de `updatedAt` de propósito: aquele significa "o corretor
editou alguma coisa", e carimbá-lo a cada visita apagaria essa
informação.

O percentual no card usa como denominador só quem **tem** o carimbo,
não a base toda: quem nunca abriu o painel depois de o campo existir
apareceria como abandono sem nunca ter tido chance de contar.
`lastActiveAt` também precisou entrar no `hasOnly([...])` da regra de
update do tenant — sem isso, toda escrita do corretor passaria a ser
rejeitada.

Tudo é query direta no Firestore do navegador (`isTeam()` já libera
`list`/`query` em `brokers/*`), sem Cloud Function de agregação —
suficiente pro volume atual. **Ponto de revisão**: quando `brokers`
passar de ~500-1000 docs, ler a collection inteira no client deixa de
escalar; aí vale um `onSchedule` diário gravando um snapshot agregado
em `metrics_daily/{data}` e o painel passa a ler só esse doc. A leitura
de `analytics_visits` já tem teto (`MAX_VISITAS`, 10k — que é o máximo
que o Firestore aceita em `limit()`, pedir mais faz a query falhar) e avisa na tela
quando trunca.

### Contatos gerados (`logEvento` + `analytics_events`)

Antes disso, o produto media só **esforço** (imóveis cadastrados, site
publicado) e nunca **resultado**. Todo contato do catálogo público sai
por link externo — `wa.me`, `mailto:`, Instagram — e desaparecia: não
existe formulário na página, e `leads`/`leads_imovel` nas rules são
resquício do template antigo, ninguém escreve neles. Ou seja, nem o
corretor nem a equipe sabia se o Sitemob tinha gerado um negócio.

`site-assets/js/eventos.js` registra o clique e chama `logEvento`
(`functions/analytics.js`), que grava em `analytics_events/` e
incrementa contadores no doc do broker.

**É clique, não contato confirmado.** Abrir o WhatsApp não é enviar
mensagem — parte das pessoas desiste ali. Por isso o contador se chama
`contatosCliques` e não `contatos`, e o painel interno mostra "pessoas"
(deduplicado por visitante + tenant + dia) ao lado dos cliques: se
algum desses números virar copy de marketing, tem que ser o de pessoas,
e ainda assim ele é um teto. O número honesto de verdade viria de um
formulário — que num mercado WhatsApp-first é atrito que derrubaria a
conversão, então a escolha aqui foi consciente.

Decisões que valem registrar:

- **Listener delegado no `document`, em fase de captura**, em vez de
  wiring botão a botão: os CTAs são vários (nav, hero, rodapé, botão de
  cada imóvel no modal, página de empreendimento) e alguns nascem dentro
  de `innerHTML` depois. Captura garante o registro antes de qualquer
  `stopPropagation` e antes de a navegação levar a aba embora;
  `keepalive` no fetch cobre o resto.
- **Nada é contado em modo preview** (`?preview=1`, o iframe de
  `meu-site.html`) — senão o corretor inflaria o próprio número testando
  o site.
- **Origem validada contra o tenant**: o catálogo roda em
  `<tenant>.sitemob.app` *ou* no domínio próprio do corretor, então não
  dá pra fixar uma lista de origens como em `logVisita`. `logEvento`
  compara o `Origin` com o subdomínio do tenant ou com o `customDomain`
  cadastrado. Isso barra inflação acidental e cross-site pelo navegador;
  **não** barra um script com `Origin` forjado — pra isso a resposta
  seria App Check ou rate limit, não uma checagem melhor de header.
- **Contador desnormalizado no doc do broker**
  (`usage.contatosCliques`, `usage.contatosPorMes.{YYYY-MM}`,
  `usage.contatoUltimoEm`) pra o dashboard do corretor mostrar o número
  sem query nenhuma — e sem precisar dar a ele acesso de leitura a
  `analytics_events`, que tem evento de todos os tenants.
- **Coleção genérica** (`{ tenantId, tipo, visitorId, imovelId,
  paginaId, origem, ts }`) e não uma "whatsapp_clicks": tipo novo
  (compartilhar, ver imóvel) entra sem pipeline novo.

⚠️ **Armadilha do Admin SDK, aprendida aqui:** `set({'a.b': valor})`
**não** cria `a.b` aninhado — cria um campo de nome literal `"a.b"` no
topo do doc. Só `update()` interpreta ponto como caminho (ver o
comentário "We don't split on dots" em
`@google-cloud/firestore/build/src/document.js`). Era exatamente esse o
bug em `webhook.js`: `set({'usage.paginasCompradas': increment(1)})`
nunca creditava a Página de Empreendimento comprada, porque
`paginas.js` lê `broker?.usage?.paginasCompradas`. Corrigido pra
`update()` com `FieldPath` explícito — que também é o único jeito de
endereçar um segmento como `2026-08`, que não é identificador válido
num caminho escrito como string.

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
                              do Sitemob, não é o tema por broker
  css/shell.css            ← sidebar + topbar do app shell, ver seção acima
  css/tokens.css           ← "assado" a partir de template/css/tokens.css: mesmos
                              {{CLR_PRIMARY}}/{{CLR_ACCENT}}/etc. de sempre, só que
                              resolvidos 1x pra cores fixas do Sitemob (não há
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
  js/product-tour.js       ← tour guiado pós-dashboard, chamado de dentro do
                              initShell() de shell.js — ver seção "App shell" acima
  js/admin-imoveis.js      ← CRUD de imóveis, portado de
                              template/js/admin-imoveis.js: mesma compressão de
                              fotos (canvas → WebP/JPEG, máx 900px, sem Storage),
                              caminhos trocados pra brokers/{tenantId}/imoveis/...
  js/atribuicao.js          ← guarda o ?vid=/utm_* que a landing carimba nos CTAs
                              (first-touch em localStorage — sobrevive ao desvio
                              por login.html), lido por criarConta no signup
  interno-metricas.html     ← painel de KPIs DA EQUIPE (não do corretor), com
  js/interno-metricas.js       js/equipe.js (allowlist client-side) e css/interno.css
  js/equipe.js                 próprios — ver seção "Painel interno" acima
  css/interno.css
  js/<pagina>.js            ← um arquivo por página, mesmo padrão do template/ antigo
functions/
  admin.js                 ← app default do Firebase Admin, inicializado 1x
  analytics.js              ← logVisita: beacon de topo de funil chamado pela
                               landing, única fonte de "quantas visitas o site
                               teve" — ver seção "Painel interno" acima
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
├─ usage: { imoveisCount, imoveisUpdatedAt, paginasCompradas,
│           contatosCliques, contatosPorMes: { 'YYYY-MM': n },
│           contatoUltimoEm }
│                                       ← contatos* são novos: cliques
│                                        nos botões de contato do
│                                        catálogo, incrementados só por
│                                        logEvento (Admin SDK). Ver
│                                        seção "Contatos gerados"
│                                       ← paginasCompradas é novo — crédito de
│                                        Páginas de Empreendimento pagas, só o
│                                        stripeWebhook incrementa (Admin SDK)
├─ customDomain: string | null        ← novo — domínio conectado (ver dominio.html),
│                                        só gravado pelas Cloud Functions de
│                                        functions/dominio.js, nunca pelo client
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
├─ language: 'es' | 'pt' | 'en'               ← novo — meu-site.html, padrão 'es'
├─ gtmId: string                              ← novo — meu-site.html (Google Tag
│                                              Manager), formato "GTM-XXXXXXX" ou
│                                              vazio, injetado no site público
│                                              (site/js/imoveis.js), nunca no preview
├─ acquisitionVisitorId, acquisitionSessionId: string | null
│                                             ← novo — de qual visita da landing
│                                              veio esse cadastro (?vid= carimbado
│                                              nos CTAs). Casa com
│                                              analytics_visits.visitorId
├─ acquisitionUtmSource, acquisitionUtmMedium, acquisitionUtmCampaign
│                                             ← novo — canal de aquisição espelhado
│                                              do utm_* da URL, gravado 1x no signup
├─ lastActiveAt: timestamp                    ← novo — "o corretor apareceu",
│                                              carimbado por shell.js a cada
│                                              abertura do painel (no máx. 1x a
│                                              cada 12h). NÃO confundir com
│                                              updatedAt, que é "o corretor
│                                              editou algo" — por isso são campos
│                                              separados e escritos separados
├─ activatedAt, canceledAt, statusChangedAt   ← novo — carimbos de transição de
│                                              assinatura, gravados só pelo
│                                              stripeWebhook e só quando o status
│                                              MUDA de verdade. activatedAt é a
│                                              PRIMEIRA conversão a pagante (uma
│                                              reativação não sobrescreve)
├─ createdAt, updatedAt
├─ purchases/{id}                    ← igual ao antigo, sem mudança de schema
├─ statusHistory/{id}                ← NOVO — { de, para, at }, append-only, uma
│                                        linha por mudança real de status da
│                                        assinatura. Só o stripeWebhook escreve
│                                        (rules negam write pra todo mundo). É o
│                                        que torna churn calculável depois —
│                                        ninguém lê ainda
├─ imoveis/{id}                      ← NOVO: era top-level no projeto do broker,
│   └─ fotos/{id}                       agora aninhado sob o tenant (mesma forma)
└─ paginas/{id}                      ← NOVO — Páginas de Empreendimento, ver
                                         seção própria acima. nome, estagio,
                                         previsaoEntrega, unidadesDisponiveis,
                                         cidade, bairro, endereco, valorDesde,
                                         tourUrl, descricao, comodidades[],
                                         capa (dataURL, sem subcoleção de fotos),
                                         publicada: boolean
```

Fora de `brokers/*`, porque não é dado de tenant nenhum — é dado do
Sitemob (ver seção "Painel interno de KPIs"):

```
analytics_visits/{id}                // um doc por pageview da landing
├─ visitorId                         ← localStorage, persiste entre sessões;
│                                      é o que casa com brokers.acquisitionVisitorId
├─ sessionId                         ← sessionStorage, morre com a aba
├─ ts                                ← hora do servidor (a function grava)
├─ path, referrer, referrerHost      ← referrerHost já vem sem "www.", é por ele
│                                      que a tabela de canais agrupa
├─ utmSource, utmMedium, utmCampaign, utmTerm, utmContent
├─ lang, dispositivo                 ← dispositivo: 'mobile' | 'desktop', do UA.
│                                      Nem UA inteiro nem IP são guardados —
│                                      nada aqui precisa identificar uma pessoa
└─ novoVisitante, novaSessao: bool   ← "primeiro pageview desse id"; o painel hoje
                                       conta por Set, mas com volume alto esses
                                       flags viram a base de um agregado barato
```

```
analytics_events/{id}                // um doc por clique de contato no
                                     // catálogo de um corretor
├─ tenantId                          ← de quem é o catálogo (validado contra o
│                                      Origin da requisição, ver logEvento)
├─ tipo: 'whatsapp' | 'email' | 'instagram' | 'telefone'
├─ visitorId                         ← por SITE (cada catálogo tem seu próprio
│                                      storage de origem) — não tem relação com
│                                      o visitorId da landing e não dá pra ligar
│                                      os dois. Serve só pra separar "10 cliques"
│                                      de "10 pessoas" dentro do mesmo site
├─ ts, dispositivo
├─ imovelId | null                   ← preenchido pelo botão do modal de detalhe
├─ paginaId | null                   ← Página de Empreendimento (produto pago
│                                      à parte — dá pra medir o retorno dela)
└─ origem                            ← id do CTA (nav/cta/footer/emp-whatsapp)
                                       ou 'detalhe'
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

Já tem lugar reservado no dropdown de avatar do app shell (item visível, mas
cai em `em-breve.html` — não é link morto, é honesto sobre o status):

- **Meu perfil / Configurações** (dropdown do avatar) — edição de dados da
  conta, ainda não construído.

⚠️ Domínio próprio (`dominio.html`) já está construído e ligado no menu — ver
seção própria acima — mas segue sem testar contra um domínio de verdade.
Checkout/Stripe também segue sem teste ponta a ponta — ver aviso no topo
deste README e o checklist em "Setup".
