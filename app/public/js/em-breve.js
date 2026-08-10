// ════════════════════════════════════════════════
// em-breve.html — placeholder honesto pras áreas do menu que ainda
// não têm UI própria (só Configurações, hoje — Domínio ganhou
// dominio.html e o perfil ganhou perfil.html). ?f= decide qual
// título/descrição mostrar.
// ════════════════════════════════════════════════
import { initShell } from './shell.js';

const TEXTOS = {
  configuracoes: { titulo: 'Configurações',  desc: 'Preferências gerais da conta ainda estão sendo desenvolvidas.' },
};

const params = new URLSearchParams(location.search);
const info = TEXTOS[params.get('f')] || null;
if (info) {
  document.getElementById('ebTitulo').textContent = info.titulo;
  document.getElementById('ebDesc').textContent = info.desc;
  document.title = info.titulo + ' — Sitemob';
}

initShell({ active: null, title: info?.titulo || 'Em breve' });
