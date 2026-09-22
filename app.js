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

// ── Estado da aplicação ─────────────────────────────────────
const state = {
  problems: [],
  pessoas: [],
  setores: [],
  currentUserId: '',
  busca: '',
  colFilters: { setor: null, criticidade: null, status: null, responsavel_id: null, aberto_por_id: null },
  sort: { col: 'prazo', dir: 'asc' },
  openFilterPanel: null,
  filterDraft: null,
  activeTab: 'lista',
  modal: null, // { mode: 'new'|'edit', id?, draft: {} }
  novoComentario: '',
  deleteTarget: null,
  signedUrls: {}, // path -> URL assinada (miniaturas); limpa ao fechar o modal
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

  // Filtros/ordenação estilo Excel
  toggleSort(col) {
    if (state.sort.col === col) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else state.sort = { col, dir: 'asc' };
    renderLista();
  },
  openFilterPanel(col) {
    const total = Tabela.buildFilterOptions(rowsForFilterOptions(col), col).map(o => o.value);
    state.openFilterPanel = col;
    state.filterDraft = state.colFilters[col] ? new Set(state.colFilters[col]) : new Set(total);
    renderLista();
  },
  closeFilterPanel() {
    state.openFilterPanel = null;
    state.filterDraft = null;
    renderLista();
  },
  cancelFilterPanel() { app.closeFilterPanel(); },
  toggleFilterOption(col, value) {
    if (state.filterDraft.has(value)) state.filterDraft.delete(value); else state.filterDraft.add(value);
    renderLista();
  },
  filterSelectAll(col) {
    state.filterDraft = new Set(Tabela.buildFilterOptions(rowsForFilterOptions(col), col).map(o => o.value));
    renderLista();
  },
  filterClear() {
    state.filterDraft = new Set();
    renderLista();
  },
  applyFilterPanel() {
    const col = state.openFilterPanel;
    const total = Tabela.buildFilterOptions(rowsForFilterOptions(col), col).length;
    state.colFilters[col] = state.filterDraft.size === total ? null : new Set(state.filterDraft);
    state.openFilterPanel = null;
    state.filterDraft = null;
    renderLista();
  },
  clearAllFilters() {
    Object.keys(state.colFilters).forEach(k => { state.colFilters[k] = null; });
    renderLista();
    if (!document.getElementById('mobile-filters-overlay').classList.contains('hidden')) renderMobileFilters();
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
    const cur = state.colFilters[col] ? new Set(state.colFilters[col]) : new Set(opts.map(o => o.value));
    if (cur.has(value)) cur.delete(value); else cur.add(value);
    state.colFilters[col] = cur.size === opts.length ? null : cur;
    renderLista();
    renderMobileFilters();
  },
  setMobileSort(col, dir) {
    state.sort = { col, dir };
    renderLista();
    renderMobileFilters();
  },

  // Última pessoa escolhida como autora (comentários e "Aberto por" inicial)
  setComentarioAutor(id) {
    state.currentUserId = id;
    if (id) localStorage.setItem('probsys_user', id);
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
      showToast(modal.mode === 'new' ? 'Problema criado!' : 'Problema atualizado!');
    } catch (e) {
      await removeFromStorage(uploaded.map(u => u.path)); // desfaz o lote enviado
      showToast('Erro ao salvar: ' + e.message, 5000);
    } finally {
      showLoading(false);
    }
  },

  // ── Anexos ────────────────────────────────────────────────
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
    app.setComentarioAutor(autor.id);
    state.modal.draft.comentarios = [
      { autor: autor.nome, texto, data: new Date().toISOString().slice(0, 10) },
      ...(state.modal.draft.comentarios || []),
    ];
    input.value = '';
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
    const paths = ((state.problems.find(p => p.id === id) || {}).anexos || []).map(a => a.path);
    showLoading(true);
    try {
      await deleteProblemaDB(id);
      await removeFromStorage(paths);
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

function getFiltered() {
  const rows = buscaFiltrada(state.problems, state.busca).map(p => getEnriched(p));
  const filtered = Tabela.applyColFilters(rows, state.colFilters);
  return Tabela.sortRows(filtered, SORT_FIELD[state.sort.col] || state.sort.col, state.sort.dir);
}

// ── Render completo ─────────────────────────────────────────
function render() {
  renderTabs();
  renderLista();
  renderDashboard();
  renderConfig();
}

function renderTabs() {
  const { activeTab } = state;
  ['lista', 'dashboard', 'config'].forEach(t => {
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
  const options = Tabela.buildFilterOptions(rowsForFilterOptions(colKey), colKey);
  const draft = state.filterDraft || new Set();
  const items = options.map(o => `
    <label class="cf-item">
      <input type="checkbox" ${draft.has(o.value) ? 'checked' : ''} onchange="app.toggleFilterOption('${colKey}','${esc(o.value)}')">
      <span>${esc(o.label)}</span><span class="cf-count">${o.count}</span>
    </label>`).join('') || '<div class="cf-item muted">Nenhum valor</div>';
  return `
    <div class="col-filter-panel" onclick="event.stopPropagation()">
      <div class="cf-actions"><button type="button" onclick="app.filterSelectAll('${colKey}')">Selecionar tudo</button><button type="button" onclick="app.filterClear()">Limpar</button></div>
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
      ? `<button type="button" class="filter-icon${filterOn ? ' active' : ''}" onclick="event.stopPropagation();app.openFilterPanel('${c.key}')" aria-label="Filtrar ${esc(c.label)}">▽</button>`
      : '';
    const panel = state.openFilterPanel === c.key ? renderFilterPanelHTML(c.key) : '';
    return `<th class="th"><span class="th-inner" onclick="app.toggleSort('${c.key}')">${esc(c.label)}<span class="sort-ind">${ind}</span></span>${icon}${panel}</th>`;
  }).join('');
}

function renderMobileFilters() {
  const sections = COLS.filter(c => c.filtravel).map(c => {
    const opts = Tabela.buildFilterOptions(rowsForFilterOptions(c.key), c.key);
    const active = state.colFilters[c.key];
    const items = opts.map(o => `
      <label class="cf-item">
        <input type="checkbox" ${(!active || active.has(o.value)) ? 'checked' : ''} onchange="app.toggleMobileFilterOption('${c.key}','${esc(o.value)}')">
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
  const filtered = getFiltered();
  const tbody = document.getElementById('lista-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty"><td colspan="7" style="padding:60px;text-align:center;color:var(--text-2);">Nenhum problema encontrado com esses filtros.</td></tr>`;
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

function renderDashboard() {
  const allEnriched = state.problems.map(p => getEnriched(p));
  const openProblems = allEnriched.filter(p => OPEN_STATUSES.includes(p.status));

  const spark = (pred, color) => {
    const counts = state.setores.map(s => allEnriched.filter(p => p.setor === s.nome && pred(p)).length);
    const max = Math.max(1, ...counts);
    return counts.map(c => `<div style="width:6px;border-radius:2px;height:${Math.max(4, Math.round(c / max * 26))}px;background:${color};opacity:${c > 0 ? 1 : 0.3};flex-shrink:0;"></div>`).join('');
  };

  const kpiDefs = [
    { label: 'Abertos',              color: fgVar('st', 'Aberto'),               pred: p => p.status === 'Aberto' },
    { label: 'Em andamento',         color: fgVar('st', 'Em andamento'),         pred: p => p.status === 'Em andamento' },
    { label: 'Aguardando terceiros', color: fgVar('st', 'Aguardando terceiros'), pred: p => p.status === 'Aguardando terceiros' },
    { label: 'Críticos em aberto',   color: fgVar('crit', 'Alta'),               pred: p => p.criticidade === 'Alta' && OPEN_STATUSES.includes(p.status) },
    { label: 'Resolvidos',           color: fgVar('st', 'Resolvido'),            pred: p => p.status === 'Resolvido' },
  ];

  document.getElementById('kpi-grid').innerHTML = kpiDefs.map(k => `
    <div class="card kpi">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-body">
        <div class="kpi-value" style="color:${k.color};">${allEnriched.filter(k.pred).length}</div>
        <div class="kpi-spark">${spark(k.pred, k.color)}</div>
      </div>
      <div class="kpi-foot">por setor</div>
    </div>`).join('');

  const barRow = (label, count, max, color) => `
    <div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count / max * 100)}%;background:${color};"></div></div>
      <span class="bar-count">${count}</span>
    </div>`;

  const setorCounts = state.setores.map(s => ({ setor: s.nome, count: openProblems.filter(p => p.setor === s.nome).length }));
  const maxSetor = Math.max(1, ...setorCounts.map(r => r.count));
  document.getElementById('bar-setor').innerHTML = setorCounts.map(r => barRow(r.setor, r.count, maxSetor, 'var(--brand)')).join('');

  const critCounts = ['Alta', 'Média', 'Baixa'].map(criticidade => ({ criticidade, count: openProblems.filter(p => p.criticidade === criticidade).length }));
  const maxCrit = Math.max(1, ...critCounts.map(r => r.count));
  document.getElementById('bar-criticidade').innerHTML = critCounts.map(r => barRow(r.criticidade, r.count, maxCrit, fgVar('crit', r.criticidade))).join('');

  const antigos = openProblems.slice().sort((a, b) => b.diasAberto - a.diasAberto).slice(0, 5);
  const agingThreshold = 14;
  document.getElementById('antigos-list').innerHTML = antigos.length === 0
    ? '<div class="muted">Nenhum problema em aberto.</div>'
    : antigos.map(p => `
        <div class="old-item">
          <div class="old-main">
            <span class="old-title">${esc(p.titulo)}</span>
            <span class="badge badge-neutral">${esc(p.setor)}</span>
          </div>
          <span class="badge ${p.diasAberto >= agingThreshold ? 'crit-alta' : 'badge-neutral'}">${p.diasAberto} dia${p.diasAberto === 1 ? '' : 's'} em aberto</span>
        </div>`).join('');
}

function renderConfig() {
  // Setores chips
  document.getElementById('setores-chips').innerHTML = state.setores.map(s => `
    <span class="chip">
      ${esc(s.nome)}
      <button class="round-btn" onclick="app.removeSetor('${esc(s.nome)}')" aria-label="Remover setor ${esc(s.nome)}">×</button>
    </span>`).join('');

  // Select setor config
  const novaPessoaSetorSel = document.getElementById('nova-pessoa-setor');
  novaPessoaSetorSel.innerHTML = `<option value="">Setor</option>` +
    state.setores.map(s => `<option value="${esc(s.nome)}">${esc(s.nome)}</option>`).join('');

  // Pessoas list
  document.getElementById('pessoas-list').innerHTML = state.pessoas.map(p => `
    <div class="person-row">
      <span class="avatar">${esc(initials(p.nome))}</span>
      <span class="name">${esc(p.nome)}</span>
      <select class="select" onchange="app.changePessoaSetor('${esc(p.id)}',this.value)" aria-label="Setor de ${esc(p.nome)}">
        ${state.setores.map(s => `<option value="${esc(s.nome)}" ${s.nome === p.setor ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
      </select>
      <button class="round-btn" onclick="app.removePessoa('${esc(p.id)}')" aria-label="Remover ${esc(p.nome)}">×</button>
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
loadAll();
