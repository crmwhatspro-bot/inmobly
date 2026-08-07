# Próxima sessão — onde parei

Resumo de uma sessão longa trabalhando no Inmobly (`app/`). Escrito pra
uma sessão nova do Claude Code, aberta direto nesta pasta, conseguir
continuar sem precisar re-explicar nada. Ver `README.md` pra arquitetura
geral — este arquivo é só "o que aconteceu e o que falta".

## Contexto rápido

Inmobly é o SaaS de site+CMS pra corretores de imóveis do Paraguai
(Punto Alto). Projeto Firebase único (`inmobly-project`, Blaze),
multi-tenant via `brokers/{tenantId}` + custom claim. Jornada completa:
signup → tour → plano → **app shell** (Dashboard, Meus Imóveis, Meu
Site, Leads*, Domínio*, Plano — *ainda stub) → site público por tenant
via Hosting site dedicado (`<slug>.web.app`).

Está em fase de validação — zero assinantes reais ainda, o usuário
(dono do produto) testa cada feature em produção real e reporta erros
de volta, na hora.

## O que foi construído e confirmado funcionando (deploy + teste OK)

Nessa ordem, cada um confirmado pelo usuário antes do próximo:

1. **App shell** — sidebar esquerda (Dashboard/Meus Imóveis/Meu
   Site/Leads/Domínio/Plano) + topbar com dropdown de avatar,
   centralizando auth em `js/shell.js#initShell()`.
2. **Meu Site v1** — configurar WhatsApp + botão "Publicar site".
3. **Publicar site com Hosting real** — `functions/publicarSite.js` cria
   um Hosting site dedicado (`<slug>.web.app`) via REST API e faz o
   deploy de `functions/site-assets/` nele. Testado e funcionando.
4. **Identidade visual + preview** (depois bastante retrabalhado, ver
   abaixo) — logo, nome, cor de destaque, textos do site.
5. **Fix: domínio no texto da UI** — trocado "inmobly.app" por
   "*.web.app" em `criar-conta.html`/`painel.html`/`planos.html` (o
   domínio garantido é o `.web.app`, `inmobly.app` não é um domínio
   próprio configurado).

## ⚠️ Último commit — ainda NÃO confirmado testado/deployado

