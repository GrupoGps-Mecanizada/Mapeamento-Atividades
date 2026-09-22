// ============================================================
// MAPEAMENTO DE ATIVIDADES — auth.js
// Regras puras de login/cadastro (sem DOM, sem Supabase).
// Navegador: window.Auth | Node: module.exports
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Auth = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const COMPANY_DOMAINS = ['gestaogps.com.br', 'gpssa.com.br'];

  function isCompanyEmail(email) {
    const m = /^[^@\s]+@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
    if (!m) return false;
    return COMPANY_DOMAINS.includes(m[1]);
  }

  return { COMPANY_DOMAINS, isCompanyEmail };
}));
