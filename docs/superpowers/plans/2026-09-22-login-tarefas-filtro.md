# Login, Tarefas Diárias e Filtro Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os 3 filtros de lista suspensa por filtro/ordenação estilo Excel no cabeçalho da tabela; adicionar login real (Supabase Auth) com trava de RLS e papéis membro/admin; adicionar uma aba de tarefas diárias pessoais com itens rotineiros e contínuos.

**Architecture:** Mesmo app estático (HTML + JS vanilla + Supabase JS). Lógica pura nova em dois módulos testáveis em Node (`tabela.js`, `tarefas.js`), no padrão de `anexos.js`. Login usa Supabase Auth (e-mail+senha) com a identidade da pessoa lida de `pessoas.auth_user_id`; a trava de acesso real vem de RLS no Postgres, não da tela. Entregue em 3 fases independentes na ordem: filtro (sem banco) → login (schema aditivo → contas → frontend → trava de RLS) → tarefas diárias (depende do login).

**Tech Stack:** HTML/CSS/JS vanilla, `@supabase/supabase-js@2` (CDN), Supabase Auth + Postgres RLS, `node --test`, Edge/Chrome headless + `playwright-core`.

**Spec:** `docs/superpowers/specs/2026-09-22-login-tarefas-filtro-design.md`

## Global Constraints

- Colunas com filtro estilo Excel: Setor, Criticidade, Status, Responsável, Aberto por. Painel com "Selecionar tudo"/"Limpar" + checkboxes + contagem + OK/Cancelar (só aplica no OK). Funil destacado quando há filtro ativo na coluna.
- Ordenação por clique no nome da coluna, alterna asc/desc. Criticidade ordena Baixa→Média→Alta; Status ordena Aberto→Em andamento→Aguardando terceiros→Resolvido→Cancelado. Prazo sem valor sempre por último, em qualquer direção. Padrão inicial: Prazo crescente.
- No celular, um botão "Filtros" abre painel em tela cheia com as 5 colunas + controle de ordenação.
- Login: Supabase Auth; `pessoas.auth_user_id` (liga à conta) e `pessoas.role` (`membro`|`admin`). Sem cadastro público. "Aberto por" e "quem está comentando" deixam de ser menus — passam a ser sempre a pessoa logada. "Responsável" continua menu.
- Só `admin` exclui problemas e gerencia setores/pessoas/papéis. Qualquer pessoa logada e vinculada lê tudo, cria (só em nome próprio), edita/comenta qualquer problema, envia/remove anexos.
- RLS usa `public.current_pessoa_id()` e `public.is_admin()` (`security definer`) para evitar recursão. A trava final (remover políticas `anon`, criar as `authenticated`) só roda depois que as 8 contas existem e o login foi testado — **peço confirmação explícita antes desse passo**, mesmo com o design já aprovado.
- Tarefas diárias: tabela nova `public.tarefas`, RLS restrita a `authenticated` desde a criação (pessoa só vê as próprias). Campo único `concluida_em` (date, nullable) serve rotineira (comparada com hoje) e contínua (presença = feita). Interface tipo Notion: Enter cria linha nova, clique marca/desmarca, salva sozinho, sem botão Salvar. Sem sub-tarefas, drag-and-drop ou formatação nesta versão.
- Projeto Supabase: `mfsyrsegkvjmefcdaegh` ("PRODUTIVIDADE"). Nunca alterar `demoras_categorizadas`, `timeline_motor_vaga`, `alert_rules`, `alert_instances` (outro sistema no mesmo projeto).
- Branch `login-tarefas-filtro`, a partir do `master` atualizado. Nenhum `git push` sem confirmação do usuário. Commits terminam com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Nunca pedir, digitar ou logar a chave `service_role` do Supabase nesta sessão — a criação de contas é feita por um script que o usuário roda localmente.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `tabela.js` (novo) | Comparadores de ordenação e filtro de colunas (puro, testável). |
| `tests/tabela.test.js` (novo) | Testes de `tabela.js`. |
| `tarefas.js` (novo) | `todayLocal`, `estaConcluidaHoje`, `ordemEntre` (puro, testável). |
| `tests/tarefas.test.js` (novo) | Testes de `tarefas.js`. |
| `scripts/convidar-contas.js` (novo) | Script local (roda na máquina do usuário) que convida as 8 pessoas via Admin API. Não é executado por mim. |
| `.gitignore` | Ganha `scripts/*.local.json`. |
| `supabase/migrations/20260922*.sql` | Uma migração por fase (schema do login, trava de RLS, tabela de tarefas). |
| `index.html` | Cabeçalho da tabela com filtro/ordenação, tela de login, aba Tarefas. |
| `app.js` | Estado de filtro/ordenação, sessão/identidade, CRUD de tarefas. |

---

## FASE A — Filtro e ordenação estilo Excel

### Task 1: `tabela.js` — comparadores e filtro de colunas, com testes

**Files:**
- Create: `tabela.js`
- Test: `tests/tabela.test.js`

**Interfaces:**
- Produces (`Tabela`): `CRIT_ORDER:string[]`, `STATUS_ORDER:string[]`, `FILTER_COLUMNS:Array<{key,valueField,labelField}>`, `sortRows(rows, col, dir) => rows[]`, `applyColFilters(rows, filters) => rows[]`, `buildFilterOptions(rows, colKey) => Array<{value,label,count}>`.

