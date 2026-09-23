// ============================================================
// MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada
// Integração Supabase | app.js
// ============================================================

const SUPABASE_URL = 'https://mfsyrsegkvjmefcdaegh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rw878qLgcmUdixI8QsejBA_lSXYAsIv';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Constantes visuais ──────────────────────────────────────
const CRITICIDADES = ['Baixa', 'Média', 'Alta'];
const STATUSES = ['Aberto', 'Em andamento', 'Aguardando terceiros', 'Resolvido', 'Cancelado'];
const OPEN_STATUSES = ['Aberto', 'Em andamento', 'Aguardando terceiros'];

// As cores vivem no CSS (variáveis em :root); aqui só se escolhe a classe.
function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const critClass = c => 'crit-' + slug(c);
const statusClass = s => 'st-' + slug(s);
const fgVar = (prefix, value) => `var(--${prefix}-${slug(value)}-fg)`; // prefix: 'st' | 'crit'

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
function showLoading(v, msg = 'Carregando...') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.toggle('hidden', !v);
}

// isAdmin() usa state.me.role (definido pelo Supabase Auth via boot()).
function isAdmin() { return !!(state.me && state.me.role === 'admin'); }

// ── Estado da aplicação ─────────────────────────────────────
const state = {
  problems: [],
  pessoas: [],
  setores: [],
  currentUserId: '',
  session: null,
  me: null, // { id, nome, setor, role } — pessoa logada
  busca: '',
  colFilters: { setor: null, criticidade: null, status: null, responsavel_id: null, aberto_por_id: null },
  quickFilter: null, // 'vencidos' — atalho vindo do clique num KPI do Dashboard (não é coluna filtrável)
  sort: { col: 'prazo', dir: 'asc' },
  openFilterPanel: null,
  filterDraft: null,
  filterSearch: '',
  activeTab: 'dashboard',
  modal: null, // { mode: 'new'|'edit', id?, draft: {} }
  novoComentario: '',
  deleteTarget: null,
  signedUrls: {}, // path -> URL assinada (miniaturas); limpa ao fechar o modal
  tarefas: [],
  tarefasCarregadas: false,
  tarefasData: Tarefas.todayLocal(), // data em exibição na aba Tarefas — hoje = lista viva, passado = histórico só-leitura
  tarefasHistorico: [], // [{texto, rotineira}] concluídas em tarefasData, quando tarefasData !== hoje
  tarefasFiltro: 'todas', // 'todas' | 'rotineiras' | 'outras' — lista única, sem seções separadas
  agendamentos: [],
  agendaMes: (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; })(), // mês em exibição na Agenda
  modalAgendamento: null, // { mode: 'new'|'edit', id?, draft: {} }
  deleteTargetType: null, // 'problema' | 'agendamento' — qual excluir no confirm-modal compartilhado
};

// ── Supabase: carregar dados ────────────────────────────────
async function loadAll() {
  showLoading(true);
  try {
    const [pRes, pesRes, setRes, agRes] = await Promise.all([
      sb.from('problemas').select('*').order('prazo', { ascending: true, nullsFirst: false }),
      sb.from('pessoas').select('*').order('nome'),
      sb.from('setores').select('*').order('nome'),
      sb.from('agendamentos').select('*').order('data', { ascending: true }),
    ]);
    if (pRes.error) throw pRes.error;
    if (pesRes.error) throw pesRes.error;
    if (setRes.error) throw setRes.error;
    if (agRes.error) throw agRes.error;
    state.problems = pRes.data || [];
    state.pessoas = pesRes.data || [];
    state.setores = setRes.data || [];
    state.agendamentos = agRes.data || [];
    // Restaura a última pessoa escolhida como autora (vazio se nenhuma)
    const savedUser = localStorage.getItem('probsys_user');
    state.currentUserId = savedUser && state.pessoas.find(p => p.id === savedUser) ? savedUser : '';
  } catch (e) {
    showToast('Erro ao carregar dados: ' + e.message, 5000);
  } finally {
    showLoading(false);
    render();
  }
}

async function loadTarefas() {
  if (!state.currentUserId) { state.tarefasCarregadas = true; render(); return; }
  showLoading(true);
  try {
    const { data, error } = await sb.from('tarefas').select('*').eq('pessoa_id', state.currentUserId).order('ordem');
    if (error) throw error;
    state.tarefas = data || [];
    state.tarefasCarregadas = true;
  } catch (e) {
    showToast('Erro ao carregar tarefas: ' + e.message, 5000);
  } finally {
    showLoading(false);
    render();
  }
}

// Histórico só-leitura: o que foi concluído numa data passada (ver
// tarefa_conclusoes). tarefas.concluida_em não serve pra isso — é
// sobrescrita a cada toggle, só guarda a última data.
async function loadTarefasHistorico(data) {
  showLoading(true);
  try {
    const { data: rows, error } = await sb.from('tarefa_conclusoes')
      .select('tarefas(texto, rotineira)')
      .eq('pessoa_id', state.currentUserId)
      .eq('data', data);
    if (error) throw error;
    state.tarefasHistorico = (rows || [])
      .map(r => r.tarefas)
      .filter(Boolean)
      .map(t => ({ texto: t.texto, rotineira: t.rotineira }));
  } catch (e) {
    showToast('Erro ao carregar histórico: ' + e.message, 4000);
    state.tarefasHistorico = [];
  } finally {
    showLoading(false);
    renderTarefas();
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
async function upsertAgendamento(data) {
  const { error } = await sb.from('agendamentos').upsert(data);
  if (error) throw error;
}
async function deleteAgendamentoDB(id) {
  const { error } = await sb.from('agendamentos').delete().eq('id', id);
  if (error) throw error;
}

// ── Supabase Storage: anexos ────────────────────────────────
const BUCKET = 'anexos-problemas';

async function removeFromStorage(paths) {
  if (!paths || !paths.length) return;
  try { await sb.storage.from(BUCKET).remove(paths); } catch (_) { /* melhor esforço */ }
}

// Reduz fotos grandes no aparelho (lado maior 1600px, JPEG 0.8). Devolve null se não valer a pena.
async function resizeImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const t = Anexos.computeResizeTarget(bmp.width, bmp.height, file.size);
  if (!t.needsResize) { if (bmp.close) bmp.close(); return null; }
  const canvas = document.createElement('canvas');
  canvas.width = t.width; canvas.height = t.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, t.width, t.height);
  ctx.drawImage(bmp, 0, 0, t.width, t.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
  if (!blob || blob.size >= file.size) return null;
  return { blob, nome: file.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg' };
}

async function prepareUpload(file) {
  const tipo = Anexos.resolveType(file);
  if (/^image\/(jpeg|png|webp)$/.test(tipo)) {
    try { const r = await resizeImage(file); if (r) return r; } catch (_) { /* usa o original */ }
  }
  return { blob: file, nome: file.name, tipo };
}

async function uploadAnexo(problemaId, pend) {
  const prep = await prepareUpload(pend.file);
  const path = Anexos.buildStoragePath(problemaId, crypto.randomUUID(), prep.nome);
  const { error } = await sb.storage.from(BUCKET).upload(path, prep.blob, { contentType: prep.tipo, upsert: false });
  if (error) throw error;
  return { path, nome: prep.nome, tipo: prep.tipo, tamanho: prep.blob.size, enviado_em: new Date().toISOString() };
}

// ── Auth / Boot ─────────────────────────────────────────────
async function resolveMe(session) {
  if (!session) return null;
  const { data, error } = await sb.from('pessoas').select('*').eq('auth_user_id', session.user.id).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  state.me = await resolveMe(session);
  if (session && !state.me) {
    const erroEl = document.getElementById('login-erro');
    erroEl.textContent = 'Sua conta ainda não foi vinculada a uma pessoa. Fale com o administrador.';
    erroEl.classList.remove('hidden');
    await sb.auth.signOut();
    state.session = null;
  }
  if (state.me) state.currentUserId = state.me.id;
  renderAuthGate();
  if (state.me) loadAll();
}

function renderAuthGate() {
  const logged = !!state.me;
  document.getElementById('login-screen').classList.toggle('hidden', logged);
  document.getElementById('app').classList.toggle('hidden', !logged);
  if (logged) document.getElementById('header-user-nome').textContent = state.me.nome;
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin()));
}

