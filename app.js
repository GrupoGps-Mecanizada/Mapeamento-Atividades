// ============================================================
// Central de Problemas — Grupo GPS Mecanizada
// Integração Supabase | app.js
// ============================================================

const SUPABASE_URL = 'https://mfsyrsegkvjmefcdaegh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rw878qLgcmUdixI8QsejBA_lSXYAsIv';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Constantes visuais ──────────────────────────────────────
const CRITICIDADES = ['Baixa', 'Média', 'Alta'];
const STATUSES = ['Aberto', 'Em andamento', 'Aguardando terceiros', 'Resolvido', 'Cancelado'];
const OPEN_STATUSES = ['Aberto', 'Em andamento', 'Aguardando terceiros'];

const CRIT_STYLE = {
  'Baixa': { bg: 'oklch(94% 0.05 155)', color: 'oklch(38% 0.13 155)' },
  'Média': { bg: 'oklch(95% 0.06 80)',  color: 'oklch(42% 0.14 70)'  },
  'Alta':  { bg: 'oklch(94% 0.06 25)',  color: 'oklch(45% 0.17 25)'  },
};
const STATUS_STYLE = {
  'Aberto':              { bg: 'oklch(93% 0.008 258)', color: 'oklch(40% 0.02 258)'  },
  'Em andamento':        { bg: 'oklch(93% 0.06 258)',  color: 'oklch(45% 0.17 258)'  },
  'Aguardando terceiros':{ bg: 'oklch(94% 0.05 300)',  color: 'oklch(45% 0.14 300)'  },
  'Resolvido':           { bg: 'oklch(94% 0.05 155)',  color: 'oklch(38% 0.13 155)'  },
  'Cancelado':           { bg: 'oklch(93% 0.006 258)', color: 'oklch(55% 0.01 258)'  },
};

// ── Helpers ─────────────────────────────────────────────────
function initials(nome) {
  return (nome || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function daysSince(iso) {
  if (!iso) return 0;
  const today = new Date();
  const d = new Date(iso + 'T00:00:00');
  return Math.floor((today - d) / 86400000);
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}
function showLoading(v) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !v);
}

// ── Estado da aplicação ─────────────────────────────────────
const state = {
  problems: [],
  pessoas: [],
  setores: [],
  currentUserId: '',
  busca: '',
  filters: { setor: 'todos', criticidade: 'todos', responsavel: 'todos' },
  activeTab: 'lista',
  modal: null, // { mode: 'new'|'edit', id?, draft: {} }
  novoComentario: '',
  deleteTarget: null,
};

// ── Supabase: carregar dados ────────────────────────────────
async function loadAll() {
  showLoading(true);
  try {
    const [pRes, pesRes, setRes] = await Promise.all([
      sb.from('problemas').select('*').order('prazo', { ascending: true, nullsFirst: false }),
      sb.from('pessoas').select('*').order('nome'),
      sb.from('setores').select('*').order('nome'),
    ]);
    if (pRes.error) throw pRes.error;
    if (pesRes.error) throw pesRes.error;
    if (setRes.error) throw setRes.error;
    state.problems = pRes.data || [];
    state.pessoas = pesRes.data || [];
    state.setores = setRes.data || [];
    // Restaura usuário salvo
    const savedUser = localStorage.getItem('probsys_user');
    if (savedUser && state.pessoas.find(p => p.id === savedUser)) {
      state.currentUserId = savedUser;
    } else if (state.pessoas.length > 0) {
      state.currentUserId = state.pessoas[0].id;
    }
  } catch (e) {
    showToast('Erro ao carregar dados: ' + e.message, 5000);
  } finally {
    showLoading(false);
    render();
  }
}

// ── Supabase: salvar problema ───────────────────────────────
async function upsertProblema(data) {
  const { error } = await sb.from('problemas').upsert(data);
  if (error) throw error;
}
async function deleteProblemaDB(id) {
  const { error } = await sb.from('problemas').delete().eq('id', id);
  if (error) throw error;
}
async function upsertPessoa(data) {
  const { data: d, error } = await sb.from('pessoas').upsert(data).select().single();
  if (error) throw error;
  return d;
}
async function deletePessoaDB(id) {
  const { error } = await sb.from('pessoas').delete().eq('id', id);
  if (error) throw error;
}
async function upsertSetor(nome) {
  const { error } = await sb.from('setores').insert({ nome });
  if (error) throw error;
}
async function deleteSetorDB(nome) {
  const { error } = await sb.from('setores').delete().eq('nome', nome);
  if (error) throw error;
}

