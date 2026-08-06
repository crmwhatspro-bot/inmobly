#!/usr/bin/env node
/* ================================================
   BUILD — gera o site de um corretor a partir do template
   Uso: node scripts/build.js brokers/<slug>.config.json [--force]
   Saída: dist/<slug>/ pronto para `firebase deploy`
   Sem dependências npm — apenas Node nativo (fs/path).
   ================================================ */

const fs   = require('fs');
const path = require('path');

const RAIZ     = path.join(__dirname, '..');
const TEMPLATE = path.join(RAIZ, 'template');

// extensões tratadas como texto (recebem substituição de placeholders)
const EXT_TEXTO = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.rules', '.md']);
// arquivos sem extensão tratados como texto
const NOME_TEXTO = new Set(['.firebaserc']);

// ── CLI ────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes('--force');
const configPath = args.find(a => !a.startsWith('--'));

if (!configPath) {
  console.error('Uso: node scripts/build.js brokers/<slug>.config.json [--force]');
  process.exit(1);
}

// ── Ler config (com strip de BOM do Windows) ───
let config;
try {
  const raw = fs.readFileSync(path.resolve(configPath), 'utf8').replace(/^\uFEFF/, '');
  config = JSON.parse(raw);
} catch (e) {
  console.error(`Erro ao ler config "${configPath}": ${e.message}`);
  process.exit(1);
}

// ── Validação ──────────────────────────────────
const erros = [];
const get = (obj, caminho) => caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const exigir = (caminho, regex, msg) => {
  const v = get(config, caminho);
  if (!v || typeof v !== 'string' || (regex && !regex.test(v))) {
    erros.push(`${caminho}: ${msg}`);
  }
  return v;
};