- [ ] **Step 1: Escrever os testes que falham**

```js
// tests/tabela.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tabela.js');

const row = (o) => ({ titulo: 'x', setor: 'A', criticidade: 'Baixa', status: 'Aberto', responsavel_id: 'r1', responsavelNome: 'Ana', aberto_por_id: 'a1', abertoPorNome: 'Ana', prazo: null, ...o });

test('sortRows por criticidade respeita a severidade, não o alfabeto', () => {
  const rows = [row({ criticidade: 'Alta' }), row({ criticidade: 'Baixa' }), row({ criticidade: 'Média' })];
  assert.deepEqual(T.sortRows(rows, 'criticidade', 'asc').map(r => r.criticidade), ['Baixa', 'Média', 'Alta']);
  assert.deepEqual(T.sortRows(rows, 'criticidade', 'desc').map(r => r.criticidade), ['Alta', 'Média', 'Baixa']);
});

test('sortRows por status respeita o ciclo de vida', () => {
  const rows = [row({ status: 'Resolvido' }), row({ status: 'Aberto' }), row({ status: 'Cancelado' }), row({ status: 'Em andamento' })];
  assert.deepEqual(T.sortRows(rows, 'status', 'asc').map(r => r.status), ['Aberto', 'Em andamento', 'Resolvido', 'Cancelado']);
});

test('sortRows por prazo deixa sem-prazo sempre por último, nas duas direções', () => {
  const rows = [row({ prazo: '2026-01-10' }), row({ prazo: null }), row({ prazo: '2026-01-05' })];
  assert.deepEqual(T.sortRows(rows, 'prazo', 'asc').map(r => r.prazo), ['2026-01-05', '2026-01-10', null]);
  assert.deepEqual(T.sortRows(rows, 'prazo', 'desc').map(r => r.prazo), ['2026-01-10', '2026-01-05', null]);
});

test('sortRows por texto usa acentuação em pt-BR', () => {
  const rows = [row({ setor: 'Óleo' }), row({ setor: 'Almoxarifado' })];
  assert.deepEqual(T.sortRows(rows, 'setor', 'asc').map(r => r.setor), ['Almoxarifado', 'Óleo']);
});

test('applyColFilters combina várias colunas (E lógico)', () => {
  const rows = [row({ setor: 'A', criticidade: 'Alta' }), row({ setor: 'A', criticidade: 'Baixa' }), row({ setor: 'B', criticidade: 'Alta' })];
  const out = T.applyColFilters(rows, { setor: new Set(['A']), criticidade: new Set(['Alta']) });
  assert.equal(out.length, 1);
});

test('applyColFilters com null não filtra a coluna', () => {
  const rows = [row({ setor: 'A' }), row({ setor: 'B' })];
  assert.equal(T.applyColFilters(rows, { setor: null }).length, 2);
});

test('buildFilterOptions conta ocorrências e ordena por rótulo', () => {
  const rows = [row({ setor: 'Zebra' }), row({ setor: 'Alfa' }), row({ setor: 'Zebra' })];
  const opts = T.buildFilterOptions(rows, 'setor');
  assert.deepEqual(opts, [{ value: 'Alfa', label: 'Alfa', count: 1 }, { value: 'Zebra', label: 'Zebra', count: 2 }]);
});

test('buildFilterOptions de responsável usa o nome como rótulo e o id como valor', () => {
  const rows = [row({ responsavel_id: 'r1', responsavelNome: 'Ana' }), row({ responsavel_id: 'r1', responsavelNome: 'Ana' }), row({ responsavel_id: 'r2', responsavelNome: 'Beto' })];
  const opts = T.buildFilterOptions(rows, 'responsavel_id');
  assert.deepEqual(opts, [{ value: 'r1', label: 'Ana', count: 2 }, { value: 'r2', label: 'Beto', count: 1 }]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/tabela.test.js`
Expected: FAIL com `Cannot find module '../tabela.js'`.

- [ ] **Step 3: Implementar `tabela.js`**

```js
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/tabela.test.js`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add tabela.js tests/tabela.test.js
git commit -m "feat: comparadores e filtro de colunas estilo Excel, com testes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Cabeçalho com filtro/ordenação (desktop + celular)

**Files:**
- Modify: `index.html` (CSS + `<thead>` + botão/painel mobile, remoção do `#filters-bar` antigo)
- Modify: `app.js` (`state.colFilters`/`state.sort`, `renderLista`/`getFiltered`, abrir/fechar painéis)

**Interfaces:**
- Consumes: `Tabela.*` (Task 1).
- Produces: `state.colFilters: {setor,criticidade,status,responsavel_id,aberto_por_id}` (cada um `Set|null`), `state.sort: {col,dir}`, `state.openFilterPanel: string|null`, `app.toggleSort(col)`, `app.openFilterPanel(col)`, `app.closeFilterPanel()`, `app.toggleFilterOption(col,value)`, `app.filterSelectAll(col)`, `app.filterClear(col)`, `app.applyFilterPanel()`, `app.cancelFilterPanel()`, `app.openMobileFilters()`, `app.closeMobileFilters()`, `app.setMobileSort(col,dir)`.

- [ ] **Step 1: `index.html` — CSS**