// ── Renderização principal ──────────────────────────────────
const app = {

  // Tabs
  setTab(tab) {
    state.activeTab = tab;
    render();
  },

  // Busca
  onBuscaChange(v) {
    state.busca = v;
    render();
  },

  // Filtros
  setFilter(key, val) {
    state.filters[key] = val;
    render();
  },

  // Usuário atual
  setCurrentUser(id) {
    state.currentUserId = id;
    localStorage.setItem('probsys_user', id);
  },

  // ── Modal ──────────────────────────────────────────────────
  openNew() {
    state.modal = {
      mode: 'new',
      draft: {
        titulo: '', descricao: '', setor: '', criticidade: '', status: 'Aberto',
        responsavel_id: '', aberto_por_id: state.currentUserId, prazo: '', comentarios: [],
      }
    };
    renderModal();
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  openEdit(p) {
    state.modal = {
      mode: 'edit',
      id: p.id,
      draft: {
        titulo: p.titulo, descricao: p.descricao || '', setor: p.setor,
        criticidade: p.criticidade, status: p.status, responsavel_id: p.responsavel_id,
        aberto_por_id: p.aberto_por_id, prazo: p.prazo || '', comentarios: p.comentarios || [],
      }
    };
    renderModal();
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    state.modal = null;
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  setDraftStatus(status) {
    if (!state.modal) return;
    state.modal.draft.status = status;
    renderStatusPills();
  },

  async saveDraft() {
    const { modal } = state;
    if (!modal) return;
    const d = modal.draft;
    if (!d.titulo.trim() || !d.setor || !d.criticidade || !d.responsavel_id) {
      showToast('Preencha todos os campos obrigatórios.');
      return;
    }
    if (modal.mode === 'new' && !d.aberto_por_id) {
      showToast('Selecione quem está abrindo o problema.');
      return;
    }
    showLoading(true);
    try {
      const now = new Date().toISOString().slice(0, 10);
      const payload = {
        titulo: d.titulo.trim(),
        descricao: d.descricao || '',
        setor: d.setor,
        criticidade: d.criticidade,
        status: d.status || 'Aberto',
        responsavel_id: d.responsavel_id,
        aberto_por_id: d.aberto_por_id,
        prazo: d.prazo || null,
        comentarios: d.comentarios || [],
      };
      if (modal.mode === 'new') {
        payload.id = crypto.randomUUID();
        payload.criado_em = now;
        await upsertProblema(payload);
        state.problems.unshift(payload);
      } else {
        payload.id = modal.id;
        await upsertProblema(payload);
        const idx = state.problems.findIndex(p => p.id === modal.id);
        if (idx >= 0) state.problems[idx] = { ...state.problems[idx], ...payload };
      }
      app.closeModal();
      render();
      showToast(modal.mode === 'new' ? 'Problema criado!' : 'Problema atualizado!');
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 5000);
    } finally {
      showLoading(false);
    }
  },

  addComment() {
    const texto = document.getElementById('novo-comentario').value.trim();
    if (!texto || !state.modal) return;
    const autor = state.pessoas.find(p => p.id === state.currentUserId);
    const comentario = {
      autor: autor ? autor.nome : '—',
      texto,
      data: new Date().toISOString().slice(0, 10),
    };
    state.modal.draft.comentarios = [comentario, ...(state.modal.draft.comentarios || [])];
    document.getElementById('novo-comentario').value = '';
    renderComentarios();
  },

  // ── Excluir problema ──────────────────────────────────────
  confirmDelete() {
    if (!state.modal) return;
    const p = state.problems.find(x => x.id === state.modal.id);
    state.deleteTarget = state.modal.id;
    document.getElementById('confirm-text').textContent =
      `Tem certeza que deseja excluir "${p ? p.titulo : 'este problema'}"? Esta ação não pode ser desfeita.`;
    document.getElementById('confirm-modal').classList.remove('hidden');
  },

  async doDelete() {
    const id = state.deleteTarget;
    if (!id) return;
    document.getElementById('confirm-modal').classList.add('hidden');
    showLoading(true);
    try {
      await deleteProblemaDB(id);
      state.problems = state.problems.filter(p => p.id !== id);
      app.closeModal();
      render();
      showToast('Problema excluído.');
    } catch (e) {
      showToast('Erro ao excluir: ' + e.message, 5000);
    } finally {
      showLoading(false);
      state.deleteTarget = null;
    }
  },

  // ── Setores config ────────────────────────────────────────
  async addSetor() {
    const input = document.getElementById('novo-setor-input');
    const nome = input.value.trim();
    if (!nome || state.setores.find(s => s.nome === nome)) return;
    showLoading(true);
    try {
      await upsertSetor(nome);
      const { data } = await sb.from('setores').select('*').order('nome');
      state.setores = data || [];
      input.value = '';
      render();
      showToast('Setor adicionado!');
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
    } finally {
      showLoading(false);
    }
  },

  async removeSetor(nome) {
    showLoading(true);
    try {
      await deleteSetorDB(nome);
      state.setores = state.setores.filter(s => s.nome !== nome);
      render();
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
    } finally {
      showLoading(false);
    }
  },

  // ── Pessoas config ────────────────────────────────────────
  async addPessoa() {
    const nome = document.getElementById('nova-pessoa-nome').value.trim();
    const setor = document.getElementById('nova-pessoa-setor').value;
    if (!nome || !setor) return;
    showLoading(true);
    try {
      const novo = await upsertPessoa({ id: crypto.randomUUID(), nome, setor });
      state.pessoas.push(novo);
      state.pessoas.sort((a, b) => a.nome.localeCompare(b.nome));
      document.getElementById('nova-pessoa-nome').value = '';
      document.getElementById('nova-pessoa-setor').value = '';
      render();
      showToast('Pessoa adicionada!');
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
    } finally {
      showLoading(false);
    }
  },

  async removePessoa(id) {
    const pessoa = state.pessoas.find(p => p.id === id);
    const afetados = state.problems.filter(p => p.responsavel_id === id && OPEN_STATUSES.includes(p.status));
    if (afetados.length > 0) {
      const ok = confirm(`${pessoa ? pessoa.nome : 'Esta pessoa'} é responsável por ${afetados.length} problema(s) em aberto. Remover mesmo assim?`);
      if (!ok) return;
    }
    showLoading(true);
    try {
      await deletePessoaDB(id);
      state.pessoas = state.pessoas.filter(p => p.id !== id);
      // Limpa responsavel_id nos problemas afetados no banco
      for (const p of afetados) {
        await sb.from('problemas').update({ responsavel_id: null }).eq('id', p.id);
      }
      await loadAll();
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
      showLoading(false);
    }
  },

  async changePessoaSetor(id, setor) {
    try {
      await sb.from('pessoas').update({ setor }).eq('id', id);
      const idx = state.pessoas.findIndex(p => p.id === id);
      if (idx >= 0) state.pessoas[idx].setor = setor;
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
    }
  },
};

// ── Render helpers ─────────────────────────────────────────
function getEnriched(p) {
  const crit = CRIT_STYLE[p.criticidade] || CRIT_STYLE['Baixa'];
  const stat = STATUS_STYLE[p.status] || STATUS_STYLE['Aberto'];
  const resp = state.pessoas.find(t => t.id === p.responsavel_id);
  const abertoPor = state.pessoas.find(t => t.id === p.aberto_por_id);
  const isOpen = OPEN_STATUSES.includes(p.status);
  const vencido = isOpen && p.prazo && daysSince(p.prazo) > 0;
  return {
    ...p,
    critBadgeStyle: `background:${crit.bg};color:${crit.color};`,
    statusBadgeStyle: `background:${stat.bg};color:${stat.color};`,
    responsavelNome: resp ? resp.nome : (p.responsavel_id ? 'Pessoa removida' : 'Não atribuído'),
    responsavelIniciais: resp ? initials(resp.nome) : '–',
    abertoPorNome: abertoPor ? abertoPor.nome : (p.aberto_por_id ? 'Pessoa removida' : '—'),
    prazoFmt: fmtDate(p.prazo),
    criadoFmt: fmtDate(p.criado_em),
    diasAberto: daysSince(p.criado_em),
    prazoStyle: vencido ? 'color:#dc2626;font-weight:700;' : '',
  };
}

function getFiltered() {
  const { filters, busca, problems } = state;
  const q = busca.trim().toLowerCase();
  return problems
    .filter(p =>
      (filters.setor === 'todos' || p.setor === filters.setor) &&
      (filters.criticidade === 'todos' || p.criticidade === filters.criticidade) &&
      (filters.responsavel === 'todos' || p.responsavel_id === filters.responsavel) &&
      (!q || p.titulo.toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q))
    )
    .map(p => getEnriched(p))
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
}

