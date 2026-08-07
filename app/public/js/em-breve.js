// ════════════════════════════════════════════════
// em-breve.html — placeholder honesto pras áreas do menu que ainda
// não têm UI própria (Domínio, Perfil, Configurações). ?f= decide
// qual título/descrição mostrar.
// ════════════════════════════════════════════════
import { initShell } from './shell.js';

const TEXTOS = {
  dominio:       { titulo: 'Domínio',        desc: 'Em breve você vai poder conectar um domínio próprio ao seu catálogo direto por aqui.' },
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

const activo = params.get('f') === 'dominio' ? 'dominio' : null;
initShell({ active: activo, title: info?.titulo || 'Em breve' });
