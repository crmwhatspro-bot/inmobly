// ── Scroll Reveal ──────────────────────────────
function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el    = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('is-visible'), delay);
      observer.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  items.forEach(el => observer.observe(el));
}

// ── Stagger automático para filhos de [data-stagger] ──
function initStagger() {
  document.querySelectorAll('[data-stagger]').forEach(parent => {
    const children = parent.children;
    const base     = parseInt(parent.dataset.staggerBase || '0', 10);
    const step     = parseInt(parent.dataset.staggerStep || '120', 10);
    Array.from(children).forEach((child, i) => {
      child.setAttribute('data-reveal', child.dataset.reveal || 'up');
      child.dataset.delay = base + (i * step);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initStagger();
  initReveal();
});