```css
.th-inner{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.th-inner:hover{opacity:.85}
.sort-ind{font-size:10px;opacity:.9}
.filter-icon{border:0;background:rgba(255,255,255,.18);color:#fff;width:22px;height:22px;border-radius:5px;font-size:11px;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}
.filter-icon.active{background:#fff;color:var(--brand)}
.col-filter-panel{position:absolute;top:100%;left:0;margin-top:4px;background:#fff;color:var(--text);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);width:220px;z-index:60;font-weight:400;text-transform:none;letter-spacing:normal}
.col-filter-panel .cf-actions{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px}
.col-filter-panel .cf-actions button{background:none;border:0;color:var(--brand);cursor:pointer;font-size:12px;font-weight:700}
.col-filter-panel .cf-list{max-height:220px;overflow-y:auto;padding:6px 0}
.cf-item{display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:13px;cursor:pointer}
.cf-item:hover{background:var(--bg)}
.cf-item .cf-count{margin-left:auto;color:var(--text-2);font-size:11px}
.cf-buttons{display:flex;gap:8px;padding:10px;border-top:1px solid var(--border)}
.cf-buttons .btn{flex:1}
.th{position:relative}
#btn-filtros-mobile{display:none}
@media (max-width:768px){
  #filters-bar{display:none} /* os 3 selects antigos somem; entram no painel mobile */
  #btn-filtros-mobile{display:block;width:100%;margin:16px 0}
  .mobile-filters-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:80;display:flex;align-items:flex-end}
  .mobile-filters-overlay.hidden{display:none}
  .mobile-filters{background:#fff;border-radius:16px 16px 0 0;max-height:85vh;overflow-y:auto;width:100%;padding:16px}
  .mf-section{border-bottom:1px solid var(--border);padding:12px 0}
  .mf-section-title{font-weight:700;font-size:14px;margin-bottom:8px}
}
```

- [ ] **Step 2: `index.html` — substituir o `<thead>` e remover `#filters-bar` antigo**

O `<thead>` passa a ter, em cada `<th>` filtrável, um `<span class="th-inner">` (rótulo + indicador de ordenação) e um `<button class="filter-icon">` com um ícone de funil simples (▽), com `onclick` chamando `app.toggleSort('<col>')` no span e `app.openFilterPanel('<col>')` (com `event.stopPropagation()`) no botão. O conteúdo de cada `<th>` é gerado por `renderTheadCell(col, label, filtravel)` no `app.js` (Step 3), então o HTML estático fica só com `<thead><tr id="thead-row"></tr></thead>`.

Remover o conteúdo de `#filters-bar` (os 3 `<select>`) e trocar por: `<button id="btn-filtros-mobile" class="btn btn-secondary hidden" onclick="app.openMobileFilters()">Filtros</button>`. Adicionar, antes do `</body>`, o overlay mobile:
```html
<div id="mobile-filters-overlay" class="mobile-filters-overlay hidden" onclick="app.closeMobileFilters()">
  <div class="mobile-filters" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong>Filtros e ordenação</strong>
      <button class="icon-btn" onclick="app.closeMobileFilters()" aria-label="Fechar">×</button>
    </div>
    <div id="mobile-filters-body"></div>
    <div class="inline-form" style="margin-top:12px;">
      <button class="btn btn-secondary" onclick="app.clearAllFilters()">Limpar filtros</button>
      <button class="btn btn-primary" onclick="app.closeMobileFilters()">Aplicar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: `app.js` — estado, comparadores em uso e render do cabeçalho**

```js
state.colFilters = { setor: null, criticidade: null, status: null, responsavel_id: null, aberto_por_id: null };
state.sort = { col: 'prazo', dir: 'asc' };
state.openFilterPanel = null;   // coluna com painel aberto
state.filterDraft = null;       // Set em edição, até clicar OK

const COLS = [
  { key: 'titulo', label: 'Título', filtravel: false },
  { key: 'setor', label: 'Setor', filtravel: true },
  { key: 'criticidade', label: 'Criticidade', filtravel: true },
  { key: 'responsavel_id', label: 'Responsável', filtravel: true, sortCol: 'responsavelNome' },
  { key: 'status', label: 'Status', filtravel: true },
  { key: 'prazo', label: 'Prazo', filtravel: false },
  { key: 'aberto_por_id', label: 'Aberto por', filtravel: true, sortCol: 'abertoPorNome' },
];
```

`getFiltered()` passa a aplicar, depois da busca por texto: `rows = Tabela.applyColFilters(rows, state.colFilters); rows = Tabela.sortRows(rows.map(getEnriched), state.sort.col === 'responsavel_id' ? 'responsavelNome' : state.sort.col === 'aberto_por_id' ? 'abertoPorNome' : state.sort.col, state.sort.dir);` (a ordenação usa o campo de nome quando a coluna é responsável/aberto-por; o filtro usa o id).

`app.toggleSort(col)`: se `state.sort.col === col`, inverte `dir`; senão define `{col, dir:'asc'}` e renderiza.
`app.openFilterPanel(col)`: `state.openFilterPanel = col; state.filterDraft = new Set(state.colFilters[col] || Tabela.buildFilterOptions(getFiltered({ ignoreCol: col }), col).map(o => o.value));` — o painel abre com tudo marcado se não havia filtro. Chama `renderLista()`.
`app.toggleFilterOption(col, value)`: adiciona/remove `value` de `state.filterDraft`.
`app.filterSelectAll(col)` / `app.filterClear(col)`: enchem/esvaziam `state.filterDraft` com base nas opções visíveis.
`app.applyFilterPanel()`: `const total = Tabela.buildFilterOptions(...).length; state.colFilters[state.openFilterPanel] = state.filterDraft.size === total ? null : new Set(state.filterDraft);` (marcar tudo equivale a "sem filtro"); fecha o painel; renderiza.
`app.cancelFilterPanel()` / `app.closeFilterPanel()`: só fecham, descartando `filterDraft`.
`app.clearAllFilters()`: zera todas as chaves de `state.colFilters` para `null`.

`renderLista()` monta o `<thead>` via `renderThead()` (novo) antes de montar `tbody`, e monta o painel (se `state.openFilterPanel`) dentro do `<th>` correspondente, usando `Tabela.buildFilterOptions` sobre as linhas filtradas pelas OUTRAS colunas (não pela própria, para o painel mostrar todos os valores possíveis daquela coluna). No celular, `renderMobileFilters()` desenha o mesmo conteúdo em `#mobile-filters-body`, em blocos por coluna, mais um seletor de ordenação. Fechar com Esc ou clique fora: `document.addEventListener('click', ...)` fechando `state.openFilterPanel` se o clique for fora de `.col-filter-panel`/`.filter-icon`; `document.addEventListener('keydown', e => { if (e.key === 'Escape') app.closeFilterPanel(); })`.

