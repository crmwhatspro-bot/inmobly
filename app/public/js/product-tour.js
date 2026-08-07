// ════════════════════════════════════════════════
// product-tour.js — tour guiado apontando pros botões reais do menu
// lateral, sempre dentro do painel (painel.html) — nunca troca de
// tela. Diferente de tour.html/js/tour.js (os slides de onboarding
// logo após o signup, antes de existir qualquer dado) — esse roda
// DEPOIS, na dashboard de verdade, só destacando os botões do menu
// com um popup de instrução ao lado de cada um. Chamado de dentro de
// shell.js#initShell(), não precisa ser importado por cada página
// separadamente.
// ════════════════════════════════════════════════
const PASSOS = [
  {
    alvo: '.admin-nav',
    alvoMobile: '.admin-bottombar',
    titulo: 'Bem-vindo ao seu painel!',
    texto: 'Por aqui você navega entre todas as áreas — seus imóveis, seu site e seu plano.',
  },
  {
    alvo: '[data-tour="nav-desktop-imoveis"]',
    alvoMobile: '[data-tour="nav-mobile-imoveis"]',
    titulo: 'Cadastre seus imóveis',
    texto: 'Clique aqui pra adicionar seus imóveis — fotos, preço e características.',
  },
  {
    alvo: '[data-tour="nav-desktop-site"]',
    alvoMobile: '[data-tour="nav-mobile-site"]',
    titulo: 'Configure seu site',
    texto: 'Aqui você personaliza logo, cores, textos e publica seu catálogo público.',
  },
  {
    alvo: '[data-tour="nav-desktop-plano"]',
    alvoMobile: '[data-tour="nav-mobile-plano"]',
    titulo: 'Acompanhe seu plano',
    texto: 'Aqui você vê seu uso atual e pode fazer upgrade quando quiser.',
  },
];

function chaveEstado(tenantId) { return `pa-tour-${tenantId}`; }
function chaveMomento(tenantId) { return `pa-tour-ts-${tenantId}`; }

// Se o corretor viu um passo e ficou mais que isso sem clicar em "Próximo"
// (ignorou o card e foi navegar por conta própria), o tour é considerado
// abandonado e nunca mais volta a interromper — sem esse corte, o passo
// ficava salvo em localStorage pra sempre e reaparecia do mesmo jeito em
// toda visita futura, já que o valor salvo não distingue "acabei de
// mostrar agora" de "mostrei há dias e o usuário ignorou".
const EXPIRA_MS = 2 * 60 * 1000;

function lerPasso(tenantId) {
  const v = localStorage.getItem(chaveEstado(tenantId));
  if (v === null) return 0;        // nunca visto — primeira visita de verdade
  if (v === 'done') return null;   // terminado ou pulado — nunca mais mostra

  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n >= PASSOS.length) return null;

  const ts = Number(localStorage.getItem(chaveMomento(tenantId)));
  if (ts && Date.now() - ts > EXPIRA_MS) {
    salvarPasso(tenantId, null); // abandonado — encerra de vez
    return null;
  }
  return n;
}
function salvarPasso(tenantId, passo) {
  localStorage.setItem(chaveEstado(tenantId), passo === null ? 'done' : String(passo));
  if (passo !== null) localStorage.setItem(chaveMomento(tenantId), String(Date.now()));
}

// Posiciona o card de instrução colado perto do botão destacado (não
// mais fixo no canto da tela) — tenta encostar à direita do alvo, cai
// pra esquerda se não couber, e sempre se mantém dentro da viewport.
// No mobile, o card vira faixa horizontal acima ou abaixo do alvo,
// conforme ele estiver na metade de baixo ou de cima da tela.
function posicionarCard(card, alvo) {
  const r = alvo.getBoundingClientRect();
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  card.style.left = 'auto';
  card.style.right = 'auto';
  card.style.top = 'auto';
  card.style.bottom = 'auto';

  if (vw <= 640) {
    card.style.left = 'var(--sp-4)';
    card.style.right = 'var(--sp-4)';
    if (r.top > vh / 2) card.style.bottom = (vh - r.top + gap) + 'px';
    else card.style.top = (r.bottom + gap) + 'px';
    return;
  }

  const cw = card.offsetWidth || 300;
  const ch = card.offsetHeight || 170;

  let left = r.right + gap;
  if (left + cw > vw - 16) left = r.left - cw - gap;
  left = Math.max(16, Math.min(left, vw - cw - 16));

  let top = r.top;
  top = Math.max(16, Math.min(top, vh - ch - 16));

  card.style.left = left + 'px';
  card.style.top = top + 'px';
}

export function initProductTour({ tenantId, active }) {
  if (active !== 'dashboard') return; // tour só existe no painel — nunca troca de tela

  const passoAtual = lerPasso(tenantId);
  if (passoAtual === null) return;

  const passo = PASSOS[passoAtual];
  if (!passo) return;

  const seletor = passo.alvoMobile && window.innerWidth <= 900 ? passo.alvoMobile : passo.alvo;
  const alvo = document.querySelector(seletor);
  if (!alvo) return;

  // Persiste (e marca o horário) assim que o passo é EXIBIDO, não só quando
  // o usuário clica num botão do tour — é isso que arma o relógio de
  // EXPIRA_MS. Se ele ignorar o card, o passo expira e nunca mais volta;
  // se ele interagir, cada clique renova o prazo naturalmente.
  salvarPasso(tenantId, passoAtual);

  alvo.classList.add('pa-tour-highlight');

  const ultimoPasso = passoAtual === PASSOS.length - 1;
  const card = document.createElement('div');
  card.className = 'pa-tour-card';
  card.innerHTML = `
    <p class="pa-tour-card__step">Passo ${passoAtual + 1} de ${PASSOS.length}</p>
    <h3 class="pa-tour-card__titulo">${passo.titulo}</h3>
    <p class="pa-tour-card__texto">${passo.texto}</p>
    <div class="pa-tour-card__actions">
      <button type="button" class="pa-tour-card__pular" id="paTourPular">Pular tour</button>
      <button type="button" class="btn btn--accent btn--sm" id="paTourProximo">${ultimoPasso ? 'Concluir' : 'Próximo →'}</button>
    </div>`;
  document.body.appendChild(card);
  posicionarCard(card, alvo);

  const onResize = () => posicionarCard(card, alvo);
  window.addEventListener('resize', onResize);

  function limpar() {
    window.removeEventListener('resize', onResize);
    alvo.classList.remove('pa-tour-highlight');
    card.remove();
  }

  document.getElementById('paTourPular').addEventListener('click', () => {
    salvarPasso(tenantId, null);
    limpar();
  });

  document.getElementById('paTourProximo').addEventListener('click', () => {
    limpar();
    if (ultimoPasso) {
      salvarPasso(tenantId, null);
      return;
    }
    salvarPasso(tenantId, passoAtual + 1);
    initProductTour({ tenantId, active });
  });
}
