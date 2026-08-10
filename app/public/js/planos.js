// ════════════════════════════════════════════════
// planos.html — status atual da conta, criação da Checkout Session e
// gestão da assinatura que já existe (cancelar, reativar, portal do
// Stripe pra cartão/faturas). Mesma project agora, então as functions
// são onCall (auth automático via SDK, sem o idToken manual que a
// versão antiga do control-plane precisava).
// ════════════════════════════════════════════════
import { auth } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initShell } from './shell.js';
import { trialExpirado, textoRestanteTrial } from './tenant.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('statusAtual');
const msg = $('planosMsg');

const functions = getFunctions(auth.app, 'southamerica-east1');
const criarCheckoutSession = httpsCallable(functions, 'criarCheckoutSession');
const cancelarAssinatura   = httpsCallable(functions, 'cancelarAssinatura');
const reativarAssinatura   = httpsCallable(functions, 'reativarAssinatura');
const criarPortalSession   = httpsCallable(functions, 'criarPortalSession');

// Guardado no módulo porque o modal de cancelamento precisa saber o
// plano atual (pra decidir se oferece o degrau pro Starter) depois que
// o initShell já resolveu.
let brokerAtual = null;

function paraData(bruto) {
  if (!bruto) return null;
  const d = bruto.toDate?.() ?? new Date(bruto);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dataLonga = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

initShell({ active: 'plano', title: 'Plano' }).then(({ broker }) => {
  brokerAtual = broker;
  montarAssinatura(broker);
  // Planos é a única página que o paywall de trial vencido deixa
  // passar (ver PAGINA_LIVRE_NO_PAYWALL em shell.js) — então é aqui que
  // o estado "venceu" precisa aparecer por escrito.
  if (trialExpirado(broker)) {
    statusEl.textContent = 'Seu teste grátis terminou. Seu catálogo continua no ar, mas o painel fica bloqueado até você assinar — use o cupom 50OFF para 50% de desconto vitalício.';
  } else if (broker.status === 'trialing') {
    // Mesmo texto do contador da sidebar (dias → horas → minutos, ver
    // textoRestanteTrial): as duas telas mostrando prazos diferentes pro
    // mesmo trial é o tipo de coisa que faz o corretor não confiar em
    // nenhum dos dois números.
    const restante = textoRestanteTrial(broker);
    statusEl.textContent = restante
      ? `Seu teste grátis termina em ${restante} — assine antes para não perder o acesso ao painel.`
      : 'Você está no teste grátis — assine para não perder o acesso ao painel.';
  } else if (broker.status === 'active') {
    statusEl.textContent = `Plano atual: ${broker.plan}. Assinar um plano diferente troca automaticamente.`;
  } else {
    statusEl.textContent = 'Regularize sua assinatura pra manter o catálogo completo visível.';
  }
});

document.querySelectorAll('[data-plano]').forEach(btn => {
  btn.addEventListener('click', async () => {
    msg.textContent = '';
    msg.className = 'msg';
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'Abrindo checkout...';

    try {
      const { data } = await criarCheckoutSession({ priceLookupKey: btn.dataset.plano });
      if (data.updated) {
        msg.textContent = `Plano trocado para ${data.plan}! A cobrança já foi ajustada proporcionalmente.`;
        msg.className = 'msg msg--ok';
        btn.disabled = false;
        btn.textContent = textoOriginal;
        return;
      }
      location.href = data.url;
    } catch (err) {
      msg.textContent = 'Não foi possível abrir o checkout: ' + err.message;
      msg.className = 'msg msg--err';
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });
});

/* ── Gestão da assinatura existente ───────────────────────────
   O card só existe pra quem tem (ou teve) assinatura — pra quem está
   no trial ele nem aparece, senão a página ofereceria "cancelar" uma
   coisa que não existe. */
function montarAssinatura(broker) {
  const card = $('assinaturaCard');
  if (!broker?.stripeSubscriptionId) { card.hidden = true; return; }

  const fimPeriodo = paraData(broker.currentPeriodEnd);
  const agendado = broker.cancelAtPeriodEnd === true;
  const cancelada = broker.status === 'canceled';

  let estado;
  if (cancelada) {
    estado = 'Assinatura encerrada. Seus dados continuam guardados — assine de novo quando quiser.';
  } else if (agendado) {
    estado = fimPeriodo
      ? `Cancelamento agendado. Você continua com acesso total até ${dataLonga(fimPeriodo)}.`
      : 'Cancelamento agendado. Você continua com acesso até o fim do período já pago.';
  } else if (broker.status === 'past_due') {
    estado = 'Não conseguimos cobrar seu cartão. Atualize a forma de pagamento pra não perder o acesso.';
  } else {
    const proxima = fimPeriodo ? ` Próxima cobrança em ${dataLonga(fimPeriodo)}.` : '';
    estado = `Plano ${broker.plan || '—'}, ativa.${proxima}`;
  }

  $('assinaturaEstado').textContent = estado;
  $('btnPortal').hidden    = !broker.stripeCustomerId;
  $('btnReativar').hidden  = !agendado || cancelada;
  $('btnCancelar').hidden  = agendado || cancelada;
  card.hidden = false;
}

function fecharModal() {
  $('cancelModal').classList.remove('open');
  document.body.style.overflow = '';
}

function abrirModal() {
  // Sempre volta pro passo 1: reabrir depois de desistir no passo 2 não
  // pode pular a pergunta que é o motivo do modal existir.
  $('cancelPasso1').hidden = false;
  $('cancelPasso2').hidden = true;
  $('cancelMsg').hidden = true;
  $('cancelModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

const motivoEscolhido = () =>
  document.querySelector('input[name="cancelMotivo"]:checked')?.value || '';

document.querySelectorAll('input[name="cancelMotivo"]').forEach((radio) => {
  radio.addEventListener('change', () => { $('cancelSeguir').disabled = !motivoEscolhido(); });
});

$('btnCancelar').addEventListener('click', abrirModal);
$('cancelVoltar1').addEventListener('click', fecharModal);
$('cancelVoltar2').addEventListener('click', fecharModal);
$('cancelModal').addEventListener('click', (e) => { if (e.target === $('cancelModal')) fecharModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('cancelModal').classList.contains('open')) fecharModal();
});

$('cancelSeguir').addEventListener('click', () => {
  $('cancelPasso1').hidden = true;
  $('cancelPasso2').hidden = false;

  // Degrau pro Starter só faz sentido pra quem sai do Pro por preço.
  $('cancelOfertaDowngrade').hidden =
    !(motivoEscolhido() === 'too_expensive' && brokerAtual?.plan === 'pro');

  const fim = paraData(brokerAtual?.currentPeriodEnd);
  $('cancelAteQuando').textContent = fim
    ? `Você continua com acesso total até ${dataLonga(fim)} — o período que já está pago.`
    : 'Você continua com acesso total até o fim do período já pago.';
});

$('cancelConfirmar').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const original = btn.textContent;
  const erro = $('cancelMsg');
  btn.disabled = true;
  btn.textContent = 'Cancelando...';
  erro.hidden = true;

  try {
    const { data } = await cancelarAssinatura({
      motivo: motivoEscolhido(),
      comentario: $('cancelComentario').value,
    });
    // Atualiza o estado local em vez de recarregar: o corretor acabou
    // de fazer algo delicado, e uma página piscando dá a impressão de
    // que não funcionou.
    brokerAtual = {
      ...brokerAtual,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: data.terminaEm || brokerAtual?.currentPeriodEnd || null,
    };
    fecharModal();
    montarAssinatura(brokerAtual);
    msg.textContent = 'Cancelamento agendado. Você pode voltar atrás a qualquer momento antes do fim do período.';
    msg.className = 'msg msg--ok';
  } catch (err) {
    erro.textContent = 'Não foi possível cancelar: ' + err.message;
    erro.className = 'imv-form-msg imv-form-msg--erro';
    erro.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

$('btnReativar').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Reativando...';
  try {
    await reativarAssinatura();
    brokerAtual = { ...brokerAtual, cancelAtPeriodEnd: false };
    montarAssinatura(brokerAtual);
    msg.textContent = 'Assinatura reativada. A cobrança segue normalmente na próxima data.';
    msg.className = 'msg msg--ok';
  } catch (err) {
    msg.textContent = 'Não foi possível reativar: ' + err.message;
    msg.className = 'msg msg--err';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

$('btnPortal').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Abrindo...';
  try {
    const { data } = await criarPortalSession();
    location.href = data.url;
  } catch (err) {
    msg.textContent = 'Não foi possível abrir a área de pagamento: ' + err.message;
    msg.className = 'msg msg--err';
    btn.disabled = false;
    btn.textContent = original;
  }
});

// Troca direta de plano — criarCheckoutSession devolve { updated: true }
// quando o corretor já tem assinatura ativa, sem passar por checkout.
$('cancelTrocarStarter').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Trocando...';
  try {
    const { data } = await criarCheckoutSession({ priceLookupKey: 'sitemob_starter_monthly' });
    if (data.updated) {
      brokerAtual = { ...brokerAtual, plan: data.plan };
      fecharModal();
      montarAssinatura(brokerAtual);
      msg.textContent = 'Plano trocado para Starter! A cobrança já foi ajustada proporcionalmente.';
      msg.className = 'msg msg--ok';
      return;
    }
    location.href = data.url;
  } catch (err) {
    const erro = $('cancelMsg');
    erro.textContent = 'Não foi possível trocar o plano: ' + err.message;
    erro.className = 'imv-form-msg imv-form-msg--erro';
    erro.hidden = false;
    btn.disabled = false;
    btn.textContent = original;
  }
});
