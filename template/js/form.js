import { saveLead, trackEvents } from './firebase.js';

// ── Submit genérico de formulário ──────────────
// Detecta a página pela presença de data-form-id no <form>
// Valores: "assessoria" → coleção "leads" | "imovel" → coleção "leads_imovel"

function initForms() {
  document.querySelectorAll('form[data-form-id]').forEach(form => {
    const formId  = form.dataset.formId;
    const colecao = formId === 'imovel' ? 'leads_imovel' : 'leads';
    const btn     = form.querySelector('button[type="submit"]');
    const success = form.querySelector('.form-success');
    const error   = form.querySelector('.form-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Loading state
      if (btn) { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = '...'; }
      if (success) success.style.display = 'none';
      if (error)   error.style.display   = 'none';

      // Montar objeto de dados
      const data = {};
      new FormData(form).forEach((value, key) => { data[key] = value; });

      // Obrigatório pelo Firestore: name, email, createdAt (createdAt vem do saveLead)
      const result = await saveLead(data, colecao);

      if (result.ok) {
        trackEvents.formSubmit(formId);
        if (success) success.style.display = 'block';
        form.reset();
      } else {
        if (error) error.style.display = 'block';
      }

      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.originalText; }
    });
  });
}

document.addEventListener('DOMContentLoaded', initForms);