// ── Render completo ─────────────────────────────────────────
function render() {
  renderTabs();
  renderSelects();
  renderLista();
  renderDashboard();
  renderConfig();
}

function renderTabs() {
  const { activeTab } = state;
  const tabBase = 'padding:14px 2px;background:none;border:none;border-bottom:2px solid transparent;font-size:15px;font-weight:700;cursor:pointer;';
  const tabOn  = tabBase + 'color:oklch(46% 0.17 258);border-bottom-color:oklch(46% 0.17 258);';
  const tabOff = tabBase + 'color:oklch(52% 0.02 258);';
  document.getElementById('tab-lista').style.cssText = activeTab === 'lista' ? tabOn : tabOff;
  document.getElementById('tab-dashboard').style.cssText = activeTab === 'dashboard' ? tabOn : tabOff;
  document.getElementById('tab-config').style.cssText = activeTab === 'config' ? tabOn : tabOff;
  document.getElementById('view-lista').classList.toggle('hidden', activeTab !== 'lista');
  document.getElementById('view-dashboard').classList.toggle('hidden', activeTab !== 'dashboard');
  document.getElementById('view-config').classList.toggle('hidden', activeTab !== 'config');
  document.getElementById('filters-bar').classList.toggle('hidden', activeTab !== 'lista');
}

