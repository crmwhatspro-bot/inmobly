# SETUP — Onboarding de um novo corretor

Checklist completo para colocar o site de um corretor no ar. Tempo estimado: ~30 min + DNS.

## 1. Criar o projeto Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → **Adicionar projeto**
2. Nome sugerido: `<slug>-imoveis` (ex.: `joaosilva-imoveis`) — anote o **projectId**
3. Google Analytics: opcional (o site funciona sem; se ativar, o `measurementId` entra no config)
4. Plano **Spark (gratuito)** — o template não usa Storage nem Functions

## 2. Registrar o app Web e copiar o config

1. Visão geral do projeto → ícone **`</>`** (Web) → registrar app (sem Hosting por aqui)
2. Copiar os valores de `firebaseConfig` para o bloco `firebase` do `brokers/<slug>.config.json`

## 3. Firestore

1. Menu **Firestore Database** → **Criar banco de dados**
2. Modo **produção** (as rules vão por deploy), região `southamerica-east1` (São Paulo)

## 4. Authentication (login do admin é com GOOGLE)

1. Menu **Authentication** → **Começar** → ativar provedor **Google**
2. O `admin.email` do config deve ser uma **conta Google** — é ela que loga no `/admin` e é o e-mail autorizado nas `firestore.rules`
3. Em **Authentication → Settings → Authorized domains**: depois de configurar o domínio próprio (passo 8), adicioná-lo aqui — sem isso o popup de login falha no domínio custom

## 5. Preencher o config do corretor

```bash
cp brokers/broker.config.example.json brokers/<slug>.config.json
```

Obrigatórios: nome, primeiro nome, slug, domínio, WhatsApp (`595` + número), e-mail Google do admin, as duas cores e o bloco `firebase`.
Recomendados antes de publicar: foto (3:4, webp), bio nos 3 idiomas, 3 depoimentos, stats (anos/negócios), e-mail de contato e redes.

> Enquanto não houver domínio próprio, use `https://<projectId>.web.app` no campo `site.domain` e regere o build quando o domínio chegar.

## 6. Gerar e deployar

```bash
node scripts/build.js brokers/<slug>.config.json
cd dist/<slug>
firebase login            # uma vez por máquina
firebase use <projectId>
firebase deploy           # hosting + firestore rules/indexes
```

Site no ar em `https://<projectId>.web.app`.

## 7. Cadastrar os primeiros imóveis

1. Abrir `https://<projectId>.web.app/admin` → **Entrar com Google** (conta do `admin.email`)
2. Aba **Imóveis** → **Novo Imóvel** → preencher e salvar 2–3 anúncios
3. Marcar até 3 como **Destaque na home**
4. Conferir `/` (destaques) e `/imoveis` (catálogo, filtros, modal de detalhe)

## 8. Domínio próprio

1. Firebase Console → **Hosting** → **Adicionar domínio personalizado**
2. Criar os registros DNS indicados (A/TXT) no provedor do domínio
3. Aguardar o SSL provisionar; adicionar o domínio em **Authentication → Authorized domains**
4. Atualizar `site.domain` no config → rebuild (`--force`) → `firebase deploy` (atualiza canonical/og/sitemap)

## 9. Teste final

- [ ] Home: hero, destaques carregando, troca de idioma PT/ES/EN, links de WhatsApp com o número certo e mensagem pré-preenchida
- [ ] `/imoveis`: filtros básicos + modal de filtros, detalhe com galeria, CTA de WhatsApp do detalhe
- [ ] Formulário da home: enviar um teste → aparece na aba **Leads** do admin
- [ ] `/admin` com conta Google **errada** → acesso negado (regra do e-mail)
- [ ] Lighthouse/mobile: página responsiva, imagens lazy
- [ ] Nenhum `[PREENCHER:` visível (busque no fonte da página)

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Login Google abre e fecha sem logar | Domínio não está em Authorized domains |
| "Acesso não autorizado" no admin | Conta Google ≠ `admin.email` do config/rules |
| Catálogo vazio com erro no console | Firestore não criado, ou rules não deployadas (`firebase deploy --only firestore:rules`) |
| Site sem analytics | `measurementId` vazio — ok, o site tolera (track vira no-op) |
| Mudou cor/texto e não aparece | Editou `dist/` em vez de `template/`+config, ou faltou rebuild com `--force` |
