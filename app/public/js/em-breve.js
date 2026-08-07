// ════════════════════════════════════════════════
// em-breve.html — placeholder honesto pras áreas do menu que ainda
// não têm UI própria (Perfil, Configurações — Domínio ganhou página
// própria, ver dominio.html). ?f= decide qual título/descrição mostrar.
// ════════════════════════════════════════════════
import { initShell } from './shell.js';

const TEXTOS = {
  perfil:        { titulo: 'Meu perfil',     desc: 'Edição de nome, foto e dados da conta ainda está sendo desenvolvida.' },
  configuracoes: { titulo: 'Configurações',  desc: 'Preferências gerais da conta ainda estão sendo desenvolvidas.' },
};

const params = new URLSearchParams(location.search);
const info = TEXTOS[params.get('f')] || null;
if (info) {
  document.getElementById('ebTitulo').textContent = info.titulo;
  document.getElementById('ebDesc').textContent = info.desc;
  document.title = info.titulo + ' — Inmobly';
}

initShell({ active: null, title: info?.titulo || 'Em breve' });