function renderSelects() {
  // Usuário
  const userSel = document.getElementById('current-user-select');
  const prevUser = userSel.value || state.currentUserId;
  userSel.innerHTML = state.pessoas.map(p =>
    `<option value="${esc(p.id)}" ${p.id === prevUser ? 'selected' : ''}>${esc(p.nome)}</option>`
  ).join('');
  if (prevUser) userSel.value = prevUser;

  // Filtro setores
  const setorSel = document.getElementById('filter-setor');
  const prevSetor = setorSel.value;
  setorSel.innerHTML = `<option value="todos">Todos os setores</option>` +
    state.setores.map(s => `<option value="${esc(s.nome)}" ${s.nome === prevSetor ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');

  // Filtro responsavel
  const respSel = document.getElementById('filter-responsavel');
  const prevResp = respSel.value;
  respSel.innerHTML = `<option value="todos">Todos os responsáveis</option>` +
    state.pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === prevResp ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
}

function renderLista() {
  const filtered = getFiltered();
  const tbody = document.getElementById('lista-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:60px;text-align:center;font-size:14px;color:oklch(58% 0.015 258);">Nenhum problema encontrado com esses filtros.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map((p, idx) => {
    const bg = idx % 2 === 1 ? 'oklch(96% 0.006 258)' : 'transparent';
    return `
    <tr onclick="app.openEdit(state.problems.find(x=>x.id==='${esc(p.id)}'))" style="border-bottom:1px solid oklch(90% 0.02 258);cursor:pointer;background:${bg};">
      <td style="padding:14px 16px;font-size:14px;font-weight:700;">${esc(p.titulo)}</td>
      <td style="padding:14px 16px;font-size:13px;color:oklch(45% 0.02 258);">${esc(p.setor)}</td>
      <td style="padding:14px 16px;"><span style="border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;${p.critBadgeStyle}">${esc(p.criticidade)}</span></td>
      <td style="padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:24px;height:24px;border-radius:50%;background:oklch(90% 0.06 258);color:oklch(40% 0.17 258);font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${esc(p.responsavelIniciais)}</span>
          <span style="font-size:13px;font-weight:600;">${esc(p.responsavelNome)}</span>
        </div>
      </td>
      <td style="padding:14px 16px;"><span style="border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;${p.statusBadgeStyle}">${esc(p.status)}</span></td>
      <td style="padding:14px 16px;font-size:13px;font-weight:700;${p.prazoStyle}">${p.prazoFmt}</td>
      <td style="padding:14px 16px;font-size:13px;color:oklch(52% 0.02 258);">${esc(p.abertoPorNome)}</td>
    </tr>`;
  }).join('');
}

function renderDashboard() {
  const allEnriched = state.problems.map(p => getEnriched(p));
  const openProblems = allEnriched.filter(p => OPEN_STATUSES.includes(p.status));

  const spark = (pred, color) => {
    const counts = state.setores.map(s => allEnriched.filter(p => p.setor === s.nome && pred(p)).length);
    const max = Math.max(1, ...counts);
    return counts.map(c => `<div style="width:6px;border-radius:2px;height:${Math.max(4, Math.round(c / max * 26))}px;background:${color};opacity:${c > 0 ? 1 : 0.3};flex-shrink:0;"></div>`).join('');
  };

  const kpis = [
    { label: 'Abertos',              valor: allEnriched.filter(p => p.status === 'Aberto').length,              colorStyle: `color:${STATUS_STYLE['Aberto'].color};`,              spark: spark(p => p.status === 'Aberto', STATUS_STYLE['Aberto'].color) },
    { label: 'Em andamento',         valor: allEnriched.filter(p => p.status === 'Em andamento').length,        colorStyle: `color:${STATUS_STYLE['Em andamento'].color};`,        spark: spark(p => p.status === 'Em andamento', STATUS_STYLE['Em andamento'].color) },
    { label: 'Aguardando terceiros', valor: allEnriched.filter(p => p.status === 'Aguardando terceiros').length,colorStyle: `color:${STATUS_STYLE['Aguardando terceiros'].color};`,spark: spark(p => p.status === 'Aguardando terceiros', STATUS_STYLE['Aguardando terceiros'].color) },
    { label: 'Críticos em aberto',   valor: allEnriched.filter(p => p.criticidade === 'Alta' && OPEN_STATUSES.includes(p.status)).length, colorStyle: `color:${CRIT_STYLE['Alta'].color};`, spark: spark(p => p.criticidade === 'Alta' && OPEN_STATUSES.includes(p.status), CRIT_STYLE['Alta'].color) },
    { label: 'Resolvidos',           valor: allEnriched.filter(p => p.status === 'Resolvido').length,           colorStyle: `color:${STATUS_STYLE['Resolvido'].color};`,           spark: spark(p => p.status === 'Resolvido', STATUS_STYLE['Resolvido'].color) },
  ];

  document.getElementById('kpi-grid').innerHTML = kpis.map(k => `
    <div style="background:#fff;border-radius:16px;padding:20px;border:1px solid oklch(84% 0.035 258);">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:oklch(52% 0.02 258);">${esc(k.label)}</div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:8px;">
        <div style="font-size:34px;font-weight:800;${k.colorStyle}">${k.valor}</div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:30px;border-bottom:1px solid oklch(90% 0.02 258);padding-bottom:2px;">${k.spark}</div>
      </div>
      <div style="font-size:10px;color:oklch(60% 0.02 258);margin-top:6px;">por setor</div>
    </div>`).join('');

  const setorCounts = state.setores.map(s => ({ setor: s.nome, count: openProblems.filter(p => p.setor === s.nome).length }));
  const maxSetor = Math.max(1, ...setorCounts.map(r => r.count));
  document.getElementById('bar-setor').innerHTML = setorCounts.map(r => `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <span style="width:110px;font-size:13px;color:oklch(45% 0.02 258);flex-shrink:0;">${esc(r.setor)}</span>
      <div style="flex:1;height:10px;background:oklch(94% 0.005 258);border-radius:6px;overflow:hidden;">
        <div style="height:10px;border-radius:6px;width:${Math.round(r.count / maxSetor * 100)}%;background:oklch(46% 0.17 258);"></div>
      </div>
      <span style="width:24px;text-align:right;font-size:13px;font-weight:700;">${r.count}</span>
    </div>`).join('');

  const critCounts = ['Alta', 'Média', 'Baixa'].map(criticidade => ({ criticidade, count: openProblems.filter(p => p.criticidade === criticidade).length }));
  const maxCrit = Math.max(1, ...critCounts.map(r => r.count));
  document.getElementById('bar-criticidade').innerHTML = critCounts.map(r => `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <span style="width:110px;font-size:13px;color:oklch(45% 0.02 258);flex-shrink:0;">${esc(r.criticidade)}</span>
      <div style="flex:1;height:10px;background:oklch(94% 0.005 258);border-radius:6px;overflow:hidden;">
        <div style="height:10px;border-radius:6px;width:${Math.round(r.count / maxCrit * 100)}%;background:${CRIT_STYLE[r.criticidade].color};"></div>
      </div>
      <span style="width:24px;text-align:right;font-size:13px;font-weight:700;">${r.count}</span>
    </div>`).join('');

  const antigos = openProblems.slice().sort((a, b) => b.diasAberto - a.diasAberto).slice(0, 5);
  const agingThreshold = 14;
  document.getElementById('antigos-list').innerHTML = antigos.length === 0
    ? '<div style="font-size:13px;color:oklch(58% 0.015 258);">Nenhum problema em aberto.</div>'
    : antigos.map(p => {
        const pillStyle = p.diasAberto >= agingThreshold
          ? 'background:oklch(94% 0.06 25);color:oklch(45% 0.17 25);'
          : 'background:oklch(95% 0.006 258);color:oklch(45% 0.02 258);';
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid oklch(94% 0.006 258);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:14px;font-weight:600;">${esc(p.titulo)}</span>
            <span style="background:oklch(95% 0.006 258);color:oklch(45% 0.02 258);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;">${esc(p.setor)}</span>
          </div>
          <span style="border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;${pillStyle}">${p.diasAberto} dia${p.diasAberto === 1 ? '' : 's'} em aberto</span>
        </div>`;
      }).join('');
}