sb.auth.onAuthStateChange((_event, session) => {
  state.session = session;
  if (!session) { state.me = null; state.currentUserId = ''; renderAuthGate(); }
});

// ── Renderização principal ──────────────────────────────────
const app = {

  // Tabs
  setTab(tab) {
    state.activeTab = tab;
    if (tab === 'tarefas' && !state.tarefasCarregadas) { loadTarefas(); return; } // loadTarefas() já chama render()
    render();
  },

  // Busca
  onBuscaChange(v) {
    state.busca = v;
    render();
  },

  // Filtros/ordenação estilo Excel
  toggleSort(col) {
    if (state.sort.col === col) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else state.sort = { col, dir: 'asc' };
    renderLista();
  },
  openFilterPanel(col) {
    state.openFilterPanel = col;
    state.filterSearch = '';
    // Sem filtro ativo, o painel abre com tudo desmarcado — só filtra o que
    // for marcado de propósito (em vez do padrão "tudo marcado = sem filtro").
    state.filterDraft = state.colFilters[col] ? new Set(state.colFilters[col]) : new Set();
    renderLista();
  },
  closeFilterPanel() {
    state.openFilterPanel = null;
    state.filterDraft = null;
    state.filterSearch = '';
    renderLista();
  },
  cancelFilterPanel() { app.closeFilterPanel(); },
  toggleFilterOption(col, value) {
    if (state.filterDraft.has(value)) state.filterDraft.delete(value); else state.filterDraft.add(value);
    renderLista();
  },
  // "Selecionar tudo"/"Limpar" agem só sobre o que está visível (respeita a busca do painel).
  filterSelectAll(col) {
    visibleFilterOptions(col).forEach(o => state.filterDraft.add(o.value));
    renderLista();
  },
  filterClear(col) {
    if (!state.filterSearch) { state.filterDraft = new Set(); renderLista(); return; }
    visibleFilterOptions(col).forEach(o => state.filterDraft.delete(o.value));
    renderLista();
  },
  setFilterSearch(col, value) {
    state.filterSearch = value;
    renderLista();
    const input = document.querySelector('.col-filter-panel .cf-search input');
    if (input) { input.focus(); const pos = value.length; input.setSelectionRange(pos, pos); }
  },
  applyFilterPanel() {
    const col = state.openFilterPanel;
    const total = Tabela.buildFilterOptions(rowsForFilterOptions(col), col).length;
    // Nada marcado ou tudo marcado dão o mesmo resultado (mostra tudo) — os
    // dois viram "sem filtro" pra não sumir a lista quando ninguém escolheu nada.
    const n = state.filterDraft.size;
    state.colFilters[col] = (n === 0 || n === total) ? null : new Set(state.filterDraft);
    state.openFilterPanel = null;
    state.filterDraft = null;
    state.filterSearch = '';
    renderLista();
  },
  clearAllFilters() {
    Object.keys(state.colFilters).forEach(k => { state.colFilters[k] = null; });
    state.quickFilter = null;
    renderLista();
    if (!document.getElementById('mobile-filters-overlay').classList.contains('hidden')) renderMobileFilters();
  },

  // Clique num card do Dashboard: leva pra Lista já filtrada pelo critério do KPI.
  filterFromKpi(kind) {
    state.colFilters = { setor: null, criticidade: null, status: null, responsavel_id: null, aberto_por_id: null };
    state.quickFilter = null;
    if (kind === 'vencidos') state.quickFilter = 'vencidos';
    else if (kind === 'criticos') { state.colFilters.criticidade = new Set(['Alta']); state.colFilters.status = new Set(OPEN_STATUSES); }
    else if (STATUSES.includes(kind)) state.colFilters.status = new Set([kind]);
    app.setTab('lista');
  },
  openMobileFilters() {
    renderMobileFilters();
    document.getElementById('mobile-filters-overlay').classList.remove('hidden');
  },
  closeMobileFilters() {
    document.getElementById('mobile-filters-overlay').classList.add('hidden');
  },
  toggleMobileFilterOption(col, value) {
    const opts = Tabela.buildFilterOptions(rowsForFilterOptions(col), col);
    const cur = state.colFilters[col] ? new Set(state.colFilters[col]) : new Set();
    if (cur.has(value)) cur.delete(value); else cur.add(value);
    state.colFilters[col] = (cur.size === 0 || cur.size === opts.length) ? null : cur;
    renderLista();
    renderMobileFilters();
  },
  setMobileSort(col, dir) {
    state.sort = { col, dir };
    renderLista();
    renderMobileFilters();
  },

  // Login / Logout
  async login() {
    const nome = document.getElementById('login-nome').value.trim();
    const email = Auth.nomeToEmail(nome);
    const senha = document.getElementById('login-senha').value;
    const erroEl = document.getElementById('login-erro');
    erroEl.classList.add('hidden');
    if (!email) { erroEl.textContent = 'Digite seu nome.'; erroEl.classList.remove('hidden'); return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) { erroEl.textContent = 'Nome ou senha inválidos.'; erroEl.classList.remove('hidden'); return; }
    await boot();
  },
  async logout() {
    await sb.auth.signOut();
    state.me = null;
    state.currentUserId = '';
    renderAuthGate();
  },

  // Quem está usando o sistema agora (mantido para compatibilidade interna)
  setCurrentUser(id) {
    state.currentUserId = id;
    state.tarefas = [];
    state.tarefasCarregadas = false;
    if (state.activeTab === 'tarefas') loadTarefas(); else render();
  },

  // ── Modal ──────────────────────────────────────────────────
  openNew() {
    state.modal = {
      mode: 'new',
      draft: {
        titulo: '', descricao: '', setor: '', criticidade: '', status: 'Aberto',
        responsavel_id: '', aberto_por_id: state.currentUserId, prazo: '', comentarios: [],
        anexos: [], pendentes: [], removidos: [],
      }
    };
    renderModal();
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
  },

  openEdit(p) {
    state.modal = {
      mode: 'edit',
      id: p.id,
      draft: {
        titulo: p.titulo, descricao: p.descricao || '', setor: p.setor,
        criticidade: p.criticidade, status: p.status, responsavel_id: p.responsavel_id,
        aberto_por_id: p.aberto_por_id, prazo: p.prazo || '', comentarios: p.comentarios || [],
        anexos: (p.anexos || []).slice(), pendentes: [], removidos: [],
      }
    };
    renderModal();
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
  },

  closeModal() {
    if (state.modal) (state.modal.draft.pendentes || []).forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    state.signedUrls = {};
    state.modal = null;
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.classList.remove('modal-open');
  },

  // ── Agenda (reuniões, palestras...) ───────────────────────
  agendaMesAnterior() {
    const { year, month } = state.agendaMes;
    const d = new Date(year, month - 1, 1);
    state.agendaMes = { year: d.getFullYear(), month: d.getMonth() };
    renderAgenda();
  },
  agendaMesProximo() {
    const { year, month } = state.agendaMes;
    const d = new Date(year, month + 1, 1);
    state.agendaMes = { year: d.getFullYear(), month: d.getMonth() };
    renderAgenda();
  },
  agendaMesHoje() {
    const d = new Date();
    state.agendaMes = { year: d.getFullYear(), month: d.getMonth() };
    renderAgenda();
  },

  openNewAgendamento(dataPreenchida) {
    state.modalAgendamento = {
      mode: 'new',
      draft: {
        titulo: '', tipo: 'Reunião', data: dataPreenchida || Tarefas.todayLocal(),
        hora_inicio: '', hora_fim: '', local: '', responsavel_id: '', descricao: '',
      }
    };
    renderAgendamentoModal();
    document.getElementById('modal-agendamento-overlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
  },

  openEditAgendamento(a) {
    state.modalAgendamento = {
      mode: 'edit',
      id: a.id,
      draft: {
        titulo: a.titulo, tipo: a.tipo, data: a.data,
        hora_inicio: a.hora_inicio || '', hora_fim: a.hora_fim || '',
        local: a.local || '', responsavel_id: a.responsavel_id || '', descricao: a.descricao || '',
      }
    };
    renderAgendamentoModal();
    document.getElementById('modal-agendamento-overlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
  },

  closeAgendamentoModal() {
    state.modalAgendamento = null;
    document.getElementById('modal-agendamento-overlay').classList.add('hidden');
    document.body.classList.remove('modal-open');
  },

  async saveAgendamento() {
    const m = state.modalAgendamento;
    if (!m) return;
    const d = m.draft;
    if (!d.titulo.trim() || !d.data || !d.hora_inicio) {
      showToast('Preencha título, data e horário de início.');
      return;
    }
    showLoading(true);
    try {
      const id = m.mode === 'new' ? crypto.randomUUID() : m.id;
      const payload = {
        id, titulo: d.titulo.trim(), tipo: d.tipo, data: d.data,
        hora_inicio: d.hora_inicio, hora_fim: d.hora_fim || null,
        local: d.local.trim(), responsavel_id: d.responsavel_id || null, descricao: d.descricao.trim(),
      };
      await upsertAgendamento(payload);
      app.closeAgendamentoModal();
      showToast(m.mode === 'new' ? 'Agendamento criado!' : 'Agendamento atualizado!');
      await loadAll();
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
      showLoading(false);
    }
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
      showToast('Selecione quem está abrindo a atividade.');
      return;
    }
    let uploaded = []; // anexos enviados neste salvamento (desfeitos se algo falhar)
    showLoading(true);
    try {
      const now = new Date().toISOString().slice(0, 10);
      const problemaId = modal.mode === 'new' ? crypto.randomUUID() : modal.id;
      const pend = d.pendentes || [];
      if (pend.length) {
        let done = 0;
        showLoading(true, `Enviando anexos (0/${pend.length})...`);
        const results = await Promise.allSettled(pend.map(async p => {
          const meta = await uploadAnexo(problemaId, p);
          done++;
          showLoading(true, `Enviando anexos (${done}/${pend.length})...`);
          return meta;
        }));
        uploaded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.find(r => r.status === 'rejected');
        if (failed) throw failed.reason;
      }
      showLoading(true, 'Salvando...');
      const payload = {
        id: problemaId,
        titulo: d.titulo.trim(),
        descricao: d.descricao || '',
        setor: d.setor,
        criticidade: d.criticidade,
        status: d.status || 'Aberto',
        responsavel_id: d.responsavel_id,
        aberto_por_id: d.aberto_por_id,
        prazo: d.prazo || null,
        comentarios: d.comentarios || [],
        anexos: (d.anexos || []).concat(uploaded),
      };
      if (modal.mode === 'new') {
        payload.criado_em = now;
        await upsertProblema(payload);
        state.problems.unshift(payload);
      } else {
        await upsertProblema(payload);
        const idx = state.problems.findIndex(p => p.id === modal.id);
        if (idx >= 0) state.problems[idx] = { ...state.problems[idx], ...payload };
      }
      uploaded = [];                        // gravado: nada a desfazer
      await removeFromStorage(d.removidos); // arquivos removidos pelo usuário (melhor esforço)
      app.closeModal();
      render();
      showToast(modal.mode === 'new' ? 'Atividade criada!' : 'Atividade atualizada!');
    } catch (e) {
      await removeFromStorage(uploaded.map(u => u.path)); // desfaz o lote enviado
      showToast('Erro ao salvar: ' + e.message, 5000);
    } finally {
      showLoading(false);
    }
  },

  // ── Anexos ──────────────────────────────────────────────
  onFilesSelected(input) {
    if (!state.modal) return;
    const d = state.modal.draft;
    const files = Array.from(input.files || []);
    input.value = '';
    const { accepted, rejected } = Anexos.validateFiles(files, d.anexos.length + d.pendentes.length);
    accepted.forEach(f => {
      const tipo = Anexos.resolveType(f);
      d.pendentes.push({
        tempId: crypto.randomUUID(), file: f, nome: f.name, tipo, tamanho: f.size,
        previewUrl: Anexos.isImage(tipo) ? URL.createObjectURL(f) : '',
      });
    });
    if (rejected.length) showToast(rejected.map(r => `${r.name}: ${r.reason}`).join(' • '), 6000);
    renderAnexos();
  },

  removeAnexo(i) {
    const d = state.modal.draft;
    const [a] = d.anexos.splice(i, 1);
    if (a) d.removidos.push(a.path);
    renderAnexos();
  },

  removePendente(i) {
    const [p] = state.modal.draft.pendentes.splice(i, 1);
    if (p && p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    renderAnexos();
  },

  async openAnexo(i) {
    const a = state.modal.draft.anexos[i];
    if (!a) return;
    const w = window.open('', '_blank'); // abre já, dentro do toque, para o navegador não bloquear
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.path, 3600);
    if (error || !data) { if (w) w.close(); showToast('Não foi possível abrir o arquivo.'); return; }
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else { window.location.href = data.signedUrl; }
  },

  addComment() {
    if (!state.modal) return;
    const input = document.getElementById('novo-comentario');
    const texto = input.value.trim();
    const autor = state.pessoas.find(p => p.id === document.getElementById('comentario-autor').value);
    if (!autor) { showToast('Escolha quem está comentando.'); return; }
    if (!texto) return;
    // Não muda "Você é" (o cabeçalho) — essa escolha vale só para este comentário.
    state.modal.draft.comentarios = [
      { autor: autor.nome, texto, data: new Date().toISOString().slice(0, 10) },
      ...(state.modal.draft.comentarios || []),
    ];
    input.value = '';
    renderComentarios();
  },

  // ── Excluir problema / agendamento (confirm-modal compartilhado) ──
  confirmDelete() {
    if (!state.modal) return;
    const p = state.problems.find(x => x.id === state.modal.id);
    state.deleteTarget = state.modal.id;
    state.deleteTargetType = 'problema';
    document.getElementById('confirm-text').textContent =
      `Tem certeza que deseja excluir "${p ? p.titulo : 'esta atividade'}"? Esta ação não pode ser desfeita.`;
    document.getElementById('confirm-modal').classList.remove('hidden');
  },

  confirmDeleteAgendamento() {
    if (!state.modalAgendamento) return;
    const a = state.agendamentos.find(x => x.id === state.modalAgendamento.id);
    state.deleteTarget = state.modalAgendamento.id;
    state.deleteTargetType = 'agendamento';
    document.getElementById('confirm-text').textContent =
      `Tem certeza que deseja excluir "${a ? a.titulo : 'este agendamento'}"? Esta ação não pode ser desfeita.`;
    document.getElementById('confirm-modal').classList.remove('hidden');
  },

  async doDelete() {
    const id = state.deleteTarget;
    const tipo = state.deleteTargetType;
    if (!id) return;
    document.getElementById('confirm-modal').classList.add('hidden');
    showLoading(true);
    try {
      if (tipo === 'agendamento') {
        await deleteAgendamentoDB(id);
        state.agendamentos = state.agendamentos.filter(a => a.id !== id);
        app.closeAgendamentoModal();
        render();
        showToast('Agendamento excluído.');
      } else {
        const paths = ((state.problems.find(p => p.id === id) || {}).anexos || []).map(a => a.path);
        await deleteProblemaDB(id);
        await removeFromStorage(paths);
        state.problems = state.problems.filter(p => p.id !== id);
        app.closeModal();
        render();
        showToast('Atividade excluída.');
      }
    } catch (e) {
      showToast('Erro ao excluir: ' + e.message, 5000);
    } finally {
      showLoading(false);
      state.deleteTarget = null;
      state.deleteTargetType = null;
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
      const ok = confirm(`${pessoa ? pessoa.nome : 'Esta pessoa'} é responsável por ${afetados.length} atividade(s) em aberto. Remover mesmo assim?`);
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

  async renamePessoa(id, novoNomeBruto) {
    const nome = novoNomeBruto.trim();
    const pessoa = state.pessoas.find(p => p.id === id);
    if (!pessoa || !nome || nome === pessoa.nome) { renderConfig(); return; }
    try {
      await sb.from('pessoas').update({ nome }).eq('id', id);
      pessoa.nome = nome;
      render();
      showToast('Nome atualizado!');
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
      renderConfig();
    }
  },

  // Setor é texto livre repetido em problemas.setor e pessoas.setor (sem FK) —
  // renomear precisa propagar nas 3 tabelas pra não deixar registro órfão.
  async renameSetor(nomeAntigo, novoNomeBruto) {
    const novoNome = novoNomeBruto.trim();
    if (!novoNome || novoNome === nomeAntigo) { renderConfig(); return; }
    if (state.setores.find(s => s.nome === novoNome)) {
      showToast('Já existe um setor com esse nome.', 4000);
      renderConfig();
      return;
    }
    showLoading(true);
    try {
      await sb.from('setores').update({ nome: novoNome }).eq('nome', nomeAntigo);
      await sb.from('problemas').update({ setor: novoNome }).eq('setor', nomeAntigo);
      await sb.from('pessoas').update({ setor: novoNome }).eq('setor', nomeAntigo);
      await loadAll();
      showToast('Setor renomeado!');
    } catch (e) {
      showToast('Erro: ' + e.message, 4000);
      showLoading(false);
    }
  },

  // ── Tarefas diárias ────────────────────────────────────────
  // Navegação por data: hoje é a lista viva (state.tarefas); qualquer outra
  // data é histórico só-leitura (busca em tarefa_conclusoes).
  setTarefasData(data) {
    state.tarefasData = data;
    if (data === Tarefas.todayLocal()) { renderTarefas(); return; }
    loadTarefasHistorico(data);
  },
  tarefasDataAnterior() { app.setTarefasData(Tarefas.shiftDate(state.tarefasData, -1)); },
  tarefasDataProxima() {
    const proxima = Tarefas.shiftDate(state.tarefasData, 1);
    if (proxima > Tarefas.todayLocal()) return; // sem agendamento futuro, só "voltar"
    app.setTarefasData(proxima);
  },
  tarefasDataHoje() { app.setTarefasData(Tarefas.todayLocal()); },
  onTarefasDataInput(value) {
    if (!value) return;
    const hoje = Tarefas.todayLocal();
    app.setTarefasData(value > hoje ? hoje : value);
  },

  setTarefasFiltro(filtro) {
    state.tarefasFiltro = filtro;
    renderTarefas();
  },

  novaTarefa(rotineira) {
    if (!state.currentUserId) return;
    const lista = state.tarefas.filter(t => t.rotineira === rotineira).sort((a, b) => a.ordem - b.ordem);
    const ordem = Tarefas.ordemEntre(lista.length ? lista[lista.length - 1].ordem : null, null);
    const item = { id: crypto.randomUUID(), pessoa_id: state.currentUserId, texto: '', rotineira, concluida_em: null, ordem, _novo: true };
    state.tarefas.push(item);
    renderTarefas();
    setTimeout(() => { const el = document.getElementById('tarefa-' + item.id); if (el) el.focus(); }, 0);
  },

  async salvarTextoTarefa(id, texto) {
    const t = state.tarefas.find(x => x.id === id);
    if (!t) return;
    t.texto = texto;
    if (!texto.trim()) {
      if (t._novo) { state.tarefas = state.tarefas.filter(x => x.id !== id); renderTarefas(); }
      return;
    }
    delete t._novo;
    // Sem renderTarefas() aqui: o DOM já mostra o texto certo (é o que o usuário
    // digitou); re-renderizar depois do await destruiria o nó recém-focado.
    try {
      await sb.from('tarefas').upsert({ id: t.id, pessoa_id: t.pessoa_id, texto: t.texto, rotineira: t.rotineira, concluida_em: t.concluida_em, ordem: t.ordem });
    } catch (e) {
      showToast('Erro ao salvar tarefa: ' + e.message, 4000);
    }
  },

  async toggleTarefa(id) {
    const t = state.tarefas.find(x => x.id === id);
    if (!t) return;
    const feita = Tarefas.estaConcluidaHoje(t);
    const dataAnterior = t.concluida_em;
    t.concluida_em = feita ? null : Tarefas.todayLocal();
    renderTarefas();
    try {
      await sb.from('tarefas').update({ concluida_em: t.concluida_em }).eq('id', id);
      // Log separado pra dar pra "voltar" e ver o que foi concluído em
      // qualquer data — tarefas.concluida_em sozinho não guarda histórico.
      if (feita) {
        if (dataAnterior) await sb.from('tarefa_conclusoes').delete().eq('tarefa_id', id).eq('data', dataAnterior);
      } else {
        await sb.from('tarefa_conclusoes').upsert(
          { tarefa_id: id, pessoa_id: t.pessoa_id, data: t.concluida_em },
          { onConflict: 'tarefa_id,data' }
        );
      }
    } catch (e) { showToast('Erro: ' + e.message, 4000); }
  },

  async toggleRotineira(id) {
    const t = state.tarefas.find(x => x.id === id);
    if (!t) return;
    t.rotineira = !t.rotineira;
    renderTarefas();
    try { await sb.from('tarefas').update({ rotineira: t.rotineira }).eq('id', id); }
    catch (e) { showToast('Erro: ' + e.message, 4000); }
  },

  async removeTarefa(id) {
    state.tarefas = state.tarefas.filter(x => x.id !== id);
    renderTarefas();
    try { await sb.from('tarefas').delete().eq('id', id); }
    catch (e) { showToast('Erro: ' + e.message, 4000); }
  },

  tarefaKeydown(e, id) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = state.tarefas.find(x => x.id === id);
      const rotineira = t ? t.rotineira : false;
      app.salvarTextoTarefa(id, e.target.value);
      app.novaTarefa(rotineira);
    }
    if (e.key === 'Backspace' && e.target.value === '') {
      e.preventDefault();
      app.removeTarefa(id);
    }
  },
};

// ── Render helpers ─────────────────────────────────────────
function getEnriched(p) {
  const resp = state.pessoas.find(t => t.id === p.responsavel_id);
  const abertoPor = state.pessoas.find(t => t.id === p.aberto_por_id);
  const isOpen = OPEN_STATUSES.includes(p.status);
  const vencido = isOpen && p.prazo && daysSince(p.prazo) > 0;
  return {
    ...p,
    critCls: critClass(p.criticidade),
    statusCls: statusClass(p.status),
    vencido,
    responsavelNome: resp ? resp.nome : (p.responsavel_id ? 'Pessoa removida' : 'Não atribuído'),
    responsavelIniciais: resp ? initials(resp.nome) : '–',
    abertoPorNome: abertoPor ? abertoPor.nome : (p.aberto_por_id ? 'Pessoa removida' : '—'),
    prazoFmt: fmtDate(p.prazo),
    criadoFmt: fmtDate(p.criado_em),
    diasAberto: daysSince(p.criado_em),
  };
}

const SORT_FIELD = { responsavel_id: 'responsavelNome', aberto_por_id: 'abertoPorNome' };

function buscaFiltrada(problems, busca) {
  const q = busca.trim().toLowerCase();
  return problems.filter(p => !q || p.titulo.toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q));
}

