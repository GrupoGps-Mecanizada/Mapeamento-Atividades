// ============================================================
// MAPEAMENTO DE ATIVIDADES — auth.js
// Regras puras de login (sem DOM, sem Supabase).
// Navegador: window.Auth | Node: module.exports
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Auth = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const LOGIN_DOMAIN = 'mecanizada.com';

  // A pessoa digita só o primeiro nome; isso vira o e-mail fictício que o
  // Supabase Auth exige internamente (as contas são criadas pelo admin no
  // painel do Supabase com esse mesmo endereço).
  function nomeToEmail(nome) {
    const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
    const limpo = primeiro.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return limpo ? `${limpo}@${LOGIN_DOMAIN}` : '';
  }

  return { LOGIN_DOMAIN, nomeToEmail };
}));
