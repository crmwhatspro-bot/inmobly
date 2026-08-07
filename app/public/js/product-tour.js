// ════════════════════════════════════════════════
// product-tour.js — tour guiado pelas 3 primeiras tarefas reais do
// corretor: conhecer o painel, configurar o perfil, cadastrar
// imóveis, pré-visualizar antes de publicar. Diferente de
// tour.html/js/tour.js (os slides de onboarding logo após o signup,
// antes de existir qualquer dado) — esse roda DEPOIS, na dashboard de
// verdade, apontando pra elementos reais da UI em 3 páginas
// diferentes. Chamado de dentro de shell.js#initShell(), não precisa
// ser importado por cada página separadamente.
// ════════════════════════════════════════════════
const PAGINAS = {
  dashboard: 'painel.html',
  site: 'meu-site.html',
  imoveis: 'admin.html',
};

const PASSOS = [
  {
    pagina: 'dashboard',
    alvo: '.admin-nav',
    alvoMobile: '.admin-bottombar', // no mobile o menu completo fica escondido dentro do drawer por padrão
    titulo: 'Bem-vindo ao seu painel!',
    texto: 'Por aqui você navega entre todas as áreas — seus imóveis, seu site e seu plano.',
  },
  {
    pagina: 'site',
    alvo: '[data-tour="identidade"]',
    titulo: 'Configure seu perfil',
    texto: 'Clique aqui pra abrir e adicionar seu logo, nome, cor e os textos do seu site. Leva poucos minutos.',
  },
  {
    pagina: 'imoveis',
    alvo: '[data-tour="novo-imovel"]',
    titulo: 'Cadastre seus imóveis',
    texto: 'Toque aqui pra adicionar seu primeiro imóvel — fotos, preço, características.',
  },
  {
    pagina: 'site',
    alvo: '[data-tour="preview"]',
    titulo: 'Pré-visualize antes de publicar',
    texto: 'Veja exatamente como seu site vai ficar antes de deixá-lo no ar.',
  },
];

function chaveEstado(tenantId) { return `pa-tour-${tenantId}`; }

function lerPasso(tenantId) {
  const v = localStorage.getItem(chaveEstado(tenantId));
  if (v === null) return 0;        // nunca visto — começa no passo 0
  if (v === 'done') return null;   // terminado ou pulado — nunca mais mostra
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < PASSOS.length ? n : null;
}
function salvarPasso(tenantId, passo) {
  localStorage.setItem(chaveEstado(tenantId), passo === null ? 'done' : String(passo));
}

export function initProductTour({ tenantId, active }) {
  const passoAtual = lerPasso(tenantId);
  if (passoAtual === null) return;

  const passo = PASSOS[passoAtual];
  if (!passo || passo.pagina !== active) return; // esse passo é de outra página

  const seletor = passo.alvoMobile && window.innerWidth <= 900 ? passo.alvoMobile : passo.alvo;
  const alvo = document.querySelector(seletor);
  if (!alvo) return;

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

  function limpar() {
    alvo.classList.remove('pa-tour-highlight');
    card.remove();
  }

  document.getElementById('paTourPular').addEventListener('click', () => {
    salvarPasso(tenantId, null);
    limpar();
  });

  document.getElementById('paTourProximo').addEventListener('click', () => {
    if (ultimoPasso) {
      salvarPasso(tenantId, null);
      limpar();
      return;
    }
    const proximoIdx = passoAtual + 1;
    salvarPasso(tenantId, proximoIdx);
    const proximaPagina = PAGINAS[PASSOS[proximoIdx].pagina];
    if (PASSOS[proximoIdx].pagina !== active) {
      location.href = proximaPagina;
    } else {
      limpar();
      initProductTour({ tenantId, active });
    }
  });
}