exigir('broker.name', null, 'nome completo do corretor é obrigatório');
exigir('broker.firstName', null, 'primeiro nome é obrigatório');
const slug = exigir('broker.slug', /^[a-z0-9-]+$/, 'slug obrigatório, só letras minúsculas, números e hífen');
exigir('site.domain', /^https:\/\/[^/]+$/, 'domínio obrigatório no formato https://exemplo.com.py (sem barra final)');
exigir('contact.whatsapp', /^595\d{8,9}$/, 'WhatsApp obrigatório: só dígitos com DDI 595 (ex.: 595981123456)');
exigir('admin.email', /^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'e-mail (conta Google) do admin é obrigatório');
exigir('theme.primary', /^#[0-9a-fA-F]{6}$/, 'cor primária obrigatória em hex de 6 dígitos');
exigir('theme.accent', /^#[0-9a-fA-F]{6}$/, 'cor accent obrigatória em hex de 6 dígitos');
for (const campo of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
  exigir(`firebase.${campo}`, null, 'obrigatório (Firebase Console → Configurações do projeto)');
}

const langPadrao = get(config, 'site.defaultLang') || 'pt';
if (!['pt', 'es', 'en'].includes(langPadrao)) erros.push('site.defaultLang: deve ser pt, es ou en');

if (erros.length) {
  console.error('Config inválido:\n  - ' + erros.join('\n  - '));
  process.exit(1);
}

// ── Derivações ─────────────────────────────────
const hexParaRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbParaHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
// mistura a cor com preto (fator<0) ou branco (fator>0)
const misturar = (hex, fator) => {
  const alvo = fator < 0 ? 0 : 255;
  const f = Math.abs(fator);
  return rgbParaHex(hexParaRgb(hex).map(v => v + (alvo - v) * f));
};

const primary = config.theme.primary;
const accent  = config.theme.accent;
const fontDisplay = config.theme.fontDisplay || 'Plus Jakarta Sans';
const fontBody    = config.theme.fontBody    || 'DM Sans';

const fontsUrl = 'https://fonts.googleapis.com/css2'
  + `?family=${fontDisplay.replace(/ /g, '+')}:wght@600;700;800`
  + `&family=${fontBody.replace(/ /g, '+')}:wght@400;500`
  + '&family=JetBrains+Mono:wght@700&display=swap';

// cidade nos 3 idiomas — string única vale para todos
const cidade = config.site.cityDefault || 'Assunção';
const cidadePT = typeof cidade === 'string' ? cidade : (cidade.pt || 'Assunção');
const cidadeES = typeof cidade === 'string' ? cidade : (cidade.es || cidadePT);
const cidadeEN = typeof cidade === 'string' ? cidade : (cidade.en || cidadeES);

const primeiroNome = config.broker.firstName;
const waHome    = get(config, 'contact.waTextHome')    || `Olá ${primeiroNome}, quero saber mais sobre os imóveis!`;
const waImoveis = get(config, 'contact.waTextImoveis') || waHome;

// pendências de conteúdo (campos opcionais vazios viram [PREENCHER: ...])
const pendencias = [];
const ouPreencher = (valor, rotulo) => {
  if (valor && String(valor).trim()) return String(valor).trim();
  pendencias.push(rotulo);
  return `[PREENCHER: ${rotulo}]`;
};

const stats = get(config, 'texts.stats') || {};
const bio   = get(config, 'texts.bio') || {};
const depos = get(config, 'texts.testimonials') || [];

// ── Mapa de placeholders ───────────────────────
const valores = {
  BROKER_NAME:       config.broker.name,
  BROKER_FIRST_NAME: primeiroNome,
  SLUG:              slug,
  DOMAIN:            config.site.domain,
  CITY_DEFAULT:      cidadePT,
  CITY_DEFAULT_ES:   cidadeES,
  CITY_DEFAULT_EN:   cidadeEN,
  DEFAULT_LANG:      langPadrao,
  WHATSAPP:          config.contact.whatsapp,
  WA_TEXT_HOME_ENC:    encodeURIComponent(waHome),
  WA_TEXT_IMOVEIS_ENC: encodeURIComponent(waImoveis),
  ADMIN_EMAIL:       config.admin.email,
  CONTACT_EMAIL:     get(config, 'contact.email') || '',
  INSTAGRAM_URL:     get(config, 'contact.instagram') || '',
  FACEBOOK_URL:      get(config, 'contact.facebook') || '',

  CLR_PRIMARY:        primary,
  CLR_PRIMARY_DARK:   misturar(primary, -0.35),
  CLR_PRIMARY_LIGHT:  misturar(primary, 0.25),
  CLR_PRIMARY_RGB:    hexParaRgb(primary).join(','),
  CLR_ACCENT:         accent,
  CLR_ACCENT_DARK:    misturar(accent, -0.20),
  CLR_ACCENT_LIGHT:   misturar(accent, 0.15),
  CLR_ACCENT_RGB:     hexParaRgb(accent).join(','),

  FONT_DISPLAY:  fontDisplay,
  FONT_BODY:     fontBody,
  FONTS_CSS_URL: fontsUrl,

  FB_API_KEY:        config.firebase.apiKey,
  FB_AUTH_DOMAIN:    config.firebase.authDomain,
  FB_PROJECT_ID:     config.firebase.projectId,
  FB_STORAGE_BUCKET: config.firebase.storageBucket,
  FB_SENDER_ID:      config.firebase.messagingSenderId,
  FB_APP_ID:         config.firebase.appId,
  FB_MEASUREMENT_ID: config.firebase.measurementId || '',

  V:    String(Date.now()),
  YEAR: String(new Date().getFullYear()),

  STATS_YEARS: ouPreencher(stats.years, 'anos de experiência (texts.stats.years)'),
  STATS_DEALS: ouPreencher(stats.deals, 'negócios fechados (texts.stats.deals)'),
  BIO_PT: ouPreencher(bio.pt, 'bio do corretor em português (texts.bio.pt)'),
  BIO_ES: ouPreencher(bio.es, 'bio do corretor em espanhol (texts.bio.es)'),
  BIO_EN: ouPreencher(bio.en, 'bio do corretor em inglês (texts.bio.en)'),
};

for (let n = 1; n <= 3; n++) {
  const d = depos[n - 1] || {};
  valores[`TESTIMONIAL_${n}_NAME`]    = ouPreencher(d.name, `nome do depoimento ${n}`);
  valores[`TESTIMONIAL_${n}_ORIGIN`]  = ouPreencher(d.origin, `origem do depoimento ${n}`);
  valores[`TESTIMONIAL_${n}_TEXT_PT`] = ouPreencher(d.text && d.text.pt, `texto pt do depoimento ${n}`);
  valores[`TESTIMONIAL_${n}_TEXT_ES`] = ouPreencher(d.text && d.text.es, `texto es do depoimento ${n}`);
  valores[`TESTIMONIAL_${n}_TEXT_EN`] = ouPreencher(d.text && d.text.en, `texto en do depoimento ${n}`);
}

// blocos <!-- IF:X --> ... <!-- ENDIF:X --> removidos quando o valor é vazio
const CONDICIONAIS = ['CONTACT_EMAIL', 'INSTAGRAM_URL', 'FACEBOOK_URL'];

// em arquivos .js os valores entram dentro de strings — escapar aspas e quebras de linha
const escaparJs = (v) => String(v)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/"/g, '\\"')
  .replace(/\r?\n/g, '\\n');

// ── Substituição (split/join — imune a $& e regex) ──
function aplicarPlaceholders(texto, ehJs) {
  for (const chave of CONDICIONAIS) {
    const ini = `<!-- IF:${chave} -->`;
    const fim = `<!-- ENDIF:${chave} -->`;
    if (!texto.includes(ini)) continue;
    if (valores[chave]) {
      texto = texto.split(ini).join('').split(fim).join('');
    } else {
      // remove o bloco inteiro
      const partes = texto.split(ini);
      texto = partes[0] + partes.slice(1).map(p => {
        const i = p.indexOf(fim);
        return i === -1 ? p : p.slice(i + fim.length);
      }).join('');
    }
  }
  for (const [chave, valor] of Object.entries(valores)) {
    texto = texto.split(`{{${chave}}}`).join(ehJs ? escaparJs(valor) : valor);
  }
  return texto;
}

// ── Copiar árvore do template ──────────────────
const destino = path.join(RAIZ, 'dist', slug);
if (fs.existsSync(destino)) {
  if (!force) {
    console.error(`dist/${slug} já existe. Use --force para sobrescrever.`);
    process.exit(1);
  }
  fs.rmSync(destino, { recursive: true, force: true });
}

const ehTexto = (arquivo) =>
  EXT_TEXTO.has(path.extname(arquivo).toLowerCase()) || NOME_TEXTO.has(path.basename(arquivo));

function copiar(origem, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const de = path.join(origem, item.name);
    const para = path.join(dest, item.name);
    if (item.isDirectory()) {
      copiar(de, para);
    } else if (ehTexto(item.name)) {
      const conteudo = fs.readFileSync(de, 'utf8').replace(/^\uFEFF/, '');
      const ehJs = path.extname(item.name).toLowerCase() === '.js';
      fs.writeFileSync(para, aplicarPlaceholders(conteudo, ehJs), 'utf8'); // utf8 sem BOM
    } else {
      fs.copyFileSync(de, para);
    }
  }
}

copiar(TEMPLATE, destino);

// foto do corretor (opcional)
const foto = get(config, 'broker.photo');
if (foto && String(foto).trim()) {
  const origemFoto = path.resolve(path.dirname(path.resolve(configPath)), foto);
  if (fs.existsSync(origemFoto)) {
    fs.copyFileSync(origemFoto, path.join(destino, 'img', 'corretor-1.webp'));
  } else {
    pendencias.push(`foto do corretor não encontrada em "${origemFoto}" — mantida imagem genérica`);
  }
} else {
  pendencias.push('foto do corretor (broker.photo) — mantida imagem genérica');
}

// ── Pós-validação ──────────────────────────────
const problemas = [];
function varrer(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) { varrer(p); continue; }
    if (!ehTexto(item.name)) continue;
    const conteudo = fs.readFileSync(p, 'utf8');
    const rel = path.relative(destino, p);
    const m = conteudo.match(/\{\{[A-Z0-9_]+\}\}/);
    if (m) problemas.push(`${rel}: placeholder não resolvido ${m[0]}`);
    // "fernando" (cidade Fernando de la Mora) é legítimo — lookbehind exclui
    if (/(?<!fer)nando/i.test(conteudo)) problemas.push(`${rel}: contém referência a "nando"`);
    if (/nobile/i.test(conteudo))        problemas.push(`${rel}: contém referência a "nobile"`);
    if (/595XXXXXXXXX/i.test(conteudo))  problemas.push(`${rel}: contém WhatsApp placeholder antigo`);
  }
}
varrer(destino);

if (problemas.length) {
  console.error('\nBUILD FALHOU — conteúdo proibido ou placeholder órfão:\n  - ' + problemas.join('\n  - '));
  fs.rmSync(destino, { recursive: true, force: true });
  process.exit(1);
}

// ── Relatório ──────────────────────────────────
console.log(`\n✔ Site gerado em dist/${slug}`);
console.log(`  Projeto Firebase: ${config.firebase.projectId}`);
console.log(`  Domínio: ${config.site.domain}`);
if (pendencias.length) {
  console.log('\n⚠ Pendências de conteúdo ([PREENCHER] no site gerado):');
  for (const p of pendencias) console.log(`  - ${p}`);
}
console.log(`\nPróximos passos:\n  cd dist/${slug}\n  firebase use ${config.firebase.projectId}\n  firebase deploy\n`);