// Linhas para montar as opções de um painel: filtradas pela busca e por TODAS
// as outras colunas, exceto a própria (para o painel mostrar todos os valores
// possíveis daquela coluna, como no Excel).
function rowsForFilterOptions(excludeCol) {
  const rows = buscaFiltrada(state.problems, state.busca).map(p => getEnriched(p));
  return Tabela.applyColFilters(rows, { ...state.colFilters, [excludeCol]: null });
}

// Opções do painel de filtro após a busca digitada dentro dele (state.filterSearch).
function visibleFilterOptions(col) {
  const all = Tabela.buildFilterOptions(rowsForFilterOptions(col), col);
  const q = (state.filterSearch || '').trim().toLowerCase();
  return q ? all.filter(o => o.label.toLowerCase().includes(q)) : all;
}

const FILTER_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>';

function tarefaIconSvg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const ICON_REPEAT = tarefaIconSvg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>');
const ICON_X = tarefaIconSvg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const ICON_PLUS = tarefaIconSvg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
const ICON_CHECK_SMALL = tarefaIconSvg('<polyline points="20 6 9 17 4 12"/>');
const ICON_CHEVRON_LEFT = tarefaIconSvg('<polyline points="15 18 9 12 15 6"/>');
const ICON_CHEVRON_RIGHT = tarefaIconSvg('<polyline points="9 18 15 12 9 6"/>');