- [ ] **Step 4: Verificar**

`node --check app.js`; subir o servidor estático do scratchpad e, via Playwright (sem gravar no banco): marcar/desmarcar valores num filtro e confirmar que a lista muda; clicar em "Criticidade" duas vezes e confirmar ordem Baixa→Média→Alta depois Alta→Média→Baixa; conferir em 390px que `#filters-bar` sumiu e `#btn-filtros-mobile` aparece, abre o painel, filtra e fecha. Capturar telas em 1280 e 390.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat: filtro e ordenacao estilo Excel no cabecalho da tabela

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## FASE B — Login

### Task 3: Schema aditivo (pessoas + funções de RLS)

**Files:**
- Create: `supabase/migrations/20260922120000_login_schema.sql`

**Interfaces:**
- Produces: `pessoas.auth_user_id uuid unique`, `pessoas.role text` (`membro`|`admin`), `public.current_pessoa_id()`, `public.is_admin()`.

- [ ] **Step 1: Criar a migração** com exatamente:

```sql
alter table public.pessoas
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column role text not null default 'membro' check (role in ('membro','admin'));

create or replace function public.current_pessoa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.pessoas where auth_user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pessoas where auth_user_id = auth.uid() and role = 'admin');
$$;

revoke all on function public.current_pessoa_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_pessoa_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
```

- [ ] **Step 2: Aplicar** via `mcp__claude_ai_Supabase__apply_migration` (`name: login_schema`, projeto `mfsyrsegkvjmefcdaegh`). Não muda nenhuma política — o app continua funcionando como hoje (`anon` ainda liberado).

- [ ] **Step 3: Verificar**

```sql
select column_name, data_type, column_default from information_schema.columns
 where table_schema='public' and table_name='pessoas' and column_name in ('auth_user_id','role');
select proname, prosecdef from pg_proc where proname in ('current_pessoa_id','is_admin');
select count(*) as total, count(*) filter (where role='membro') as membros from public.pessoas;
```
Expected: as 2 colunas existem; `prosecdef = true` nas 2 funções; 8 pessoas, todas `membro` (ninguém é admin ainda).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922120000_login_schema.sql
git commit -m "feat(db): schema de login (auth_user_id, role, funcoes de RLS)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Script local para convidar as 8 contas

**Files:**
- Create: `scripts/convidar-contas.js`
- Modify: `.gitignore` (adicionar `scripts/*.local.json`)

**Interfaces:**
- Produces: script Node standalone, não executado por mim; lê `SUPABASE_SERVICE_ROLE_KEY` do ambiente e `scripts/pessoas-emails.local.json` (arquivo local, fora do Git).

- [ ] **Step 1: `.gitignore`** — adicionar a linha `scripts/*.local.json`.

- [ ] **Step 2: Criar `scripts/convidar-contas.js`**

```js
// Roda na SUA máquina, nunca aqui comigo. Precisa da chave secreta (service_role),
// que fica só na sua variável de ambiente — eu nunca vejo esse valor.
//
// Uso:
//   1) Copie scripts/pessoas-emails.example.json para scripts/pessoas-emails.local.json
//      e preencha nome+e-mail de cada pessoa.
//   2) No PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY = "sua-chave-aqui"
//   3) node scripts/convidar-contas.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mfsyrsegkvjmefcdaegh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('Defina SUPABASE_SERVICE_ROLE_KEY antes de rodar.'); process.exit(1); }

const file = path.join(__dirname, 'pessoas-emails.local.json');
if (!fs.existsSync(file)) { console.error('Crie ' + file + ' (veja pessoas-emails.example.json).'); process.exit(1); }
const pessoas = JSON.parse(fs.readFileSync(file, 'utf8'));

const sb = createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  for (const { nome, email } of pessoas) {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { data: { nome } });
    if (error) console.log(`FALHOU  ${nome} <${email}>: ${error.message}`);
    else console.log(`OK      ${nome} <${email}>  id=${data.user.id}`);
  }
  console.log('\nPronto. Cada pessoa recebe um e-mail do Supabase para criar a própria senha.');
})();
```

