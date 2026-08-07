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

## ✅ Menu mobile em dois níveis — implementado, ainda não testado num aparelho real

Pedido do usuário atendido logo depois desse resumo ter sido escrito:
bottombar (`.admin-bottombar`, só ícone, só os 4 itens `primary`) +
hambúrguer no canto superior esquerdo da topbar (`.admin-topbar__hamburger`)
que abre a sidebar completa como drawer (`.admin-sidebar.is-open`,
`transform: translateX(0)`, com `.admin-drawer-backdrop` escurecendo o
fundo). Detalhes completos no `README.md`, seção "App shell (pós-login)".

`node --check` passou em `shell.js`, brace-balance conferido em
`shell.css`, cross-reference de IDs internos do shell.js conferido —
mas **nada disso substitui testar num celular de verdade**: abrir o
hambúrguer, fechar pelo backdrop/Escape, navegar por um item da
bottombar e por um item só-no-drawer (Leads/Domínio/Plano — Plano é
primary e também está no drawer, então dá pra comparar os dois
caminhos pro mesmo destino).

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

1. Deployar e testar o commit `a59a760` (Meu Site v2) — é o maior
   pedaço de código ainda não validado contra infra real.
2. Testar o menu mobile (bottombar + drawer) num aparelho de verdade —
   código já está pronto, só falta essa validação.
3. Só depois disso, considerar o backlog (Leads é provavelmente o mais
   valioso a seguir, já que schema/rules já existem).