function getFiltered() {
  const rows = buscaFiltrada(state.problems, state.busca).map(p => getEnriched(p));
  let filtered = Tabela.applyColFilters(rows, state.colFilters);
  if (state.quickFilter === 'vencidos') filtered = filtered.filter(p => p.vencido);
  return Tabela.sortRows(filtered, SORT_FIELD[state.sort.col] || state.sort.col, state.sort.dir);
}

// ── Render completo ─────────────────────────────────────────
function render() {
  renderCurrentUserSelect();
  renderTabs();
  renderLista();
  renderDashboard();
  renderConfig();
  renderTarefas();
  renderAgenda();
}

function renderCurrentUserSelect() {
  const sel = document.getElementById('current-user-select');
  if (!sel) return; // elemento removido do HTML (Mapeamento de Atividades)
  const prev = sel.value || state.currentUserId;
  sel.innerHTML = `<option value="">Selecione</option>` +
    state.pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === prev ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  if (prev) sel.value = prev;
}

function renderTabs() {
  if (state.activeTab === 'config' && !isAdmin()) state.activeTab = 'dashboard'; // perdeu acesso: sai da aba
  const { activeTab } = state;
  document.getElementById('tab-config').classList.toggle('hidden', !isAdmin());
  ['lista', 'dashboard', 'config', 'tarefas', 'agenda'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', activeTab === t);
    document.getElementById('view-' + t).classList.toggle('hidden', activeTab !== t);
  });
  document.getElementById('filters-bar').classList.toggle('hidden', activeTab !== 'lista');
}

