# PAIm — Punto Alto Imóveis

Template white-label para corretores de imóveis de Assunção e região, extraído do projeto Nando Barros. Cada corretor recebe um site estático próprio (HTML/CSS/JS puro, sem frameworks) com:

- **Home** (`index.html`) — hero, destaques do catálogo, por que escolher o corretor, sobre, depoimentos, FAQ, formulário de leads e WhatsApp em todo lugar
- **Catálogo** (`imoveis.html`) — listagem com filtros (operação, tipo, cidade, quartos, busca + modal de filtros avançados) e modal de detalhe com galeria; conteúdo vem do Firestore
- **Painel admin** (`/admin`) — login Google, aba Leads e CMS de imóveis (CRUD com compressão de fotos no navegador — sem Firebase Storage, funciona no plano Spark gratuito)
- **i18n** — português, espanhol e inglês com troca ao vivo
- Deploy via **Firebase Hosting**; um projeto Firebase **por corretor** (dados isolados, plano gratuito)

## Estrutura

```
template/        ← fonte com placeholders {{ASSIM}} — NUNCA deployar daqui
brokers/         ← um .config.json por corretor (copiar do broker.config.example.json)
scripts/build.js ← gera o site: lê o config, substitui os placeholders, valida
dist/<slug>/     ← site gerado, pronto para `firebase deploy` (não versionado)
```

## Como gerar o site de um corretor

```bash
# 1. copiar e preencher o config
cp brokers/broker.config.example.json brokers/joao-silva.config.json

# 2. gerar
node scripts/build.js brokers/joao-silva.config.json

# 3. deployar (ver SETUP.md para o passo a passo completo do Firebase)
cd dist/joao-silva
firebase use <projectId>
firebase deploy
```

O build **falha** se sobrar placeholder não resolvido ou qualquer referência ao projeto original (nando/nobile). Campos opcionais vazios (bio, depoimentos, stats, foto) viram `[PREENCHER: ...]` no site e são listados no fim do build — o site funciona, mas publique só depois de preencher.

O que o build deriva automaticamente:

- Variações de cor (`dark`, `light`, `ghost`, `glow` e o RGB das sombras) a partir de `theme.primary` e `theme.accent`
- URL do Google Fonts a partir de `theme.fontDisplay`/`fontBody`
- Texto dos links `wa.me` com URL-encoding (escreva texto puro no config)
- Versão de cache (`?v=`) dos JS/CSS — novo build = nova versão, sem editar HTML
- Escape de aspas ao injetar textos dentro dos arquivos `.js`

## Teste rápido

`brokers/exemplo.config.json` tem uma corretora fictícia ("Maria Benítez", cores verde/âmbar — diferentes do projeto original de propósito, para flagrar qualquer hardcode visual):

```bash
node scripts/build.js brokers/exemplo.config.json --force
```

Sirva `dist/exemplo` com qualquer servidor estático para conferir o visual. Sem um projeto Firebase real o catálogo mostra o estado de erro/vazio — esperado.

## Regras herdadas do projeto original

1. Mobile-first; `prefers-reduced-motion` tratado em `animations.css`
2. FAB de WhatsApp visível em todas as páginas
3. Efeito torch só desktop (`'ontouchstart' in window` desabilita)
4. Imagens com `loading="lazy"` e dimensões definidas; WebP máx. 900px
5. Comentários de código em português, atributos HTML em inglês
6. A tag `<script>` do `js/firebase.js` fica **sem** `?v=` — versionar só a tag criaria duas instâncias do módulo (erro `app/duplicate-app`)
7. A lista `COMODIDADES` em `js/imoveis.js` deve ficar em sincronia com os chips `#imv-comodidades` em `admin/index.html`

## Manutenção do template

Alterações de comportamento/estilo são feitas **em `template/`** e regeradas para todos os corretores (rodar o build de cada config com `--force` e redeployar). Nunca edite `dist/` à mão.

## Regras de negócio

Planos, limites de trial, moeda/gateway de pagamento e produtos avulsos (incluindo a
"Página de Emprendimento" bespoke) estão documentados em
[`docs/REGRAS-DE-NEGOCIO.md`](docs/REGRAS-DE-NEGOCIO.md). Qualquer mudança em limite
de plano ou preço deve ser refletida lá antes de virar código.

## Página de Emprendimento (produto avulso, estilo Nobile Inn)

Landing page bespoke por projeto, vendida à parte da assinatura (ver regras de
negócio acima). Antes de montar o design/copy, use
[`tools/prep-emprendimento.html`](tools/prep-emprendimento.html) — ferramenta interna
(não faz parte do site do corretor) que conecta direto no Firestore público do
projeto do broker e:

- **Se o imóvel selecionado já tem fotos no CMS**, baixa todas prontas para reaproveitar na galeria da página bespoke (saem em 900px, o mesmo padrão já usado em produção).
- **Se não tem fotos ainda**, gera e baixa placeholders no tamanho exato de cada seção (hero, galeria, foto do corretor), com a especificação em px gravada na própria imagem — para a equipe saber exatamente o que fotografar/produzir antes de montar a página.

Basta colar o bloco `firebase` do `brokers/<slug>.config.json` na ferramenta — a leitura de `imoveis` e `imoveis/{id}/fotos` é pública nas rules, não precisa de login.
