// ============================================================
// MAPEAMENTO DE ATIVIDADES — tarefas.js
// Regras puras de tarefas diárias (sem DOM, sem Supabase).
// Navegador: window.Tarefas | Node: module.exports
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tarefas = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function estaConcluidaHoje(tarefa, hoje) {
    hoje = hoje || todayLocal();
    if (!tarefa.concluida_em) return false;
    return tarefa.rotineira ? tarefa.concluida_em === hoje : true;
  }
  function ordemEntre(anterior, seguinte) {
    if (anterior == null && seguinte == null) return Date.now();
    if (anterior == null) return seguinte - 1;
    if (seguinte == null) return anterior + 1;
    return (anterior + seguinte) / 2;
  }
  return { todayLocal, estaConcluidaHoje, ordemEntre };
}));