function renderComentarioAutor() {
  const sel = document.getElementById('comentario-autor');
  sel.innerHTML = `<option value="">Quem está comentando?</option>` +
    state.pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === state.currentUserId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
}

const COLS = [
  { key: 'titulo', label: 'Título', filtravel: false },
  { key: 'setor', label: 'Setor', filtravel: true },
  { key: 'criticidade', label: 'Criticidade', filtravel: true },
  { key: 'responsavel_id', label: 'Responsável', filtravel: true },
  { key: 'status', label: 'Status', filtravel: true },
  { key: 'prazo', label: 'Prazo', filtravel: false },
  { key: 'aberto_por_id', label: 'Aberto por', filtravel: true },
];

function renderFilterPanelHTML(colKey) {
  const allOptions = Tabela.buildFilterOptions(rowsForFilterOptions(colKey), colKey);
  const options = visibleFilterOptions(colKey);
  const draft = state.filterDraft || new Set();
  const items = options.map(o => `
    <label class="cf-item">
      <input type="checkbox" ${draft.has(o.value) ? 'checked' : ''} onchange="app.toggleFilterOption('${colKey}','${esc(o.value)}')">
      <span>${esc(o.label)}</span><span class="cf-count">${o.count}</span>
    </label>`).join('') || '<div class="cf-item muted">Nenhum valor encontrado</div>';
  const search = allOptions.length > 6
    ? `<div class="cf-search"><input type="text" placeholder="Buscar..." value="${esc(state.filterSearch || '')}" oninput="app.setFilterSearch('${colKey}', this.value)" onclick="event.stopPropagation()"></div>`
    : '';
  return `
    <div class="col-filter-panel" onclick="event.stopPropagation()">
      <div class="cf-actions"><button type="button" onclick="app.filterSelectAll('${colKey}')">Selecionar tudo</button><button type="button" onclick="app.filterClear('${colKey}')">Limpar</button></div>
      ${search}
      <div class="cf-list">${items}</div>
      <div class="cf-buttons">
        <button type="button" class="btn btn-secondary btn-sm" onclick="app.cancelFilterPanel()">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="app.applyFilterPanel()">OK</button>
      </div>
    </div>`;
}

function renderThead() {
  document.getElementById('thead-row').innerHTML = COLS.map(c => {
    const activeSort = state.sort.col === c.key;
    const ind = activeSort ? (state.sort.dir === 'desc' ? '▼' : '▲') : '';
    const filterOn = c.filtravel && state.colFilters[c.key];
    const icon = c.filtravel
      ? `<button type="button" class="filter-icon${filterOn ? ' active' : ''}" onclick="event.stopPropagation();app.openFilterPanel('${c.key}')" aria-label="Filtrar ${esc(c.label)}">${FILTER_ICON_SVG}</button>`
      : '';
    const panel = state.openFilterPanel === c.key ? renderFilterPanelHTML(c.key) : '';
    return `<th class="th"><div class="th-flex"><span class="th-inner" onclick="app.toggleSort('${c.key}')">${esc(c.label)}<span class="sort-ind">${ind}</span></span>${icon}</div>${panel}</th>`;
  }).join('');
}

