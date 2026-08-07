// ════════════════════════════════════════════════
// meu-site.html — configura o whatsapp de contato e publica/
// despublica o catálogo público. Salvar whatsapp é uma escrita
// direta em brokers/{tenantId}.whatsapp; publicar chama a function
// publicarSite (cria o Hosting site <slug>.web.app e faz o deploy
// do catálogo — não é só um flag no Firestore, por isso demora
// alguns segundos e passa por uma function em vez de updateDoc
// direto). Despublicar continua sendo um updateDoc direto — não
// precisa desfazer o deploy, só esconder via published:false (o
// perfilPublico já nega os dados nesse caso).
// ════════════════════════════════════════════════
import { db, auth } from './firebase.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);

const whatsappInput   = $('ms-whatsapp');
const whatsappMsg     = $('msWhatsappMsg');
const salvarWaBtn     = $('msSalvarWhatsappBtn');
const publicarBtn     = $('msPublicarBtn');
const despublicarBtn  = $('msDespublicarBtn');
const verSiteLink     = $('msVerSite');
const statusDot       = $('msStatusDot');
const statusTitulo    = $('msStatusTitulo');
const statusSub       = $('msStatusSub');

const functions = getFunctions(auth.app, 'southamerica-east1');
const publicarSiteFn = httpsCallable(functions, 'publicarSite');

let tenantId = null;
let broker = null;

function mostrarMsg(texto, tipo) {
  whatsappMsg.textContent = texto;
  whatsappMsg.className = 'imv-form-msg imv-form-msg--' + tipo;
  whatsappMsg.hidden = false;
}

function digitsOnly(s) { return String(s || '').replace(/\D/g, '').replace(/^0+/, ''); }

function atualizarUI() {
  whatsappInput.value = broker.whatsapp ? broker.whatsapp.replace(/^595/, '') : '';

  const publicado = broker.published === true;
  statusDot.classList.toggle('is-live', publicado);
  statusTitulo.textContent = publicado ? 'Seu site está publicado' : 'Seu site ainda não está publicado';
  statusSub.textContent = publicado
    ? `Ao vivo em ${tenantId}.web.app — qualquer pessoa com o link já consegue ver.`
    : broker.whatsapp
      ? 'Seu WhatsApp está configurado — clique em publicar quando quiser.'
      : 'Configure seu WhatsApp de contato antes de publicar.';

  publicarBtn.hidden = publicado;
  despublicarBtn.hidden = !publicado;
  verSiteLink.hidden = !publicado;
  if (publicado) verSiteLink.href = `https://${tenantId}.web.app/`;
}

async function salvarWhatsapp() {
  const digitos = digitsOnly(whatsappInput.value);
  if (digitos.length < 8) {
    mostrarMsg('Informe um número válido (pelo menos 8 dígitos).', 'erro');
    return;
  }
  salvarWaBtn.disabled = true;
  salvarWaBtn.textContent = 'Salvando...';
  try {
    const whatsapp = '595' + digitos;
    await updateDoc(doc(db, 'brokers', tenantId), { whatsapp, updatedAt: serverTimestamp() });
    broker.whatsapp = whatsapp;
    mostrarMsg('WhatsApp salvo.', 'ok');
    atualizarUI();
  } catch (err) {
    mostrarMsg('Não foi possível salvar: ' + err.message, 'erro');
  } finally {
    salvarWaBtn.disabled = false;
    salvarWaBtn.textContent = 'Salvar WhatsApp';
  }
}

async function publicar() {
  if (!broker.whatsapp) {
    mostrarMsg('Configure e salve seu WhatsApp antes de publicar.', 'erro');
    return;
  }
  publicarBtn.disabled = true;
  const textoOriginal = publicarBtn.textContent;
  publicarBtn.textContent = 'Publicando... (pode levar alguns segundos)';
  try {
    await publicarSiteFn();
    broker.published = true;
    atualizarUI();
  } catch (err) {
    mostrarMsg('Não foi possível publicar: ' + err.message, 'erro');
  } finally {
    publicarBtn.disabled = false;
    publicarBtn.textContent = textoOriginal;
  }
}

async function despublicar() {
  despublicarBtn.disabled = true;
  try {
    await updateDoc(doc(db, 'brokers', tenantId), { published: false, updatedAt: serverTimestamp() });
    broker.published = false;
    atualizarUI();
  } catch (err) {
    mostrarMsg('Não foi possível despublicar: ' + err.message, 'erro');
  } finally {
    despublicarBtn.disabled = false;
  }
}

salvarWaBtn.addEventListener('click', salvarWhatsapp);
publicarBtn.addEventListener('click', publicar);
despublicarBtn.addEventListener('click', despublicar);

initShell({ active: 'site', title: 'Meu Site' }).then((resultado) => {
  tenantId = resultado.tenantId;
  broker = resultado.broker;
  atualizarUI();
});
