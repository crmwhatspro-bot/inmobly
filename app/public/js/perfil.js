// ════════════════════════════════════════════════
// perfil.html — cadastro do próprio corretor: nome, telefone, e-mail
// de contato e dados cadastrais (documento, registro, cidade/país).
//
// É o "quem é esse cliente", não o "como o site dele aparece": tudo
// que é conteúdo público (nome da empresa, WhatsApp do catálogo, logo,
// cor) continua em meu-site.html.
//
// ⚠️  Três e-mails diferentes convivem em brokers/{tenantId}, e trocar
// um pelo outro vaza dado ou quebra o login:
//   · email        — o do login (Google), gravado por criarConta.js.
//                    Read-only aqui e nas rules; só é EXIBIDO.
//   · accountEmail — este formulário. Privado: por onde a gente fala
//                    com o corretor. Nunca entra em perfilPayload.js.
//   · contactEmail — meu-site.html. PÚBLICO, aparece no catálogo.
// O campo daqui já vem preenchido com o e-mail do login justamente
// porque é privado; fazer isso com contactEmail publicaria o Gmail
// pessoal do corretor no site dele.
// ════════════════════════════════════════════════
import { db } from './firebase.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initShell, rotuloPlano } from './shell.js';

const $ = (id) => document.getElementById(id);

// Conta (leitura)
const avatarEl     = $('pfAvatar');
const contaNomeEl  = $('pfContaNome');
const contaEmailEl = $('pfContaEmail');
const siteEl       = $('pfSite');
const planoEl      = $('pfPlano');
const desdeEl      = $('pfDesde');
const empresaEl    = $('pfEmpresa');

// Formulário
const nomeInput     = $('pf-nome');
const telefoneInput = $('pf-telefone');
const emailInput    = $('pf-email');
const emailHint     = $('pfEmailHint');
const atuacaoInput  = $('pf-atuacao');
const docTipoInput  = $('pf-doc-tipo');
const docNumInput   = $('pf-doc-numero');
const registroInput = $('pf-registro');
const cidadeInput   = $('pf-cidade');
const paisInput     = $('pf-pais');
const msgEl         = $('pfMsg');
const salvarBtn     = $('pfSalvarBtn');

let tenantId = null;
let broker = null;

function mostrarMsg(texto, tipo) {
  msgEl.textContent = texto;
  msgEl.className = 'imv-form-msg imv-form-msg--' + tipo;
  msgEl.hidden = false;
}

const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function preencherConta(user, broker) {
  avatarEl.innerHTML = user.photoURL
    ? `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer">`
    : iniciais(broker?.ownerName || user.displayName || user.email);

  contaNomeEl.textContent = broker?.ownerName || user.displayName || 'Minha conta';
  contaEmailEl.textContent = user.email || '—';

  siteEl.textContent = `${tenantId}.sitemob.app`;
  planoEl.textContent = rotuloPlano(broker);
  empresaEl.textContent = broker?.name || '—';

  // createdAt pode ser Timestamp do Firestore (contas criadas pela
  // function) ou já um Date — daí o toDate opcional.
  const criado = broker?.createdAt?.toDate?.() ?? (broker?.createdAt ? new Date(broker.createdAt) : null);
  desdeEl.textContent = criado && !Number.isNaN(criado.getTime())
    ? criado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
}

// Só o suficiente pra pegar erro de digitação óbvio — quem valida de
// verdade é o e-mail chegar (ou não).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function salvar() {
  const nome = nomeInput.value.trim();
  const telefone = telefoneInput.value.trim();
  const email = emailInput.value.trim();

  if (!nome) {
    mostrarMsg('Informe seu nome completo.', 'erro');
    nomeInput.focus();
    return;
  }
  // Conta os dígitos, não o comprimento: "+595 981 123456" tem espaços
  // e sinal, e nenhum deles é telefone.
  if (telefone.replace(/\D/g, '').length < 8) {
    mostrarMsg('Informe um telefone válido, com código do país.', 'erro');
    telefoneInput.focus();
    return;
  }
  if (email && !EMAIL_REGEX.test(email)) {
    mostrarMsg('Esse e-mail não parece válido.', 'erro');
    emailInput.focus();
    return;
  }

  salvarBtn.disabled = true;
  const textoOriginal = salvarBtn.textContent;
  salvarBtn.textContent = 'Salvando...';
  try {
    const dados = {
      ownerName: nome,
      contactPhone: telefone,
      accountEmail: email,
      businessType: atuacaoInput.value,
      documentType: docTipoInput.value,
      documentId: docNumInput.value.trim(),
      licenseId: registroInput.value.trim(),
      city: cidadeInput.value.trim(),
      country: paisInput.value,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'brokers', tenantId), dados);
    Object.assign(broker, dados);
    mostrarMsg('Perfil salvo.', 'ok');

    // O nome do menu da conta vem do broker — sem isso, o topo e a
    // sidebar só mostrariam o nome novo no próximo carregamento (a
    // navegação SPA não remonta o shell).
    const menuNome = document.getElementById('shellUserName');
    if (menuNome) menuNome.textContent = nome;
    contaNomeEl.textContent = nome;
  } catch (err) {
    mostrarMsg('Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarBtn.disabled = false;
    salvarBtn.textContent = textoOriginal;
  }
}

salvarBtn.addEventListener('click', salvar);

// active: null — o perfil mora no menu da conta (topbar), não na
// sidebar, então nenhum item do menu lateral fica marcado.
initShell({ active: null, title: 'Dados do perfil' }).then((resultado) => {
  ({ tenantId, broker } = resultado);
  const { user } = resultado;

  preencherConta(user, broker);

  // Primeira visita: o e-mail da conta ainda não existe, então já entra
  // preenchido com o do login (é o que o corretor usaria de qualquer
  // forma) — mas só é gravado quando ele clicar em salvar.
  const emailJaSalvo = !!broker.accountEmail;
  nomeInput.value     = broker.ownerName || user.displayName || '';
  telefoneInput.value = broker.contactPhone || '';
  emailInput.value    = broker.accountEmail || user.email || '';
  atuacaoInput.value  = broker.businessType || '';
  docTipoInput.value  = broker.documentType || '';
  docNumInput.value   = broker.documentId || '';
  registroInput.value = broker.licenseId || '';
  cidadeInput.value   = broker.city || '';
  paisInput.value     = broker.country || '';

  if (emailJaSalvo) {
    emailHint.textContent = 'Só a gente usa este e-mail — o que aparece no seu site público fica em Meu Site.';
  }
});