function renderConfig() {
  // Setores chips
  document.getElementById('setores-chips').innerHTML = state.setores.map(s => `
    <span style="display:flex;align-items:center;gap:6px;background:oklch(95% 0.006 258);border-radius:999px;padding:6px 6px 6px 14px;font-size:13px;font-weight:600;">
      ${esc(s.nome)}
      <button onclick="app.removeSetor('${esc(s.nome)}')" style="border:none;background:oklch(90% 0.006 258);width:20px;height:20px;border-radius:50%;font-size:12px;cursor:pointer;color:oklch(45% 0.02 258);">×</button>
    </span>`).join('');

  // Select setor config
  const novaPessoaSetorSel = document.getElementById('nova-pessoa-setor');
  novaPessoaSetorSel.innerHTML = `<option value="">Setor</option>` +
    state.setores.map(s => `<option value="${esc(s.nome)}">${esc(s.nome)}</option>`).join('');

  // Pessoas list
  document.getElementById('pessoas-list').innerHTML = state.pessoas.map(p => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid oklch(94% 0.006 258);">
      <span style="width:26px;height:26px;border-radius:50%;background:oklch(94% 0.04 258);color:oklch(45% 0.17 258);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${esc(initials(p.nome))}</span>
      <span style="flex:1;font-size:14px;font-weight:600;">${esc(p.nome)}</span>
      <select onchange="app.changePessoaSetor('${esc(p.id)}',this.value)" style="padding:8px 10px;border-radius:8px;border:1px solid oklch(88% 0.006 258);font-size:13px;cursor:pointer;">
        ${state.setores.map(s => `<option value="${esc(s.nome)}" ${s.nome === p.setor ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
      </select>
      <button onclick="app.removePessoa('${esc(p.id)}')" style="border:none;background:oklch(95% 0.005 258);width:28px;height:28px;border-radius:50%;font-size:13px;cursor:pointer;color:oklch(45% 0.02 258);flex-shrink:0;">×</button>
    </div>`).join('');
}

// ── Modal render ────────────────────────────────────────────
function renderModal() {
  const { modal, pessoas, setores } = state;
  if (!modal) return;
  const d = modal.draft;
  const isNew = modal.mode === 'new';
  const isEdit = modal.mode === 'edit';

  document.getElementById('modal-title').textContent = isNew ? 'Novo problema' : 'Editar problema';

  // Campos
  document.getElementById('draft-titulo').value = d.titulo;
  document.getElementById('draft-descricao').value = d.descricao;
  document.getElementById('draft-prazo').value = d.prazo;

  // Setor select
  const setorSel = document.getElementById('draft-setor');
  setorSel.innerHTML = `<option value="">Selecione</option>` +
    setores.map(s => `<option value="${esc(s.nome)}" ${s.nome === d.setor ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');

  // Criticidade
  document.getElementById('draft-criticidade').value = d.criticidade;

  // Responsável
  const respSel = document.getElementById('draft-responsavel');
  respSel.innerHTML = `<option value="">Selecione</option>` +
    pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === d.responsavel_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');

  // Aberto por (novo)
  document.getElementById('field-aberto-por').classList.toggle('hidden', isEdit);
  document.getElementById('info-aberto-por').classList.toggle('hidden', isNew);
  if (isNew) {
    const abertoPorSel = document.getElementById('draft-aberto-por');
    abertoPorSel.innerHTML = `<option value="">Selecione</option>` +
      pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === d.aberto_por_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  } else {
    const abertoPor = pessoas.find(p => p.id === d.aberto_por_id);
    const prob = state.problems.find(x => x.id === modal.id);
    document.getElementById('info-autor').textContent = abertoPor ? abertoPor.nome : (d.aberto_por_id ? 'Pessoa removida' : '—');
    document.getElementById('info-criado').textContent = prob ? fmtDate(prob.criado_em) : '—';
  }

  // Status pills
  renderStatusPills();

  // Histórico
  document.getElementById('historico-section').classList.toggle('hidden', isNew);
  if (isEdit) renderComentarios();

  // Botão excluir
  document.getElementById('btn-delete').classList.toggle('hidden', isNew);

  // Wire up input changes
  document.getElementById('draft-titulo').oninput = e => { modal.draft.titulo = e.target.value; };
  document.getElementById('draft-descricao').oninput = e => { modal.draft.descricao = e.target.value; };
  document.getElementById('draft-setor').onchange = e => { modal.draft.setor = e.target.value; };
  document.getElementById('draft-criticidade').onchange = e => { modal.draft.criticidade = e.target.value; };
  document.getElementById('draft-responsavel').onchange = e => { modal.draft.responsavel_id = e.target.value; };
  document.getElementById('draft-prazo').onchange = e => { modal.draft.prazo = e.target.value; };
  if (isNew) document.getElementById('draft-aberto-por').onchange = e => { modal.draft.aberto_por_id = e.target.value; };
}

function renderStatusPills() {
  const { modal } = state;
  if (!modal) return;
  document.getElementById('status-pills').innerHTML = STATUSES.map(st => {
    const active = modal.draft.status === st;
    const style = active
      ? 'background:oklch(46% 0.17 258);color:#fff;border-color:oklch(46% 0.17 258);'
      : 'background:#fff;color:oklch(35% 0.02 258);border:1px solid oklch(88% 0.006 258);';
    return `<button onclick="app.setDraftStatus('${esc(st)}')" style="padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;${style}">${esc(st)}</button>`;
  }).join('');
}

function renderComentarios() {
  const { modal } = state;
  if (!modal) return;
  const comentarios = modal.draft.comentarios || [];
  const el = document.getElementById('comentarios-list');
  if (comentarios.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:oklch(60% 0.015 258);margin-bottom:12px;">Nenhum comentário ainda.</div>';
    return;
  }
  el.innerHTML = comentarios.map(c => `
    <div style="margin-bottom:12px;padding:10px 12px;background:oklch(97% 0.004 258);border-radius:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <strong>${esc(c.autor)}</strong>
        <span style="color:oklch(58% 0.015 258);">${fmtDate(c.data)}</span>
      </div>
      <div style="font-size:13px;line-height:1.4;">${esc(c.texto)}</div>
    </div>`).join('');
}

// ── Confirm delete listeners ────────────────────────────────
document.getElementById('confirm-cancel').onclick = () => {
  document.getElementById('confirm-modal').classList.add('hidden');
  state.deleteTarget = null;
};
document.getElementById('confirm-ok').onclick = () => app.doDelete();

// ── Init ────────────────────────────────────────────────────
loadAll();
