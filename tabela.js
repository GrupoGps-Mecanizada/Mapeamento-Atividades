// ============================================================
// MAPEAMENTO DE ATIVIDADES — tabela.js
// Ordenação e filtro de colunas estilo Excel (sem DOM).
// Navegador: window.Tabela | Node: module.exports
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tabela = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const CRIT_ORDER = ['Baixa', 'Média', 'Alta'];
  const STATUS_ORDER = ['Aberto', 'Em andamento', 'Aguardando terceiros', 'Resolvido', 'Cancelado'];

  const FILTER_COLUMNS = [
    { key: 'setor', valueField: 'setor', labelField: 'setor' },
    { key: 'criticidade', valueField: 'criticidade', labelField: 'criticidade' },
    { key: 'status', valueField: 'status', labelField: 'status' },
    { key: 'responsavel_id', valueField: 'responsavel_id', labelField: 'responsavelNome' },
    { key: 'aberto_por_id', valueField: 'aberto_por_id', labelField: 'abertoPorNome' },
  ];

  function compareTexto(a, b) { return String(a || '').localeCompare(String(b || ''), 'pt-BR'); }
  function compareCriticidade(a, b) { return CRIT_ORDER.indexOf(a) - CRIT_ORDER.indexOf(b); }
  function compareStatus(a, b) { return STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b); }
  function comparePrazo(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  const FIELD_CMP = {
    titulo: compareTexto, setor: compareTexto, criticidade: compareCriticidade,
    responsavelNome: compareTexto, status: compareStatus, prazo: comparePrazo, abertoPorNome: compareTexto,
  };

  function sortRows(rows, col, dir) {
    const sign = dir === 'desc' ? -1 : 1;
    if (col === 'prazo') {
      return rows.slice().sort((a, b) => {
        const c = comparePrazo(a.prazo, b.prazo);
        return (!a.prazo || !b.prazo) ? c : c * sign; // sem-prazo sempre por último
      });
    }
    const cmp = FIELD_CMP[col] || compareTexto;
    return rows.slice().sort((a, b) => cmp(a[col], b[col]) * sign);
  }

  function applyColFilters(rows, filters) {
    return rows.filter(r => FILTER_COLUMNS.every(({ key, valueField }) => {
      const set = filters && filters[key];
      return !set || set.has(r[valueField]);
    }));
  }

  function buildFilterOptions(rows, colKey) {
    const col = FILTER_COLUMNS.find(c => c.key === colKey);
    if (!col) return [];
    const counts = new Map(); // value -> { label, count }
    for (const r of rows) {
      const value = r[col.valueField];
      const label = r[col.labelField];
      if (value == null) continue;
      const cur = counts.get(value) || { label, count: 0 };
      cur.count++;
      counts.set(value, cur);
    }
    return Array.from(counts, ([value, v]) => ({ value, label: v.label, count: v.count }))
      .sort((a, b) => compareTexto(a.label, b.label));
  }

  return { CRIT_ORDER, STATUS_ORDER, FILTER_COLUMNS, sortRows, applyColFilters, buildFilterOptions };
}));