**Commit `a59a760`** (mensagem: "Rebuild Meu Site: popup preview,
headline/subheadline/about, contact fields, mobile nav fixes") — o
usuário reportou que a v1 do preview/identidade "ficou horrível" (preview
carregava inline e ocupava a tela sem necessidade, layout dos campos
muito colado, faltavam campos de headline/subheadline/sobre/e-
mail/instagram). Esse commit é o retrabalho completo:

- Preview virou popup (botão "Pré-visualizar site" abre modal, iframe só
  recebe `src` no clique).
- Novos campos: `headline`, `subheadline`, `about` (seção "Sobre" antes
  do rodapé), `contactEmail`, `instagramUrl`.
- **Bug real pego antes de ir pro ar**: o campo de e-mail de contato
  tinha sido nomeado `email`, colidindo com `brokers/{tenantId}.email`
  (e-mail de login/conta, setado por `criarConta.js`) — vazaria o
  e-mail privado via `perfilPublico` e sobrescreveria o e-mail da conta
  ao salvar. Renomeado pra `contactEmail` em tudo (rules, function,
  meu-site.js) antes do commit.
- Layout: `.ms-field-stack` (gap entre campos — `.imv-sec__body` não
  tinha gap próprio, por isso "colava"), logo trocou o dropzone gigante
  de fotos por um botão compacto, 3 seções com salvamento próprio
  (Identidade / Textos do site / Contato) em vez de um formulário só.

**Precisa**: `firebase deploy --only hosting,firestore:rules,functions:perfilPublico`
e testar tudo de novo — logo, headline/subheadline, sobre, cor, e-mail
de contato, Instagram, e principalmente o popup de preview.

## 🔧 Em andamento — só desenhado, ZERO código escrito ainda

Pedido do usuário, textual: *"o mobile pode distribuir também o menu
inferior, deixá-lo fixo somente com alguns flat icons, e trabalhar um
menu dropdown de 3 listras no topo esquerdo pras features assim como é
na barra da esquerda no pc."*

Design já fechado, só não implementado (a sessão foi interrompida pra
esse resumo antes de escrever qualquer linha):

- **Bottom bar mobile** fica só com os itens "primary": Dashboard, Meus
  Imóveis, Meu Site, Plano (Leads/Domínio ficam de fora — são só stub
  "Em breve" mesmo, não merecem espaço fixo). Nova classe
  `.admin-bottombar`, markup próprio e mais simples que `.admin-nav`.
- **Hamburger (3 listras) no topo esquerdo** do `.admin-topbar`, visível
  só em mobile (`display:none` no desktop). Abre a **mesma sidebar
  completa do desktop** (logo + todos os 6 itens com label + rodapé
  com Novidades/perfil/plano/uso/Assinar) como um **drawer deslizando
  da esquerda** — não mais convertendo a sidebar inteira numa barra
  inferior compacta, isso vira responsabilidade só da nova bottombar.
- Implica: `.admin-sidebar` no mobile passa a ser `position:fixed; left:0;
  transform:translateX(-100%)`, com uma classe `.is-open` que aplica
  `translateX(0)` + transição. Precisa de um backdrop
  (`.admin-drawer-backdrop`, clique fecha) e de **remover** as
  regras antigas que escondiam `.admin-sidebar__logo`/`.admin-sidebar__foot`
  e que forçavam `.admin-nav` pra `flex-direction:row` — o drawer deve
  parecer com o desktop, não com a bottombar antiga.
- `js/shell.js`: adicionar `primary: true` nos 4 itens do array `NAV`
  correspondentes; nova função `renderBottomBar(active)` gerando a
  bottombar a partir dos itens `primary`; novo botão hamburger dentro de
  `renderTopbar()` (envolver título+hamburger num wrapper, porque
  `.admin-topbar` usa `justify-content:space-between` entre 2 filhos —
  virando 3 quebra isso sem um wrapper); função de toggle do drawer
  (adicionar/remover `.is-open` na sidebar e no backdrop, travar/destravar
  `document.body.style.overflow`); montar bottombar+backdrop via
  `document.body.insertAdjacentHTML('beforeend', ...)` dentro de
  `initShell()`, do jeito que sidebar/topbar já usam mount points.
- Arquivos a mexer: `public/js/shell.js`, `public/css/shell.css` (a
  seção `@media (max-width: 900px)` no final do arquivo é o ponto de
  partida — está bem isolada).

**Antes de fechar isso**: rodar `node --check` no shell.js editado,
conferir que os IDs novos (hamburger, backdrop, bottombar) não colidem
com nada, testar em telas realmente estreitas (~360-390px) antes de
considerar pronto — essa é exatamente a classe de bug que já apareceu
duas vezes nessa área (menu inferior com texto quebrando).

## Backlog conhecido (não urgente, só registrado)

Do `README.md`, seção "O que ainda não existe":
- **Leads** — schema/rules já existem (`brokers/{tenantId}/leads`), sem
  UI.
- **Domínio próprio** — concierge manual por enquanto, sem automação.
- **Meu perfil / Configurações** (dropdown do avatar) — caem em
  `em-breve.html`, sem UI própria ainda.
- **Product tour** — combinado que seria feito depois que a
  interface do app shell fosse validada; ainda não começado.
- **Cota de Hosting sites por projeto** — Firebase limita a quantidade
  de sites por projeto (dezenas). Não é problema agora (zero
  assinantes), mas é uma parede real quando a base crescer — nenhuma
  solução desenhada ainda.
- **`docs/REGRAS-DE-NEGOCIO.md`, seção 1** (custo de infra) — segue
  precisando ser recalculada pro modelo multi-tenant compartilhado, como
  já estava anotado antes dessa sessão.

## Ordem sugerida pra amanhã

1. Deployar e testar o commit `a59a760` (Meu Site v2) antes de mais
   nada — é o maior pedaço de código ainda não validado contra infra
   real.
2. Terminar o menu mobile (bottombar + drawer) com o design já descrito
   acima.
3. Só depois disso, considerar o backlog (Leads é provavelmente o mais
   valioso a seguir, já que schema/rules já existem).