function renderMobileFilters() {
  const sections = COLS.filter(c => c.filtravel).map(c => {
    const opts = Tabela.buildFilterOptions(rowsForFilterOptions(c.key), c.key);
    const active = state.colFilters[c.key];
    const items = opts.map(o => `
      <label class="cf-item">
        <input type="checkbox" ${(active && active.has(o.value)) ? 'checked' : ''} onchange="app.toggleMobileFilterOption('${c.key}','${esc(o.value)}')">
        <span>${esc(o.label)}</span><span class="cf-count">${o.count}</span>
      </label>`).join('') || '<div class="muted">Nenhum valor</div>';
    return `<div class="mf-section"><div class="mf-section-title">${esc(c.label)}</div>${items}</div>`;
  }).join('');
  const sortSection = `<div class="mf-section">
    <div class="mf-section-title">Ordenar por</div>
    <select class="select" onchange="app.setMobileSort(this.value, state.sort.dir)">
      ${COLS.map(c => `<option value="${c.key}" ${state.sort.col === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
    </select>
    <div class="inline-form" style="margin-top:8px;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="app.setMobileSort(state.sort.col,'asc')">Crescente</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="app.setMobileSort(state.sort.col,'desc')">Decrescente</button>
    </div>
  </div>`;
  document.getElementById('mobile-filters-body').innerHTML = sections + sortSection;
}

function renderLista() {
  renderThead();
  document.getElementById('quick-filter-chip').innerHTML = state.quickFilter === 'vencidos'
    ? `<span class="chip">Vencidos<button type="button" class="round-btn" onclick="app.clearAllFilters()" aria-label="Limpar filtro">✕</button></span>`
    : '';
  const filtered = getFiltered();
  const tbody = document.getElementById('lista-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty"><td colspan="7" style="padding:60px;text-align:center;color:var(--text-2);">Nenhuma atividade encontrada com esses filtros.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(p => `
    <tr class="row" onclick="app.openEdit(state.problems.find(x=>x.id==='${esc(p.id)}'))">
      <td class="c-titulo">${esc(p.titulo)}${(p.anexos || []).length ? `<span class="clip" title="${p.anexos.length} anexo(s)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 11.6l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>${p.anexos.length}</span>` : ''}</td>
      <td class="c-setor" data-label="Setor">${esc(p.setor)}</td>
      <td class="c-crit"><span class="badge ${p.critCls}">${esc(p.criticidade)}</span></td>
      <td class="c-resp"><div class="resp"><span class="avatar">${esc(p.responsavelIniciais)}</span><span>${esc(p.responsavelNome)}</span></div></td>
      <td class="c-status"><span class="badge ${p.statusCls}">${esc(p.status)}</span></td>
      <td class="c-prazo${p.vencido ? ' vencido' : ''}" data-label="Prazo">${p.prazoFmt}</td>
      <td class="c-aberto" data-label="Aberto por">${esc(p.abertoPorNome)}</td>
    </tr>`).join('');
}

// Tendência de um KPI: quantos problemas que casam com o predicado foram
// CRIADOS nos últimos 7 dias vs. nos 7 dias anteriores. É a única
// comparação honesta com os dados que existem hoje — o banco não guarda
// histórico de mudança de status, só o estado atual (ver criado_em em
// public.problemas). Não confundir com "ficou vencido/resolvido essa
// semana": é "quantos problemas desse tipo nasceram essa semana".
function trendFor(allEnriched, pred) {
  const now = new Date();
  const startThis = new Date(now); startThis.setDate(startThis.getDate() - 7);
  const startPrev = new Date(now); startPrev.setDate(startPrev.getDate() - 14);
  let thisWeek = 0, prevWeek = 0;
  for (const p of allEnriched) {
    if (!pred(p) || !p.criado_em) continue;
    const d = new Date(p.criado_em + 'T00:00:00');
    if (d > startThis) thisWeek++;
    else if (d > startPrev) prevWeek++;
  }
  return { thisWeek, prevWeek, delta: thisWeek - prevWeek };
}

// data-tip é lido por um listener único (ver initChartTooltips) — assim o
// tooltip sobrevive a re-renders sem precisar reanexar handlers.
function showChartTooltip(el) {
  const tip = document.getElementById('chart-tooltip');
  tip.textContent = el.dataset.tip;
  tip.classList.remove('hidden');
}
function hideChartTooltip() {
  document.getElementById('chart-tooltip').classList.add('hidden');
}
function initChartTooltips() {
  const tip = document.getElementById('chart-tooltip');
  document.addEventListener('mousemove', e => {
    if (tip.classList.contains('hidden')) return;
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  });
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el) showChartTooltip(el);
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hideChartTooltip();
  });
  // Celular: mostra no toque, some no próximo toque em outro lugar.
  document.addEventListener('touchstart', e => {
    const el = e.target.closest('[data-tip]');
    if (el) { tip.style.left = '50%'; tip.style.top = 'auto'; tip.style.bottom = '90px'; tip.style.transform = 'translateX(-50%)'; showChartTooltip(el); }
    else hideChartTooltip();
  }, { passive: true });
}

function renderDashboard() {
  const allEnriched = state.problems.map(p => getEnriched(p));
  const openProblems = allEnriched.filter(p => OPEN_STATUSES.includes(p.status));

  // Ordem por urgência: o que precisa de ação primeiro, o resumo depois.
  // kind é o que app.filterFromKpi() usa pra saber que filtro aplicar na Lista.
  // trend: 'bad-up' (subir é ruim), 'good-up' (subir é bom) ou 'neutral' (sem juízo de valor).
  const kpiDefs = [
    { kind: 'vencidos',             label: 'Vencidos',             color: 'var(--danger)',                     pred: p => p.vencido, trend: 'bad-up' },
    { kind: 'criticos',             label: 'Críticos em aberto',   color: fgVar('crit', 'Alta'),               pred: p => p.criticidade === 'Alta' && OPEN_STATUSES.includes(p.status), trend: 'bad-up' },
    { kind: 'Aberto',               label: 'Abertos',              color: fgVar('st', 'Aberto'),               pred: p => p.status === 'Aberto', trend: 'bad-up' },
    { kind: 'Em andamento',         label: 'Em andamento',         color: fgVar('st', 'Em andamento'),         pred: p => p.status === 'Em andamento', trend: 'neutral' },
    { kind: 'Aguardando terceiros', label: 'Aguardando terceiros', color: fgVar('st', 'Aguardando terceiros'), pred: p => p.status === 'Aguardando terceiros', trend: 'neutral' },
    { kind: 'Resolvido',            label: 'Resolvidos',           color: fgVar('st', 'Resolvido'),            pred: p => p.status === 'Resolvido', trend: 'good-up' },
  ];

  // Chip de tendência bem enxuto (número + seta) — o texto por extenso vira
  // tooltip, pra manter o card objetivo/direto e não competir com o número.
  const trendChip = k => {
    const { thisWeek, prevWeek, delta } = trendFor(allEnriched, k.pred);
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '●';
    let cls = 'kpi-trend-neutral';
    if (k.trend !== 'neutral' && delta !== 0) cls = ((delta > 0) === (k.trend === 'bad-up')) ? 'kpi-trend-bad' : 'kpi-trend-good';
    const tip = `${thisWeek} novo${thisWeek === 1 ? '' : 's'} esta semana (${prevWeek} na anterior)`;
    return `<span class="kpi-trend ${cls}" data-tip="${esc(tip)}">${arrow} ${thisWeek} essa semana</span>`;
  };

  // Estilo "painel": bloco cheio da cor semântica, número enorme, mínimo texto.
  document.getElementById('kpi-grid').innerHTML = kpiDefs.map((k, i) => {
    const valor = allEnriched.filter(k.pred).length;
    return `
    <div class="card kpi fade-in${k.kind === 'vencidos' && valor > 0 ? ' kpi-alert' : ''}" style="animation-delay:${i * 45}ms" role="button" tabindex="0" aria-label="Ver ${esc(k.label)} na lista" onclick="app.filterFromKpi('${k.kind}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.filterFromKpi('${k.kind}')}">
      <div class="kpi-label" style="color:${k.color}">${esc(k.label)}</div>
      <div class="kpi-value" style="color:${k.color};">${valor}</div>
      <div class="kpi-foot">${trendChip(k)}</div>
    </div>`;
  }).join('');

  const antigos = openProblems.slice().sort((a, b) => b.diasAberto - a.diasAberto).slice(0, 5);
  const agingThreshold = 14;
  document.getElementById('antigos-list').innerHTML = antigos.length === 0
    ? '<div class="muted">Nenhuma atividade em aberto.</div>'
    : antigos.map(p => `
        <div class="old-item" role="button" tabindex="0" onclick="app.openEdit(state.problems.find(x=>x.id==='${esc(p.id)}'))" onkeydown="if(event.key==='Enter'){app.openEdit(state.problems.find(x=>x.id==='${esc(p.id)}'))}">
          <div class="old-main">
            <span class="old-title">${esc(p.titulo)}</span>
            <span class="badge badge-neutral">${esc(p.setor)}</span>
          </div>
          <span class="badge ${p.diasAberto >= agingThreshold ? 'crit-alta' : 'badge-neutral'}">${p.diasAberto} dia${p.diasAberto === 1 ? '' : 's'} em aberto</span>
        </div>`).join('');
}

function renderConfig() {
  // Setores chips (nome editável — clique e digite; salva ao sair do campo)
  document.getElementById('setores-chips').innerHTML = state.setores.map(s => `
    <span class="chip">
      <input type="text" class="chip-input" value="${esc(s.nome)}" style="width:${s.nome.length + 1.5}ch"
        onblur="app.renameSetor('${esc(s.nome)}', this.value)" onkeydown="if(event.key==='Enter')this.blur()" aria-label="Renomear setor ${esc(s.nome)}">
      <button class="round-btn" onclick="app.removeSetor('${esc(s.nome)}')" aria-label="Remover setor ${esc(s.nome)}">×</button>
    </span>`).join('');

  // Select setor config
  const novaPessoaSetorSel = document.getElementById('nova-pessoa-setor');
  novaPessoaSetorSel.innerHTML = `<option value="">Setor</option>` +
    state.setores.map(s => `<option value="${esc(s.nome)}">${esc(s.nome)}</option>`).join('');

  // Pessoas list (nome editável — mesmo padrão: clique, digite, salva ao sair do campo)
  document.getElementById('pessoas-list').innerHTML = state.pessoas.map(p => `
    <div class="person-row">
      <span class="avatar">${esc(initials(p.nome))}</span>
      <input type="text" class="name-input" value="${esc(p.nome)}"
        onblur="app.renamePessoa('${esc(p.id)}', this.value)" onkeydown="if(event.key==='Enter')this.blur()" aria-label="Nome de ${esc(p.nome)}">
      <select class="select" onchange="app.changePessoaSetor('${esc(p.id)}',this.value)" aria-label="Setor de ${esc(p.nome)}">
        ${state.setores.map(s => `<option value="${esc(s.nome)}" ${s.nome === p.setor ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
      </select>
      <button class="round-btn" onclick="app.removePessoa('${esc(p.id)}')" aria-label="Remover ${esc(p.nome)}">×</button>
    </div>`).join('');
}

const AGENDA_TIPO_CLASS = { 'Reunião': 'tipo-reuniao', 'Palestra': 'tipo-palestra', 'Outro': 'tipo-outro' };
const AGENDA_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; } // m: mês 0-indexado

function renderAgenda() {
  const { year, month } = state.agendaMes;
  document.getElementById('agenda-mes-titulo').textContent = `${AGENDA_MESES[month]} ${year}`;

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const hojeIso = Tarefas.todayLocal();

  const eventsByDate = new Map();
  for (const a of state.agendamentos) {
    if (!eventsByDate.has(a.data)) eventsByDate.set(a.data, []);
    eventsByDate.get(a.data).push(a);
  }
  for (const lista of eventsByDate.values()) lista.sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const m2 = month === 0 ? 11 : month - 1;
    const y2 = month === 0 ? year - 1 : year;
    cells.push({ day, iso: isoDate(y2, m2, day), outroMes: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: isoDate(year, month, d), outroMes: false });
  while (cells.length % 7 !== 0) {
    const [y, m, d] = cells[cells.length - 1].iso.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    cells.push({ day: next.getDate(), iso: isoDate(next.getFullYear(), next.getMonth(), next.getDate()), outroMes: true });
  }

  const MAX_VISIVEIS = 3;
  document.getElementById('agenda-grid').innerHTML = cells.map(c => {
    const eventos = eventsByDate.get(c.iso) || [];
    const visiveis = eventos.slice(0, MAX_VISIVEIS);
    const resto = eventos.length - visiveis.length;
    const chips = visiveis.map(a => `
      <div class="agenda-evento ${AGENDA_TIPO_CLASS[a.tipo] || 'tipo-outro'}" onclick="event.stopPropagation();app.openEditAgendamento(state.agendamentos.find(x=>x.id==='${esc(a.id)}'))">
        ${a.hora_inicio ? `<span class="agenda-evento-hora">${esc(a.hora_inicio.slice(0, 5))}</span>` : ''}${esc(a.titulo)}
      </div>`).join('');
    const maisChip = resto > 0
      ? `<div class="agenda-evento-mais" onclick="event.stopPropagation()" data-tip="${esc(eventos.slice(MAX_VISIVEIS).map(a => a.titulo).join(', '))}">+${resto} mais</div>`
      : '';
    return `
      <div class="agenda-dia${c.outroMes ? ' outro-mes' : ''}${c.iso === hojeIso ? ' hoje' : ''}" onclick="app.openNewAgendamento('${c.iso}')">
        <span class="agenda-dia-num">${c.day}</span>
        <div class="agenda-eventos">${chips}${maisChip}</div>
      </div>`;
  }).join('');
}

function renderAgendamentoModal() {
  const m = state.modalAgendamento;
  if (!m) return;
  const d = m.draft;
  document.getElementById('agendamento-modal-title').textContent = m.mode === 'new' ? 'Novo agendamento' : 'Editar agendamento';
  document.getElementById('ag-titulo').value = d.titulo;
  document.getElementById('ag-tipo').value = d.tipo;
  document.getElementById('ag-data').value = d.data;
  document.getElementById('ag-hora-inicio').value = d.hora_inicio;
  document.getElementById('ag-hora-fim').value = d.hora_fim;
  document.getElementById('ag-local').value = d.local;
  document.getElementById('ag-descricao').value = d.descricao;
  const respSel = document.getElementById('ag-responsavel');
  respSel.innerHTML = `<option value="">Selecione</option>` +
    state.pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === d.responsavel_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  document.getElementById('ag-btn-delete').classList.toggle('hidden', m.mode === 'new');

  document.getElementById('ag-titulo').oninput = e => { d.titulo = e.target.value; };
  document.getElementById('ag-tipo').onchange = e => { d.tipo = e.target.value; };
  document.getElementById('ag-data').onchange = e => { d.data = e.target.value; };
  document.getElementById('ag-hora-inicio').onchange = e => { d.hora_inicio = e.target.value; };
  document.getElementById('ag-hora-fim').onchange = e => { d.hora_fim = e.target.value; };
  document.getElementById('ag-local').oninput = e => { d.local = e.target.value; };
  document.getElementById('ag-responsavel').onchange = e => { d.responsavel_id = e.target.value; };
  document.getElementById('ag-descricao').oninput = e => { d.descricao = e.target.value; };
}

function tarefaPassaFiltro(t, filtro) {
  if (filtro === 'rotineiras') return t.rotineira;
  if (filtro === 'outras') return !t.rotineira;
  return true;
}

const ROTINEIRA_BADGE = `${ICON_REPEAT}<span class="badge-text">Rotineira</span>`;

function renderTarefaListaUnica() {
  const isHoje = state.tarefasData === Tarefas.todayLocal();
  const filtro = state.tarefasFiltro;

  if (!isHoje) {
    // Histórico só-leitura: mostra o que foi concluído em tarefasData, sem editar/adicionar.
    const itens = state.tarefasHistorico.filter(t => tarefaPassaFiltro(t, filtro));
    document.getElementById('tarefas-count').textContent = itens.length ? `${itens.length}` : '';
    document.getElementById('tarefas-lista').innerHTML = itens.length === 0
      ? '<div class="tarefa-empty">Nada concluído nesse dia.</div>'
      : itens.map(t => `
        <div class="tarefa-item feita tarefa-item-historico">
          <span class="tarefa-check-static">${ICON_CHECK_SMALL}</span>
          <span class="tarefa-historico-texto">${esc(t.texto)}</span>
          ${t.rotineira ? `<span class="tarefa-badge-rotineira on" style="pointer-events:none">${ROTINEIRA_BADGE}</span>` : ''}
        </div>`).join('');
    return;
  }

  const todos = state.tarefas.slice().sort((a, b) => a.ordem - b.ordem);
  const feitas = todos.filter(t => Tarefas.estaConcluidaHoje(t)).length;
  document.getElementById('tarefas-count').textContent = todos.length ? `${feitas}/${todos.length}` : '';

  const itens = todos.filter(t => tarefaPassaFiltro(t, filtro));
  const rows = itens.map(t => {
    const feita = Tarefas.estaConcluidaHoje(t);
    return `<div class="tarefa-item${feita ? ' feita' : ''}">
      <input type="checkbox" class="tarefa-check" ${feita ? 'checked' : ''} onchange="app.toggleTarefa('${t.id}')" aria-label="Marcar como feita">
      <input id="tarefa-${t.id}" type="text" value="${esc(t.texto)}" placeholder="Nova tarefa..."
        onkeydown="app.tarefaKeydown(event,'${t.id}')" onblur="app.salvarTextoTarefa('${t.id}', this.value)">
      <button type="button" class="tarefa-badge-rotineira${t.rotineira ? ' on' : ''}" onclick="app.toggleRotineira('${t.id}')"
        aria-pressed="${t.rotineira}" title="${t.rotineira ? 'Rotineira — desmarca sozinha todo dia' : 'Marcar como rotineira'}">${ROTINEIRA_BADGE}</button>
      <div class="tarefa-actions">
        <button type="button" title="Excluir" aria-label="Excluir tarefa" onclick="app.removeTarefa('${t.id}')">${ICON_X}</button>
      </div>
    </div>`;
  }).join('');
  const vazio = itens.length === 0
    ? `<div class="tarefa-empty">${filtro === 'todas' ? 'Nada por aqui ainda.' : 'Nenhuma tarefa aqui ainda.'}</div>`
    : '';
  document.getElementById('tarefas-lista').innerHTML = rows + vazio +
    `<button type="button" class="tarefa-add" onclick="app.novaTarefa(${filtro === 'rotineiras'})">${ICON_PLUS}Nova tarefa</button>`;
}

function renderTarefas() {
  const semPessoa = !state.currentUserId;
  document.getElementById('tarefas-sem-pessoa').classList.toggle('hidden', !semPessoa);
  document.getElementById('tarefas-conteudo').classList.toggle('hidden', semPessoa);
  if (semPessoa) return;

  const hoje = Tarefas.todayLocal();
  const isHoje = state.tarefasData === hoje;
  const dataFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(state.tarefasData + 'T00:00:00'));
  document.getElementById('tarefas-data').textContent = (dataFmt.charAt(0).toUpperCase() + dataFmt.slice(1)) + (isHoje ? ' · hoje' : '');
  document.getElementById('tarefas-data-input').value = state.tarefasData;
  document.getElementById('tarefas-data-next-btn').disabled = isHoje;
  document.getElementById('tarefas-data-hoje-btn').classList.toggle('hidden', isHoje);
  document.getElementById('tarefas-historico-aviso').classList.toggle('hidden', isHoje);
  document.querySelectorAll('.tarefas-filtro-pills .pill').forEach(el => {
    el.classList.toggle('active', el.dataset.filtro === state.tarefasFiltro);
  });

  renderTarefaListaUnica();
}

