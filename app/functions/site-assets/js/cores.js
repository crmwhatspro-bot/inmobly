// ════════════════════════════════════════════════
// cores.js — aplica a cor de destaque escolhida pelo corretor
// (brokers/{tenantId}.accentColor) nas CSS custom properties do
// site público, em tempo de execução (sem passo de build). Mesmo
// algoritmo de scripts/build.js#misturar — só que ali roda 1x na
// hora de gerar o site de um broker isolado; aqui roda no navegador
// do visitante, porque a mesma página serve qualquer tenant.
// ════════════════════════════════════════════════
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

export function aplicarAccent(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return;
  const rgb = hexParaRgb(hex).join(',');
  const root = document.documentElement.style;
  root.setProperty('--clr-accent', hex);
  root.setProperty('--clr-accent-dark', misturar(hex, -0.20));
  root.setProperty('--clr-accent-light', misturar(hex, 0.15));
  root.setProperty('--clr-accent-ghost', `rgba(${rgb}, 0.12)`);
  root.setProperty('--clr-accent-glow', `rgba(${rgb}, 0.35)`);
  root.setProperty('--shadow-accent', `0 8px 32px rgba(${rgb}, 0.30)`);
  root.setProperty('--shadow-glow', `0 0 60px rgba(${rgb}, 0.15)`);
}