- [ ] **Step 3: Criar `scripts/pessoas-emails.example.json`** (este SIM vai para o Git, sem dados reais)

```json
[
  { "nome": "Warlison Abreu", "email": "warlison.abreu@gestaogps.com.br" }
]
```

- [ ] **Step 4: Commit** (só o script e o exemplo — nunca o `.local.json` com e-mails reais nem a chave)

```bash
git add scripts/convidar-contas.js scripts/pessoas-emails.example.json .gitignore
git commit -m "feat: script local para convidar contas de login (nao usa chave secreta minha)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Pedir ao usuário** para preencher `scripts/pessoas-emails.local.json` com os 8 nomes+e-mails e rodar o script (ou convidar manualmente pelo painel do Supabase). Esta etapa é bloqueante para a Task 5 — sigo para a Fase C (tarefas) ou para revisão enquanto aguardo, se for o caso.

---

### Task 5: Ligar as contas às pessoas (após o usuário confirmar os convites)

**Files:** nenhum arquivo novo (SQL direto via `execute_sql`)

- [ ] **Step 1: Conferir que as 8 contas existem**

```sql
select email, id, created_at from auth.users order by created_at;
```
Expected: 8 linhas, uma por e-mail informado.

- [ ] **Step 2: Ligar cada `pessoas.auth_user_id` pelo e-mail** (um `update` por pessoa, usando os e-mails que o usuário passou), por exemplo:

```sql
update public.pessoas set auth_user_id = (select id from auth.users where email = 'warlison.abreu@gestaogps.com.br') where nome = 'Warlison Abreu';
-- repetir para as outras 7 pessoas com os e-mails recebidos
update public.pessoas set role = 'admin' where nome = 'Warlison Abreu';
```

- [ ] **Step 3: Verificar**

```sql
select nome, role, auth_user_id is not null as tem_login from public.pessoas order by nome;
```
Expected: 8 linhas, todas com `tem_login = true`; só Warlison Abreu com `role = 'admin'`.

- [ ] **Step 4:** Sem commit de código (mudança de dados, não de schema).

---

### Task 6: Tela de login e identidade automática

**Files:**
- Modify: `index.html` (tela de login, cabeçalho com nome+Sair, remover menus "Aberto por"/"quem está comentando", ocultar controles admin-only)
- Modify: `app.js` (sessão, `state.me`, `isAdmin()`, boot, `app.login`, `app.logout`, `app.forgotPassword`)

**Interfaces:**
- Produces: `state.session`, `state.me: {id,nome,setor,role}|null`, `isAdmin() => boolean`, `app.login(email,senha)`, `app.logout()`, `app.forgotPassword(email)`.

- [ ] **Step 1: `index.html`** — envolver todo o conteúdo atual de `<div id="app">` (já existe) e acrescentar, como primeiro filho do `<body>`, a tela de login:

```html
<div id="login-screen" class="hidden">
  <div class="login-card fade-in">
    <div class="brand" style="margin-bottom:18px;"><span class="brand-1" style="color:var(--brand);">GRUPO</span><span class="brand-2" style="color:var(--brand);">GPS</span></div>
    <div style="font-weight:700;font-size:13px;letter-spacing:.08em;color:var(--text-2);margin-bottom:18px;">MAPEAMENTO DE ATIVIDADES</div>
    <label class="lbl" for="login-email">E-mail</label>
    <input id="login-email" type="email" class="input" autocomplete="username" style="margin-bottom:12px;">
    <label class="lbl" for="login-senha">Senha</label>
    <input id="login-senha" type="password" class="input" autocomplete="current-password" style="margin-bottom:6px;">
    <div id="login-erro" class="hidden" style="color:var(--danger);font-size:13px;margin-bottom:10px;"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:6px;" onclick="app.login()">Entrar</button>
    <button class="btn btn-secondary" style="width:100%;margin-top:8px;" onclick="app.forgotPassword()">Esqueci minha senha</button>
  </div>
</div>
```
CSS: `#login-screen{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:500;padding:24px}` `.login-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:32px;width:min(360px,100%);box-shadow:0 12px 40px rgba(0,0,0,.12)}`.

No cabeçalho, reintroduzir (após a busca) um bloco somente-leitura: `<div id="header-user" class="header-user"><span id="header-user-nome"></span><button class="btn btn-light btn-sm" onclick="app.logout()">Sair</button></div>`.

Remover do modal: o bloco `#field-aberto-por` inteiro e o `<select id="comentario-autor">` (mantendo o `<div id="info-aberto-por">` que já existe para mostrar quem abriu, agora também usado no modo "novo" — ver Step 3). No formulário de comentário, tirar o `<select>`, deixando só o input+botão.

Adicionar `class="admin-only hidden"` nos elementos: botão "Adicionar" de setor, botão "×" de cada chip de setor, botão "Adicionar" de pessoa, botão "×" de cada pessoa, `<select>` de setor de cada pessoa (trocar por texto quando não-admin — ver Step 3), `#btn-delete`.

- [ ] **Step 2: `app.js` — sessão e boot**