// ── Modal render ────────────────────────────────────────────
function renderModal() {
  const { modal, pessoas, setores } = state;
  if (!modal) return;
  const d = modal.draft;
  const isNew = modal.mode === 'new';
  const isEdit = modal.mode === 'edit';

  document.getElementById('modal-title').textContent = isNew ? 'Nova atividade' : 'Editar atividade';

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

  // Anexos
  renderAnexos();

  // Histórico
  document.getElementById('historico-section').classList.toggle('hidden', isNew);
  if (isEdit) { renderComentarios(); renderComentarioAutor(); }

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
    return `<button type="button" class="pill${active ? ' active' : ''}" onclick="app.setDraftStatus('${esc(st)}')">${esc(st)}</button>`;
  }).join('');
}

function renderAnexos() {
  const { modal } = state;
  if (!modal) return;
  const d = modal.draft;
  const total = d.anexos.length + d.pendentes.length;
  document.getElementById('anexos-count').innerHTML = total ? `<span class="muted">(${total}/${Anexos.MAX_FILES})</span>` : '';
  const item = (thumb, nome, meta, actions) => `
    <div class="anexo">
      <div class="anexo-thumb">${thumb}</div>
      <div class="anexo-info"><div class="anexo-nome" title="${esc(nome)}">${esc(nome)}</div><div class="anexo-meta">${meta}</div></div>
      <div class="anexo-actions">${actions}</div>
    </div>`;
  const saved = d.anexos.map((a, i) => item(
    Anexos.isImage(a.tipo) ? `<img data-path="${esc(a.path)}" alt="">` : esc(Anexos.typeLabel(a.tipo)),
    a.nome, `${esc(Anexos.typeLabel(a.tipo))} · ${Anexos.formatBytes(a.tamanho)}`,
    `<button type="button" class="btn btn-secondary btn-sm" onclick="app.openAnexo(${i})">Abrir</button>
     <button type="button" class="btn btn-danger-soft btn-sm" onclick="app.removeAnexo(${i})">Remover</button>`));
  const pend = d.pendentes.map((p, i) => item(
    p.previewUrl ? `<img src="${p.previewUrl}" alt="">` : esc(Anexos.typeLabel(p.tipo)),
    p.nome, `${esc(Anexos.typeLabel(p.tipo))} · ${Anexos.formatBytes(p.tamanho)} · será enviado ao salvar`,
    `<button type="button" class="btn btn-danger-soft btn-sm" onclick="app.removePendente(${i})">Remover</button>`));
  document.getElementById('anexos-list').innerHTML = saved.concat(pend).join('');
  hydrateThumbs();
}

