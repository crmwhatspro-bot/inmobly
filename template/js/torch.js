// ── Torch Effect ───────────────────────────────
// Injecta um overlay radial-gradient que segue o cursor dentro de cada botão.
// Desabilitado em touch devices.

function initTorch() {
  if ('ontouchstart' in window) return;

  const glowMap = {
    'btn--primary':       'rgba(255, 255, 255, 0.18)',
    'btn--accent':        'rgba(255, 255, 255, 0.22)',
    'btn--outline':       'rgba(27, 58, 92, 0.18)',
    'btn--outline-light': 'rgba(255, 255, 255, 0.20)',
    'btn--whatsapp':      'rgba(255, 255, 255, 0.20)',
    'btn--ghost':         'rgba(27, 58, 92, 0.10)',
  };

  document.querySelectorAll('.btn').forEach(btn => {
    let glowColor = 'rgba(255,255,255,0.15)';
    for (const [cls, color] of Object.entries(glowMap)) {
      if (btn.classList.contains(cls)) { glowColor = color; break; }
    }

    const torch = document.createElement('span');
    torch.className = 'btn__torch';
    btn.prepend(torch);

    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      torch.style.background =
        `radial-gradient(100px circle at ${x}px ${y}px, ${glowColor}, transparent 70%)`;
      torch.style.opacity = '1';
    });

    btn.addEventListener('mouseleave', () => {
      torch.style.opacity = '0';
    });
  });
}

document.addEventListener('DOMContentLoaded', initTorch);