```js
state.session = null;
state.me = null; // { id, nome, setor, role }
function isAdmin() { return !!(state.me && state.me.role === 'admin'); }

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
    document.getElementById('login-erro').textContent = 'Sua conta ainda não foi vinculada a uma pessoa. Fale com o administrador.';
    document.getElementById('login-erro').classList.remove('hidden');
    await sb.auth.signOut();
    state.session = null;
  }
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
  if (!session) { state.me = null; renderAuthGate(); }
});
```
`app.login`, `app.logout`, `app.forgotPassword`:
```js
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const erroEl = document.getElementById('login-erro');
    erroEl.classList.add('hidden');
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) { erroEl.textContent = 'E-mail ou senha inválidos.'; erroEl.classList.remove('hidden'); return; }
    await boot();
  },
  async logout() {
    await sb.auth.signOut();
    state.me = null;
    renderAuthGate();
  },
  async forgotPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { showToast('Digite seu e-mail no campo acima primeiro.'); return; }
    await sb.auth.resetPasswordForEmail(email);
    showToast('Se esse e-mail tiver conta, chegou um link para redefinir a senha.');
  },
```
Trocar a última linha do arquivo (`loadAll();`) por `boot();`.

- [ ] **Step 3: `app.js` — identidade automática (remove os menus) e admin-only**

Em `openNew()`: `aberto_por_id: state.me.id` direto no draft (sem ler nenhum `<select>`). Em `renderModal()`: sempre mostrar `#info-aberto-por` preenchido — no modo novo, com `state.me.nome` e a data de hoje; remover toda referência a `#field-aberto-por`/`#draft-aberto-por` e a `renderComentarioAutor()`.

`app.addComment()`: usa `state.me` diretamente no lugar do `<select>` removido (sem checar autor vazio, já que só se chega aqui logado).

`app.removeSetor`, `app.removePessoa`, `app.addSetor`, `app.addPessoa`, `app.confirmDelete`: no início de cada um, `if (!isAdmin()) return;` (defesa extra; a UI já esconde os botões e o RLS é a trava real).

- [ ] **Step 4: Verificar (sem login real — ver Task 8 para a verificação de RLS)**

`node --check app.js`. Teste com um cliente Supabase simulado (stub de `signInWithPassword`/`getSession`) confirmando que: sem sessão, `#login-screen` aparece e `#app` fica oculto; erro de credencial mostra a mensagem; após um "login" simulado com sucesso e uma pessoa falsa em `resolveMe`, `#app` aparece e o nome certo é exibido no cabeçalho.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat: tela de login e identidade automatica (remove menus de autor)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Trava final de RLS

**Files:**
- Create: `supabase/migrations/20260922130000_login_rls.sql`

**Interfaces:**
- Produces: políticas de `pessoas`, `setores`, `problemas`, `storage.objects` restritas a `authenticated` + `current_pessoa_id()`/`is_admin()`.

- [ ] **Step 1: Confirmar com o usuário** que todas as 8 contas foram criadas, ligadas (Task 5) e que pelo menos um teste real de login foi feito — **só aplicar depois desse sim explícito**, mesmo com o design já aprovado (é o passo sem volta fácil).

- [ ] **Step 2: Criar a migração** com o SQL exato da seção "SQL exato da trava final" do design (`docs/superpowers/specs/2026-09-22-login-tarefas-filtro-design.md`): `drop policy` das 3 antigas (`pessoas`, `setores`, `problemas`) + 3 de `storage.objects`, seguido das novas `create policy` (select linked / admin insert-update-delete em pessoas e setores; select/insert/update linked + delete admin em problemas; select/insert/delete linked em storage.objects).

- [ ] **Step 3: Verificar ANTES de aplicar, simulando os dois papéis por SQL** (sem precisar de senha real):

```sql
-- simula ser o Warlison (admin) dentro de uma transação, sem persistir nada
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id::text from public.pessoas where nome='Warlison Abreu'))::text, true);
set local role authenticated;
select is_admin(), current_pessoa_id(); -- espera: true, o id do Warlison
rollback;
```
Expected: `is_admin() = true` para o admin.

- [ ] **Step 4: Aplicar** via `apply_migration` (`name: login_rls`).

- [ ] **Step 5: Verificar DEPOIS de aplicar**, simulando um membro comum (não-admin) na mesma técnica:

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id::text from public.pessoas where role='membro' limit 1))::text, true);
set local role authenticated;
select count(*) from public.problemas; -- espera: funciona (select liberado)
select is_admin(); -- espera: false
savepoint antes_delete;
delete from public.problemas where false; -- 0 linhas, só para confirmar que a policy aceita a operação em si; testar de verdade:
rollback to antes_delete;
rollback;
```
E confirmar que, **sem** `set_config`/`set local role` (ou seja, como `anon`/sem sessão), uma nova consulta `select * from public.problemas` roda numa sessão separada e devolve **0 linhas ou erro de permissão** (RLS bloqueando).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260922130000_login_rls.sql
git commit -m "feat(db): trava RLS final do login (remove acesso anonimo)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## FASE C — Tarefas diárias

### Task 8: `tarefas.js` — regras puras, com testes

**Files:**
- Create: `tarefas.js`
- Test: `tests/tarefas.test.js`

**Interfaces:**
- Produces: `todayLocal() => 'YYYY-MM-DD'`, `estaConcluidaHoje(tarefa, hoje) => boolean`, `ordemEntre(anterior, seguinte) => number`.

- [ ] **Step 1: Testes**

```js
// tests/tarefas.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Tf = require('../tarefas.js');