async function hydrateThumbs() {
  const imgs = Array.from(document.querySelectorAll('#anexos-list img[data-path]'));
  const need = imgs.map(i => i.dataset.path).filter(p => !state.signedUrls[p]);
  if (need.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(need, 3600);
    (data || []).forEach(r => { if (r.signedUrl) state.signedUrls[r.path] = r.signedUrl; });
  }
  imgs.forEach(i => { const u = state.signedUrls[i.dataset.path]; if (u) i.src = u; });
}

function renderComentarios() {
  const { modal } = state;
  if (!modal) return;
  const comentarios = modal.draft.comentarios || [];
  const el = document.getElementById('comentarios-list');
  if (comentarios.length === 0) {
    el.innerHTML = '<div class="muted" style="margin-bottom:12px;">Nenhum comentário ainda.</div>';
    return;
  }
  el.innerHTML = comentarios.map(c => `
    <div class="comment">
      <div class="comment-head">
        <strong>${esc(c.autor)}</strong>
        <span>${fmtDate(c.data)}</span>
      </div>
      <div class="comment-text">${esc(c.texto)}</div>
    </div>`).join('');
}

// ── Confirm delete listeners ────────────────────────────────
document.getElementById('confirm-cancel').onclick = () => {
  document.getElementById('confirm-modal').classList.add('hidden');
  state.deleteTarget = null;
};
document.getElementById('confirm-ok').onclick = () => app.doDelete();

// ── Painel de filtro: fecha ao clicar fora ou apertar Esc ──
document.addEventListener('click', (e) => {
  if (state.openFilterPanel && !e.target.closest('.col-filter-panel') && !e.target.closest('.filter-icon')) {
    app.closeFilterPanel();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.openFilterPanel) app.closeFilterPanel();
});

// ── Init ────────────────────────────────────────────────────
document.getElementById('anexos-input').accept = Anexos.ACCEPT;
initChartTooltips();
boot();