test('estaConcluidaHoje: rotineira só conta se concluida_em for hoje', () => {
  assert.equal(Tf.estaConcluidaHoje({ rotineira: true, concluida_em: '2026-09-22' }, '2026-09-22'), true);
  assert.equal(Tf.estaConcluidaHoje({ rotineira: true, concluida_em: '2026-09-21' }, '2026-09-22'), false);
  assert.equal(Tf.estaConcluidaHoje({ rotineira: true, concluida_em: null }, '2026-09-22'), false);
});

test('estaConcluidaHoje: contínua conta enquanto concluida_em existir, qualquer data', () => {
  assert.equal(Tf.estaConcluidaHoje({ rotineira: false, concluida_em: '2020-01-01' }, '2026-09-22'), true);
  assert.equal(Tf.estaConcluidaHoje({ rotineira: false, concluida_em: null }, '2026-09-22'), false);
});

test('ordemEntre no meio de duas tarefas', () => {
  assert.equal(Tf.ordemEntre(1, 3), 2);
});

test('ordemEntre no início (sem anterior) e no fim (sem seguinte)', () => {
  assert.ok(Tf.ordemEntre(null, 10) < 10);
  assert.ok(Tf.ordemEntre(10, null) > 10);
});

test('ordemEntre em lista vazia devolve um número', () => {
  assert.equal(typeof Tf.ordemEntre(null, null), 'number');
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/tarefas.test.js` — FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

```js
// ============================================================
// MAPEAMENTO DE ATIVIDADES — tarefas.js
// Regras puras de tarefas diárias (sem DOM, sem Supabase).
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
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/tarefas.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add tarefas.js tests/tarefas.test.js
git commit -m "feat: regras puras de tarefas diarias (reset por data, ordem fracionaria), com testes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Tabela `tarefas` no banco

**Files:**
- Create: `supabase/migrations/20260922140000_tarefas.sql`

- [ ] **Step 1: Migração** com exatamente o SQL da seção "Banco" de tarefas no design (tabela `public.tarefas`, índice, `enable row level security`, as 4 políticas `select/insert/update/delete own` usando `current_pessoa_id()`).

- [ ] **Step 2: Aplicar** via `apply_migration` (`name: tarefas`).

- [ ] **Step 3: Verificar**

```sql
select count(*) from public.tarefas; -- 0
select policyname, cmd from pg_policies where schemaname='public' and tablename='tarefas';
```
Expected: 0 linhas; 4 políticas (select, insert, update, delete).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922140000_tarefas.sql
git commit -m "feat(db): tabela de tarefas diarias, RLS por pessoa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Aba Tarefas (interface estilo Notion)

**Files:**
- Modify: `index.html` (aba nova, CSS da lista editável)
- Modify: `app.js` (CRUD, handlers de teclado, render)

**Interfaces:**
- Consumes: `Tarefas.*` (Task 8).
- Produces: `state.tarefas: []`, `app.tarefaKeydown(e, id)`, `app.toggleTarefa(id)`, `app.toggleRotineira(id)`, `app.removeTarefa(id)`, `app.novaTarefa(rotineira)`, `app.salvarTextoTarefa(id, texto)` (debounced).

- [ ] **Step 1: `index.html`** — 4º botão na `.tabs`: `<button id="tab-tarefas" class="tab" onclick="app.setTab('tarefas')">Tarefas</button>`; nova view:

```html
<div id="view-tarefas" class="hidden">
  <div class="card card-pad">
    <div class="card-title">Rotineiras <span class="muted" style="font-weight:400;">— desmarcam sozinhas todo dia</span></div>
    <div id="tarefas-rotineiras" class="tarefas-list"></div>
  </div>
  <div class="card card-pad mt-20">
    <div class="card-title">Outras tarefas</div>
    <div id="tarefas-continuas" class="tarefas-list"></div>
  </div>
</div>
```
CSS: `.tarefa-item{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--bg)}` `.tarefa-item input[type=checkbox]{width:18px;height:18px;flex-shrink:0}` `.tarefa-item input[type=text]{flex:1;border:0;background:none;font-size:14px;padding:6px 4px}` `.tarefa-item input[type=text]:focus{outline:none;background:var(--bg);border-radius:6px}` `.tarefa-item.feita input[type=text]{text-decoration:line-through;color:var(--text-2)}` `.tarefa-actions{display:flex;gap:4px;opacity:0;flex-shrink:0}` `.tarefa-item:hover .tarefa-actions{opacity:1}` `.tarefa-actions button{border:0;background:none;cursor:pointer;color:var(--text-2);font-size:13px;padding:4px}` `.tarefa-actions button.on{color:var(--brand)}`.

- [ ] **Step 2: `app.js`** — carregar/gravar:

```js
async function loadTarefas() {
  const { data } = await sb.from('tarefas').select('*').eq('pessoa_id', state.me.id).order('ordem');
  state.tarefas = data || [];
  renderTarefas();
}

const app_tarefas = {
  novaTarefa(rotineira) {
    const lista = state.tarefas.filter(t => t.rotineira === rotineira).sort((a, b) => a.ordem - b.ordem);
    const ordem = Tarefas.ordemEntre(lista.length ? lista[lista.length - 1].ordem : null, null);
    const item = { id: crypto.randomUUID(), pessoa_id: state.me.id, texto: '', rotineira, concluida_em: null, ordem, _novo: true };
    state.tarefas.push(item);
    renderTarefas();
    setTimeout(() => document.getElementById('tarefa-' + item.id)?.focus(), 0);
  },
  async salvarTextoTarefa(id, texto) {
    const t = state.tarefas.find(x => x.id === id);
    if (!t) return;
    t.texto = texto;
    if (!texto.trim()) { if (t._novo) { state.tarefas = state.tarefas.filter(x => x.id !== id); renderTarefas(); } return; }
    const wasNovo = t._novo; delete t._novo;
    await sb.from('tarefas').upsert({ id: t.id, pessoa_id: t.pessoa_id, texto: t.texto, rotineira: t.rotineira, concluida_em: t.concluida_em, ordem: t.ordem });
    if (wasNovo) renderTarefas();
  },
  async toggleTarefa(id) {
    const t = state.tarefas.find(x => x.id === id);
    if (!t) return;
    const feita = Tarefas.estaConcluidaHoje(t);
    t.concluida_em = feita ? null : Tarefas.todayLocal();
    await sb.from('tarefas').update({ concluida_em: t.concluida_em }).eq('id', id);
    renderTarefas();
  },
  async toggleRotineira(id) {
    const t = state.tarefas.find(x => x.id === id);
    if (!t) return;
    t.rotineira = !t.rotineira;
    await sb.from('tarefas').update({ rotineira: t.rotineira }).eq('id', id);
    renderTarefas();
  },
  async removeTarefa(id) {
    state.tarefas = state.tarefas.filter(x => x.id !== id);
    renderTarefas();
    await sb.from('tarefas').delete().eq('id', id);
  },
  tarefaKeydown(e, id) {
    if (e.key === 'Enter') { e.preventDefault(); const t = state.tarefas.find(x => x.id === id); app.novaTarefa(t ? t.rotineira : false); }
    if (e.key === 'Backspace' && e.target.value === '') { e.preventDefault(); app.removeTarefa(id); }
  },
};
Object.assign(app, app_tarefas);
```

`renderTarefas()`:
```js
function renderTarefaLista(containerId, rotineira) {
  const itens = state.tarefas.filter(t => t.rotineira === rotineira).sort((a, b) => a.ordem - b.ordem);
  document.getElementById(containerId).innerHTML = itens.map(t => {
    const feita = Tarefas.estaConcluidaHoje(t);
    return `<div class="tarefa-item${feita ? ' feita' : ''}">
      <input type="checkbox" ${feita ? 'checked' : ''} onchange="app.toggleTarefa('${t.id}')">
      <input id="tarefa-${t.id}" type="text" value="${esc(t.texto)}" placeholder="Nova tarefa..."
        onkeydown="app.tarefaKeydown(event,'${t.id}')" onblur="app.salvarTextoTarefa('${t.id}', this.value)">
      <div class="tarefa-actions">
        <button class="${t.rotineira ? 'on' : ''}" title="Rotineira" onclick="app.toggleRotineira('${t.id}')">↻</button>
        <button title="Excluir" onclick="app.removeTarefa('${t.id}')">×</button>
      </div>
    </div>`;
  }).join('') + `<button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="app.novaTarefa(${rotineira})">+ Nova tarefa</button>`;
}
function renderTarefas() {
  renderTarefaLista('tarefas-rotineiras', true);
  renderTarefaLista('tarefas-continuas', false);
}
```
Em `renderTabs()`, incluir `'tarefas'` na lista de abas; em `render()`/`setTab`, chamar `loadTarefas()` na primeira vez que a aba `tarefas` é aberta (lazy-load) e `renderTarefas()` nas seguintes.

- [ ] **Step 3: Verificar**

`node --check app.js`; `node --test` (todos os módulos). RLS: repetir a técnica de simulação de papel da Task 7 — criar uma tarefa como o "membro A" simulado, confirmar que o "membro B" simulado não a vê (`select` devolve 0 linhas) nem consegue apagá-la. Revisão de código do fluxo Enter/Backspace/blur. Pedir ao usuário (Warlison, já com conta real) um teste manual final: criar 2-3 tarefas, marcar uma rotineira, conferir que ela volta desmarcada no dia seguinte.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "feat: aba de tarefas diarias com itens rotineiros e continuos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: README e entrega

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Acrescentar à lista de funcionalidades: login com papéis (membro/admin), filtro/ordenação estilo Excel na Lista, aba de Tarefas diárias. Atualizar "Estrutura do banco" com `pessoas.auth_user_id`/`role` e a tabela `tarefas`. Mencionar `scripts/convidar-contas.js` na seção de configuração inicial (como convidar novas pessoas).
- [ ] **Step 2: Commit** `docs: atualiza README (login, tarefas, filtro Excel)`.
- [ ] **Step 3: Resumo final ao usuário** — o que foi feito, o que foi verificado (RLS por simulação de papel, testes unitários, capturas de tela) e o que só uma pessoa real pode testar (o clique real de login, o teste de virada de dia das tarefas rotineiras). Perguntar sobre `git push` e sobre abrir PR para `master`, sem fazer nenhum dos dois sem confirmação.
