# MAPEAMENTO DE ATIVIDADES Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renomear o sistema, remover "Você é ...", deixar a interface fluida no celular com paleta sóbria e permitir anexar imagens e documentos aos problemas.

**Architecture:** App estático (HTML + JS puro + Supabase JS). Estilos inline migram para classes CSS com variáveis de cor e media query em 768px. A lógica pura dos anexos (validação, nomes, redimensionamento) fica em `anexos.js` (testável em Node); envio/remoção de arquivos e UI ficam em `app.js`. Arquivos vão para um bucket privado do Supabase Storage e os metadados numa coluna JSONB `anexos` em `problemas`.

**Tech Stack:** HTML/CSS/JS vanilla, `@supabase/supabase-js@2` (CDN), Supabase Storage, `node --test` (Node 22) para testes unitários, Edge headless + `playwright-core` para verificação visual/E2E.

**Spec:** `docs/superpowers/specs/2026-09-21-mapeamento-de-atividades-design.md`

## Global Constraints

- Nome do sistema: **MAPEAMENTO DE ATIVIDADES** (título da aba, meta description, barra abaixo do cabeçalho, comentário de topo do `app.js`, README). A marca "GRUPO GPS Mecanizada" permanece no cabeçalho. Rótulos como "Novo problema", "Lista", "Dashboard" não mudam.
- `Central de Problemas.dc.html` e `support.js` não são alterados.
- Paleta: marca `#1F3A5F` sólido (sem gradiente); fundo `#F3F5F7`; cartões `#FFFFFF` com borda `#D9DEE4`, raio 8px; texto `#1B2430`, secundário `#5B6675`; destrutivo `#B42318`. Contraste de texto AA (≥ 4.5:1) em todas as etiquetas. Sem emoji na interface. Fonte Manrope mantida.
- Mobile: ponto de corte `max-width: 768px`; alvos de toque ≥ 44px; `font-size: 16px` em inputs/selects no mobile; modal em tela cheia (`100dvh`) com rodapé de ações fixo; botão "+ Novo problema" flutuante no canto inferior direito.
- Anexos: 10 MB por arquivo, no máximo 10 por problema; tipos: JPG, PNG, WebP, PDF, Word (doc/docx), Excel (xls/xlsx), PowerPoint (ppt/pptx), TXT. Bucket `anexos-problemas`, privado, caminho `<problema_id>/<uuid>-<nome sanitizado>`. Nada é enviado antes de "Salvar". URL assinada de 1 hora para abrir/miniaturas. Imagens reduzidas no aparelho (lado maior 1600px, JPEG qualidade 0.8).
- Autor de comentário: seletor "Quem está comentando" no formulário de comentário; última escolha lembrada em `localStorage` na chave `probsys_user`.
- Migração no Supabase é aplicada **antes** de publicar o código. Projeto: `mfsyrsegkvjmefcdaegh` ("PRODUTIVIDADE").
- Nenhum `git push` sem confirmação explícita do usuário. Trabalho na branch `mapeamento-de-atividades`. A pasta `.thumbnail` nunca é versionada.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `anexos.js` (novo) | Funções puras dos anexos: tipos permitidos, validação, nome/caminho, formatação, cálculo de redimensionamento. Módulo UMD (`window.Anexos` no navegador, `module.exports` no Node). |
| `tests/anexos.test.js` (novo) | Testes `node --test` de `anexos.js`. |
| `supabase/migrations/20260921120000_anexos_problemas.sql` (novo) | Registro da migração aplicada. |
| `index.html` | Estrutura, CSS (tokens + componentes + mobile), modal com seção de anexos. |
| `app.js` | Estado, render por classes, autor de comentário, fluxo de anexos (upload/remoção/URL assinada). |
| `README.md` | Nome novo, anexos, como testar. |

---

### Task 1: Funções puras dos anexos (`anexos.js`) com testes

**Files:**
- Create: `anexos.js`
- Test: `tests/anexos.test.js`

**Interfaces:**
- Produces (todas em `Anexos`): `MAX_BYTES:number`, `MAX_FILES:number`, `ACCEPT:string`, `resolveType(file:{name,type}) => string|null`, `validateFiles(files:Array<{name,size,type}>, existingCount:number) => {accepted:Array, rejected:Array<{name,reason}>}`, `sanitizeFileName(name) => string`, `buildStoragePath(problemId, uuid, name) => string`, `formatBytes(n) => string`, `typeLabel(mime) => string`, `isImage(mime) => boolean`, `computeResizeTarget(width, height, bytes) => {width,height,needsResize}`.

- [ ] **Step 1: Escrever os testes que falham**

```js
// tests/anexos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../anexos.js');

const f = (name, size, type) => ({ name, size, type });

test('formatBytes usa vírgula decimal e unidades', () => {
  assert.equal(A.formatBytes(500), '500 B');
  assert.equal(A.formatBytes(1536), '1,5 KB');
  assert.equal(A.formatBytes(5 * 1024 * 1024), '5,0 MB');
});

test('sanitizeFileName remove acentos, espaços e símbolos', () => {
  assert.equal(A.sanitizeFileName('Relatório Final (v2).pdf'), 'Relatorio_Final_v2.pdf');
  assert.equal(A.sanitizeFileName('FOTO.JPG'), 'FOTO.jpg');
  assert.equal(A.sanitizeFileName(''), 'arquivo');
});

test('sanitizeFileName nunca deixa barras nem ".." e limita o tamanho', () => {
  const evil = A.sanitizeFileName('../../etc/passwd');
  assert.ok(!evil.includes('/') && !evil.includes('..'), evil);
  const long = A.sanitizeFileName('a'.repeat(200) + '.pdf');
  assert.equal(long.length, 84);
  assert.ok(long.endsWith('.pdf'));
});

test('buildStoragePath junta problema, uuid e nome sanitizado', () => {
  assert.equal(A.buildStoragePath('p1', 'u1', 'Foto Ç.png'), 'p1/u1-Foto_C.png');
});

test('resolveType usa o mime e cai para a extensão quando o mime vem vazio', () => {
  assert.equal(A.resolveType(f('a.pdf', 1, 'application/pdf')), 'application/pdf');
  assert.equal(A.resolveType(f('a.docx', 1, '')), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(A.resolveType(f('virus.exe', 1, '')), null);
  assert.equal(A.resolveType(f('virus.exe', 1, 'application/x-msdownload')), null);
});

test('validateFiles aceita tipos permitidos dentro do limite', () => {
  const r = A.validateFiles([f('a.jpg', 1024, 'image/jpeg'), f('b.xlsx', 2048, '')], 0);
  assert.equal(r.accepted.length, 2);
  assert.equal(r.rejected.length, 0);
});

test('validateFiles recusa tipo inválido e arquivo acima de 10 MB com motivo', () => {
  const r = A.validateFiles([f('x.exe', 10, ''), f('grande.pdf', A.MAX_BYTES + 1, 'application/pdf')], 0);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.rejected.length, 2);
  assert.match(r.rejected[0].reason, /tipo/i);
  assert.match(r.rejected[1].reason, /10 MB/);
});

test('validateFiles respeita o máximo de 10 anexos por problema', () => {
  const files = Array.from({ length: 4 }, (_, i) => f(`a${i}.png`, 10, 'image/png'));
  const r = A.validateFiles(files, 8);
  assert.equal(r.accepted.length, 2);
  assert.equal(r.rejected.length, 2);
  assert.match(r.rejected[0].reason, /10 anexos/);
});

test('computeResizeTarget só reduz quando passa de 1600px ou 1,5 MB', () => {
  assert.deepEqual(A.computeResizeTarget(800, 600, 200 * 1024), { width: 800, height: 600, needsResize: false });
  assert.deepEqual(A.computeResizeTarget(4000, 3000, 3 * 1024 * 1024), { width: 1600, height: 1200, needsResize: true });
  assert.deepEqual(A.computeResizeTarget(1200, 900, 3 * 1024 * 1024), { width: 1200, height: 900, needsResize: true });
});

test('typeLabel e isImage', () => {
  assert.equal(A.typeLabel('application/pdf'), 'PDF');
  assert.equal(A.typeLabel('image/jpeg'), 'JPG');
  assert.equal(A.isImage('image/png'), true);
  assert.equal(A.isImage('application/pdf'), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/`
Expected: FAIL com `Cannot find module '../anexos.js'`.

- [ ] **Step 3: Implementar `anexos.js`**

```js
// ============================================================
// MAPEAMENTO DE ATIVIDADES — anexos.js
// Funções puras dos anexos (sem DOM, sem Supabase).
// Navegador: window.Anexos | Node: module.exports
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Anexos = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_FILES = 10;
  const RESIZE_MAX_SIDE = 1600;
  const RESIZE_MAX_BYTES = 1.5 * 1024 * 1024;

  const TYPES = {
    'image/jpeg': { label: 'JPG', ext: ['jpg', 'jpeg'] },
    'image/png': { label: 'PNG', ext: ['png'] },
    'image/webp': { label: 'WebP', ext: ['webp'] },
    'application/pdf': { label: 'PDF', ext: ['pdf'] },
    'application/msword': { label: 'DOC', ext: ['doc'] },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', ext: ['docx'] },
    'application/vnd.ms-excel': { label: 'XLS', ext: ['xls'] },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'XLSX', ext: ['xlsx'] },
    'application/vnd.ms-powerpoint': { label: 'PPT', ext: ['ppt'] },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { label: 'PPTX', ext: ['pptx'] },
    'text/plain': { label: 'TXT', ext: ['txt'] },
  };

  const EXT_TO_TYPE = {};
  Object.keys(TYPES).forEach(mime => TYPES[mime].ext.forEach(e => { EXT_TO_TYPE[e] = mime; }));

  const ACCEPT = Object.keys(TYPES).concat(Object.keys(EXT_TO_TYPE).map(e => '.' + e)).join(',');

  function extOf(name) {
    const n = String(name || '');
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(i + 1).toLowerCase() : '';
  }

  function resolveType(file) {
    if (file.type && TYPES[file.type]) return file.type;
    return EXT_TO_TYPE[extOf(file.name)] || null;
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  function sanitizeFileName(name) {
    const clean = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const dot = clean.lastIndexOf('.');
    let base = dot > 0 ? clean.slice(0, dot) : clean;
    let ext = dot > 0 ? clean.slice(dot + 1) : '';
    base = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '');
    ext = ext.replace(/[^A-Za-z0-9]+/g, '').toLowerCase().slice(0, 8);
    if (!base) base = 'arquivo';
    base = base.slice(0, 80);
    return ext ? `${base}.${ext}` : base;
  }

  function buildStoragePath(problemId, uuid, name) {
    return `${problemId}/${uuid}-${sanitizeFileName(name)}`;
  }

  function validateFiles(files, existingCount) {
    const accepted = [];
    const rejected = [];
    for (const file of files) {
      if (!resolveType(file)) {
        rejected.push({ name: file.name, reason: 'tipo de arquivo não permitido' });
      } else if (file.size > MAX_BYTES) {
        rejected.push({ name: file.name, reason: 'maior que 10 MB' });
      } else if (existingCount + accepted.length >= MAX_FILES) {
        rejected.push({ name: file.name, reason: 'limite de 10 anexos por problema' });
      } else {
        accepted.push(file);
      }
    }
    return { accepted, rejected };
  }

  function computeResizeTarget(width, height, bytes) {
    const side = Math.max(width, height);
    const scale = Math.min(1, RESIZE_MAX_SIDE / side);
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      needsResize: side > RESIZE_MAX_SIDE || bytes > RESIZE_MAX_BYTES,
    };
  }

  function typeLabel(mime) { return TYPES[mime] ? TYPES[mime].label : 'ARQ'; }
  function isImage(mime) { return /^image\//.test(mime || ''); }

  return { MAX_BYTES, MAX_FILES, ACCEPT, resolveType, validateFiles, sanitizeFileName, buildStoragePath, formatBytes, typeLabel, isImage, computeResizeTarget };
}));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/`
Expected: todos os testes PASS (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add anexos.js tests/anexos.test.js
git commit -m "feat: funções puras de validação e nomes dos anexos, com testes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Migração do banco (coluna `anexos` + bucket + políticas)

**Files:**
- Create: `supabase/migrations/20260921120000_anexos_problemas.sql`

**Interfaces:**
- Produces: coluna `public.problemas.anexos jsonb not null default '[]'`; bucket privado `anexos-problemas` (10 MB, tipos permitidos); políticas `anexos-problemas select/insert/delete` para `anon, authenticated`.

- [ ] **Step 1: Criar o arquivo SQL** com exatamente o SQL da seção "Banco" da spec (coluna, bucket com `file_size_limit` 10485760 e os 11 mime types, 3 políticas em `storage.objects` restritas a `bucket_id = 'anexos-problemas'`).

- [ ] **Step 2: Avisar o usuário** que a migração vai ser aplicada agora no projeto `mfsyrsegkvjmefcdaegh` (já aprovada no design; é aditiva).

- [ ] **Step 3: Aplicar** com `mcp__claude_ai_Supabase__apply_migration` (`name: anexos_problemas`, `project_id: mfsyrsegkvjmefcdaegh`, mesmo SQL do arquivo).

- [ ] **Step 4: Verificar** com `execute_sql`:

```sql
select column_name, data_type, column_default from information_schema.columns
 where table_schema='public' and table_name='problemas' and column_name='anexos';
select id, public, file_size_limit, array_length(allowed_mime_types,1) as tipos from storage.buckets where id='anexos-problemas';
select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'anexos-problemas%';
select count(*) as total, count(*) filter (where anexos = '[]'::jsonb) as vazios from public.problemas;
```
Expected: coluna `jsonb` com default `'[]'::jsonb`; bucket `public=false`, `file_size_limit=10485760`, `tipos=11`; 3 políticas (SELECT, INSERT, DELETE); `total = vazios` (19 = 19).

- [ ] **Step 5: Rodar `get_advisors` (security)** e registrar apenas avisos novos relacionados a `anexos-problemas` (avisos de `rls true` em tabelas existentes já existiam e estão fora do escopo).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260921120000_anexos_problemas.sql
git commit -m "feat(db): coluna anexos e bucket anexos-problemas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Paleta sóbria e classes CSS (desktop)

Converte todo o estilo inline para classes com variáveis de cor. Layout desktop permanece equivalente ao atual, com a paleta nova. O bloco "Você é" ainda existe aqui (sai na Task 4).

**Files:**
- Modify: `index.html` (reescrever `<style>` e classes do markup)
- Modify: `app.js` (helpers de classe, `getEnriched`, `renderTabs`, `renderLista`, `renderDashboard`, `renderConfig`, `renderStatusPills`, `renderComentarios`, `showLoading`)

**Interfaces:**
- Produces (CSS): classes `btn btn-primary|btn-secondary|btn-light|btn-danger|btn-danger-soft|btn-sm`, `input select textarea lbl`, `card`, `badge st-<slug> crit-<slug>`, `pill (active)`, `tab (active)`, `row`, `c-titulo c-setor c-crit c-resp c-status c-prazo (vencido) c-aberto`, `avatar`, `kpi-grid kpi`, `grid-2`, `bar-row bar-label bar-track bar-fill bar-count`, `chip`, `round-btn`, `person-row`, `comment`, `modal-overlay modal modal-head modal-body modal-actions`, `form-row`, `spacer`, `hidden`, `fade-in`.
- Produces (JS): `slug(str) => string`, `critClass(c) => 'crit-…'`, `statusClass(s) => 'st-…'`, `fgVar(prefix, value) => 'var(--<prefix>-<slug>-fg)'`, `showLoading(v, msg='Carregando...')`.
- Tokens (`:root`): `--brand #1F3A5F`, `--brand-hover #17304F`, `--brand-soft #E6ECF4`, `--bg #F3F5F7`, `--surface #FFFFFF`, `--border #D9DEE4`, `--border-input #C3CAD3`, `--row-alt #F7F9FB`, `--text #1B2430`, `--text-2 #5B6675`, `--danger #B42318`, `--danger-soft #FBE9E7`, `--radius 8px`, e pares `--st-<slug>-bg/-fg` e `--crit-<slug>-bg/-fg`:

| Token | bg | fg |
|---|---|---|
| `st-aberto` | `#E9EDF1` | `#3B4654` |
| `st-em-andamento` | `#DCE8F5` | `#1D4C80` |
| `st-aguardando-terceiros` | `#F3E6D6` | `#7A4B14` |
| `st-resolvido` | `#E0F0E7` | `#1F5C3E` |
| `st-cancelado` | `#ECEEF0` | `#5B6675` |
| `crit-baixa` | `#E4EEE8` | `#2F5D46` |
| `crit-media` | `#F6EBC8` | `#6B4E00` |
| `crit-alta` | `#F6E1DE` | `#8E2A22` |

- [ ] **Step 1: Script de contraste (falha antes de existir)** — criar no scratchpad `contrast.js` que calcula a razão de contraste WCAG para cada par fg/bg da tabela acima, mais `--text` sobre `--surface`, `--text-2` sobre `--surface` e `#fff` sobre `--brand`, e sai com código 1 se algum par ficar abaixo de 4.5.

```js
const L = h => { const c = [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255).map(v => v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4)); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const ratio = (a,b) => { const [x,y] = [L(a),L(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const pairs = [
  ['aberto','#3B4654','#E9EDF1'],['em-andamento','#1D4C80','#DCE8F5'],['aguardando','#7A4B14','#F3E6D6'],
  ['resolvido','#1F5C3E','#E0F0E7'],['cancelado','#5B6675','#ECEEF0'],['baixa','#2F5D46','#E4EEE8'],
  ['media','#6B4E00','#F6EBC8'],['alta','#8E2A22','#F6E1DE'],['texto','#1B2430','#FFFFFF'],
  ['texto-2','#5B6675','#FFFFFF'],['header','#FFFFFF','#1F3A5F'],['danger','#B42318','#FBE9E7'],['danger-btn','#FFFFFF','#B42318'],
];
let bad = 0;
for (const [n,fg,bg] of pairs) { const r = ratio(fg,bg); console.log(n.padEnd(14), r.toFixed(2), r >= 4.5 ? 'ok' : 'FALHA'); if (r < 4.5) bad++; }
process.exit(bad ? 1 : 0);
```
Run: `node <scratchpad>/contrast.js` — Expected: todos `ok`, exit 0. Se algum falhar, escurecer o `fg` até passar e usar o valor corrigido no CSS.

- [ ] **Step 2: Reescrever o `<style>` do `index.html`** com o CSS abaixo (tokens + componentes; o bloco mobile entra na Task 5).

```css
:root{
  --brand:#1F3A5F;--brand-hover:#17304F;--brand-soft:#E6ECF4;
  --bg:#F3F5F7;--surface:#FFFFFF;--border:#D9DEE4;--border-input:#C3CAD3;--row-alt:#F7F9FB;
  --text:#1B2430;--text-2:#5B6675;--danger:#B42318;--danger-soft:#FBE9E7;--radius:8px;
  --st-aberto-bg:#E9EDF1;--st-aberto-fg:#3B4654;
  --st-em-andamento-bg:#DCE8F5;--st-em-andamento-fg:#1D4C80;
  --st-aguardando-terceiros-bg:#F3E6D6;--st-aguardando-terceiros-fg:#7A4B14;
  --st-resolvido-bg:#E0F0E7;--st-resolvido-fg:#1F5C3E;
  --st-cancelado-bg:#ECEEF0;--st-cancelado-fg:#5B6675;
  --crit-baixa-bg:#E4EEE8;--crit-baixa-fg:#2F5D46;
  --crit-media-bg:#F6EBC8;--crit-media-fg:#6B4E00;
  --crit-alta-bg:#F6E1DE;--crit-alta-fg:#8E2A22;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:'Manrope',sans-serif;-webkit-font-smoothing:antialiased;background:var(--bg);color:var(--text);font-size:14px;line-height:1.4}
body.modal-open{overflow:hidden}
select,input,textarea,button{font-family:inherit;font-size:14px;color:inherit}
a{color:var(--brand);text-decoration:none}a:hover{color:var(--brand-hover)}
.hidden{display:none!important}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn .18s ease-out}
.spacer{flex:1}

#loading-overlay{position:fixed;inset:0;background:rgba(243,245,247,.88);display:flex;align-items:center;justify-content:center;z-index:999;font-size:16px;font-weight:600;color:var(--brand)}
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--text);color:#fff;padding:12px 20px;border-radius:var(--radius);font-size:14px;font-weight:600;z-index:1000;pointer-events:none;max-width:calc(100% - 32px);text-align:center}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 18px;border-radius:var(--radius);border:1px solid transparent;font-weight:700;cursor:pointer;white-space:nowrap}
.btn-primary{background:var(--brand);color:#fff}.btn-primary:hover{background:var(--brand-hover)}
.btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border-input)}.btn-secondary:hover{background:var(--bg)}
.btn-light{background:#fff;color:var(--brand)}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger-soft{background:var(--danger-soft);color:var(--danger)}
.btn-sm{min-height:34px;padding:0 12px;font-size:13px}
.icon-btn{border:0;background:#EDF0F3;width:32px;height:32px;border-radius:50%;font-size:18px;line-height:1;cursor:pointer;color:var(--text-2)}
.round-btn{border:0;background:#DDE2E8;width:22px;height:22px;border-radius:50%;font-size:13px;line-height:1;cursor:pointer;color:var(--text-2);flex-shrink:0}

.input,.select,.textarea{width:100%;min-height:40px;padding:9px 12px;border-radius:var(--radius);border:1px solid var(--border-input);background:#fff}
.textarea{resize:vertical}
.input:focus,.select:focus,.textarea:focus,.btn:focus-visible,.tab:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.select{cursor:pointer}
.lbl{display:block;font-size:12px;font-weight:700;color:var(--text-2);margin-bottom:6px}

.app-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding:18px 40px;background:var(--brand);color:#fff}
.brand{display:flex;align-items:baseline;gap:6px;flex-shrink:0}
.brand-1{font-size:20px;font-weight:300;letter-spacing:.04em}
.brand-2{font-size:26px;font-weight:800;letter-spacing:.01em}
.brand-3{font-size:16px;font-weight:400;letter-spacing:.03em;opacity:.85;margin-left:2px}
.header-tools{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.search{width:240px;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3);color:#fff}
.search::placeholder{color:rgba(255,255,255,.78)}
.header-user{display:flex;align-items:center;gap:8px;font-size:13px}
.header-user .select{width:auto;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3);color:#fff;font-weight:600}
.header-user option,.filters option{background:#fff;color:var(--text)}
.system-bar{padding:10px 40px;background:#fff;border-bottom:1px solid var(--border);font-size:12px;font-weight:800;letter-spacing:.1em;color:var(--brand)}
.wrap{padding:24px 40px 0}
main{padding:8px 40px 56px}

.tabs{display:flex;gap:28px;border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:14px 2px;background:none;border:0;border-bottom:2px solid transparent;font-size:15px;font-weight:700;color:var(--text-2);cursor:pointer;white-space:nowrap;flex-shrink:0}
.tab.active{color:var(--brand);border-bottom-color:var(--brand)}
.filters{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}
.filters .select{width:auto;min-width:180px}

.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.card-pad{padding:22px}
.card-title{font-weight:700;font-size:16px;margin-bottom:16px}
.table-card{overflow:hidden}
.table{width:100%;border-collapse:collapse}
.table th{text-align:left;padding:13px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#fff;background:var(--brand)}
.table td{padding:14px 16px;font-size:13px;border-bottom:1px solid var(--border)}
.row{cursor:pointer}
.row:nth-child(even){background:var(--row-alt)}
.row:hover{background:var(--brand-soft)}
.c-titulo{font-size:14px!important;font-weight:700}
.c-setor,.c-aberto{color:var(--text-2)}
.c-prazo{font-weight:700}
.c-prazo.vencido{color:var(--danger)}
.resp{display:flex;align-items:center;gap:8px;font-weight:600}
.avatar{width:24px;height:24px;border-radius:50%;background:var(--brand-soft);color:var(--brand);font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.badge{display:inline-block;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap}
.st-aberto{background:var(--st-aberto-bg);color:var(--st-aberto-fg)}
.st-em-andamento{background:var(--st-em-andamento-bg);color:var(--st-em-andamento-fg)}
.st-aguardando-terceiros{background:var(--st-aguardando-terceiros-bg);color:var(--st-aguardando-terceiros-fg)}
.st-resolvido{background:var(--st-resolvido-bg);color:var(--st-resolvido-fg)}
.st-cancelado{background:var(--st-cancelado-bg);color:var(--st-cancelado-fg)}
.crit-baixa{background:var(--crit-baixa-bg);color:var(--crit-baixa-fg)}
.crit-media{background:var(--crit-media-bg);color:var(--crit-media-fg)}
.crit-alta{background:var(--crit-alta-bg);color:var(--crit-alta-fg)}
.badge-neutral{background:#EDF0F3;color:var(--text-2)}

.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}
.kpi{padding:20px}
.kpi-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2)}
.kpi-body{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:8px}
.kpi-value{font-size:34px;font-weight:800}
.kpi-spark{display:flex;align-items:flex-end;gap:3px;height:30px;border-bottom:1px solid var(--border);padding-bottom:2px}
.kpi-foot{font-size:11px;color:var(--text-2);margin-top:6px}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:20px}
.mt-20{margin-top:20px}.mt-24{margin-top:24px}
.bar-row{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.bar-label{width:110px;font-size:13px;color:var(--text-2);flex-shrink:0}
.bar-track{flex:1;height:10px;background:#E8ECF0;border-radius:6px;overflow:hidden}
.bar-fill{height:10px;border-radius:6px}
.bar-count{width:24px;text-align:right;font-size:13px;font-weight:700}
.old-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #E8ECF0}
.old-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.muted{font-size:13px;color:var(--text-2)}

.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.chip{display:flex;align-items:center;gap:6px;background:#EDF0F3;border-radius:999px;padding:6px 6px 6px 14px;font-size:13px;font-weight:600}
.inline-form{display:flex;gap:8px;flex-wrap:wrap}
.inline-form .input{flex:1;min-width:160px}
.inline-form .select{width:auto}
.person-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #E8ECF0}
.person-row .name{flex:1;font-size:14px;font-weight:600;min-width:0}
.person-row .select{width:auto;min-height:34px;padding:6px 10px;font-size:13px}

.modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:24px;z-index:50}
.modal{background:#fff;border-radius:12px;width:min(560px,100%);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.2)}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:22px 28px 14px}
.modal-head h2{margin:0;font-size:20px;font-weight:700}
.modal-body{padding:6px 28px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px}
.modal-actions{display:flex;align-items:center;gap:10px;padding:14px 28px;border-top:1px solid var(--border);background:#fff;border-radius:0 0 12px 12px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;background:#fff;color:var(--text);border:1px solid var(--border-input)}
.pill.active{background:var(--brand);color:#fff;border-color:var(--brand)}
.info-line{display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--text-2)}
.info-line strong{color:var(--text)}
.section{border-top:1px solid var(--border);padding-top:16px}
.section-title{font-weight:700;font-size:15px;margin-bottom:12px}
.comment{margin-bottom:12px;padding:10px 12px;background:var(--bg);border-radius:var(--radius)}
.comment-head{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;gap:8px}
.comment-head span{color:var(--text-2)}
.comment-text{font-size:13px;line-height:1.4}
.confirm-box{background:#fff;border-radius:12px;padding:28px 32px;max-width:420px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.2)}
.confirm-title{font-size:20px;font-weight:700;margin-bottom:10px}
.confirm-text{font-size:14px;color:var(--text-2);margin-bottom:24px;line-height:1.5}
.confirm-actions{display:flex;justify-content:flex-end;gap:10px}
```

- [ ] **Step 3: Reescrever o markup do `index.html`** usando essas classes (mesmos ids e `onclick`/`oninput` atuais, nada de `style=` exceto valores dinâmicos gerados em JS). Pontos exatos:
  - `#loading-overlay`: `<div id="loading-overlay"><span id="loading-text">Carregando...</span></div>`.
  - `#confirm-modal` → `class="modal-overlay hidden" style="z-index:200"` com `.confirm-box`, `.confirm-title`, `#confirm-text.confirm-text`, `.confirm-actions` e botões `btn btn-secondary` / `btn btn-danger`.
  - `<header class="app-header">` com `.brand` (`.brand-1` GRUPO, `.brand-2` GPS, `.brand-3` Mecanizada) e `.header-tools` contendo `input#busca-problemas.input.search`, `.header-user` (com "Você é" e `select#current-user-select.select`) e `button#btn-new.btn.btn-light` "+ Novo problema".
  - `<div class="system-bar">Central de Problemas</div>` (o nome muda na Task 4).
  - `<div class="wrap">` com `.tabs` (`button#tab-lista.tab.active`, `#tab-dashboard.tab`, `#tab-config.tab`) e `#filters-bar.filters` com três `select.select`.
  - `<main>`: tabela dentro de `.card.table-card`, `<table class="table">` com cabeçalho igual, `tbody#lista-tbody`; dashboard com `#kpi-grid.kpi-grid`, dois `.card.card-pad` em `.grid-2.mt-24`, e `.card.card-pad.mt-20` de "Mais antigos"; config com `.grid-2` e dois `.card.card-pad` (títulos `.card-title`, `#setores-chips.chips`, `.inline-form`).
  - Modal: `#modal-overlay.modal-overlay.hidden` > `.modal.fade-in` (`role="dialog" aria-modal="true" aria-labelledby="modal-title"`) > `.modal-head` (`h2#modal-title` + `button.icon-btn` "×" com `aria-label="Fechar"`), `.modal-body` (campos com `label.lbl` + `.input/.select/.textarea`; pares Setor/Criticidade e Responsável/Prazo em `.form-row`; `#field-aberto-por`; `#info-aberto-por.info-line.hidden`; Status com `#status-pills.pills`; `#historico-section.section.hidden` com `.section-title`, `#comentarios-list` e o formulário de comentário atual) e **`.modal-actions`** fora do `.modal-body` com `#btn-delete.btn.btn-danger-soft.hidden` "Excluir", `<span class="spacer">`, `btn btn-secondary` "Cancelar", `#btn-save.btn.btn-primary` "Salvar".
  - Remover o 🗑 do botão excluir (texto "Excluir").

- [ ] **Step 4: Atualizar o `app.js`.** Substituir `CRIT_STYLE`/`STATUS_STYLE` por helpers e ajustar os renders:

```js
// Constantes visuais (cores vivem no CSS)
function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const critClass = c => 'crit-' + slug(c);
const statusClass = s => 'st-' + slug(s);
const fgVar = (prefix, value) => `var(--${prefix}-${slug(value)}-fg)`; // prefix: 'st' | 'crit'
```

```js
function showLoading(v, msg = 'Carregando...') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.toggle('hidden', !v);
}
```

`getEnriched`: remover `critBadgeStyle`, `statusBadgeStyle`, `prazoStyle`; adicionar `critCls: critClass(p.criticidade)`, `statusCls: statusClass(p.status)`, `vencido` (booleano já calculado).

`renderTabs`:
```js
function renderTabs() {
  const { activeTab } = state;
  ['lista', 'dashboard', 'config'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', activeTab === t);
    document.getElementById('view-' + t).classList.toggle('hidden', activeTab !== t);
  });
  document.getElementById('filters-bar').classList.toggle('hidden', activeTab !== 'lista');
}
```

`renderLista` (linha vazia e linhas; `data-label` serão usados só no mobile):
```js
function renderLista() {
  const filtered = getFiltered();
  const tbody = document.getElementById('lista-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty"><td colspan="7" style="padding:60px;text-align:center;color:var(--text-2);">Nenhum problema encontrado com esses filtros.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(p => `
    <tr class="row" onclick="app.openEdit(state.problems.find(x=>x.id==='${esc(p.id)}'))">
      <td class="c-titulo">${esc(p.titulo)}</td>
      <td class="c-setor" data-label="Setor">${esc(p.setor)}</td>
      <td class="c-crit"><span class="badge ${p.critCls}">${esc(p.criticidade)}</span></td>
      <td class="c-resp"><div class="resp"><span class="avatar">${esc(p.responsavelIniciais)}</span><span>${esc(p.responsavelNome)}</span></div></td>
      <td class="c-status"><span class="badge ${p.statusCls}">${esc(p.status)}</span></td>
      <td class="c-prazo${p.vencido ? ' vencido' : ''}" data-label="Prazo">${p.prazoFmt}</td>
      <td class="c-aberto" data-label="Aberto por">${esc(p.abertoPorNome)}</td>
    </tr>`).join('');
}
```

`renderDashboard`: KPIs usam `fgVar('st', 'Aberto')` etc. e `fgVar('crit','Alta')` como cor (`style="color:…"` e cor das barrinhas do `spark`); cartões com `.card.kpi`, `.kpi-label`, `.kpi-body`, `.kpi-value`, `.kpi-spark`, `.kpi-foot`; barras com `.bar-row/.bar-label/.bar-track/.bar-fill/.bar-count` (setor: `background:var(--brand)`; criticidade: `background:${fgVar('crit', r.criticidade)}`); "Mais antigos" com `.old-item/.old-main`, setor em `.badge.badge-neutral`, pílula de dias `badge crit-alta` quando `diasAberto >= 14`, senão `badge badge-neutral`; vazio em `.muted`.

`renderConfig`: chips `.chip` + `button.round-btn`; pessoas `.person-row` com `.avatar`, `.name`, `select.select` e `button.round-btn`.

`renderStatusPills`: `<button class="pill${active ? ' active' : ''}" onclick="app.setDraftStatus('…')">`.

`renderComentarios`: `.comment > .comment-head (strong + span) + .comment-text`; vazio em `<div class="muted" style="margin-bottom:12px">`.

- [ ] **Step 5: Verificar** — `node --check app.js` (sem erros); `grep -n "oklch" index.html app.js` (sem resultados); subir um servidor estático no scratchpad e capturar 1280px:

```bash
# servidor estático (scratchpad/serve.js): node serve.js 5173  → serve a pasta do projeto
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu --hide-scrollbars --window-size=1280,900 --virtual-time-budget=6000 --screenshot="<scratchpad>/t3-1280.png" http://localhost:5173/index.html
```
Ler o PNG e conferir: cabeçalho azul-marinho sólido, tabela com cabeçalho marinho, etiquetas sóbrias, sem roxo/azul elétrico. Repetir para as abas Dashboard e Configurações (via `--virtual-time-budget` não clica; usar Playwright na Task 8 para abas/modal — aqui basta a Lista).

- [ ] **Step 6: Commit**

```bash
git add index.html app.js
git commit -m "style: paleta sóbria com variáveis CSS e classes no lugar de estilos inline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Nome do sistema, remoção do "Você é" e autor do comentário

**Files:**
- Modify: `index.html`, `app.js`

**Interfaces:**
- Consumes: classes da Task 3, `state.currentUserId`.
- Produces: `app.setComentarioAutor(id:string)`, `renderComentarioAutor()`; `state.currentUserId` passa a ser "última pessoa escolhida" (string vazia se nenhuma).

- [ ] **Step 1: `index.html`** — trocar `<title>` por `MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada`; `meta description` por `Mapeamento de atividades e problemas operacionais do Grupo GPS Mecanizada.`; texto da `.system-bar` por `MAPEAMENTO DE ATIVIDADES`; **remover** o bloco `.header-user` inteiro (rótulo "Você é" + `#current-user-select`).

- [ ] **Step 2: `index.html`** — no `#historico-section`, substituir o formulário de comentário por:

```html
<div class="comment-form">
  <select id="comentario-autor" class="select" aria-label="Quem está comentando" onchange="app.setComentarioAutor(this.value)"></select>
  <div class="inline-form" style="margin-top:8px;">
    <input id="novo-comentario" type="text" class="input" placeholder="Adicionar comentário...">
    <button class="btn btn-secondary" onclick="app.addComment()">Enviar</button>
  </div>
</div>
```
(o `.select` e o `.inline-form .input` já estão estilizados; remover `.header-user` do CSS.)

- [ ] **Step 3: `app.js`** — comentário de topo: `// MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada`. Remover `setCurrentUser` de `app`. Em `loadAll`, trocar a restauração por:

```js
const savedUser = localStorage.getItem('probsys_user');
state.currentUserId = savedUser && state.pessoas.find(p => p.id === savedUser) ? savedUser : '';
```
Em `renderSelects`, apagar o trecho que preenche `#current-user-select` (as linhas de `userSel`).

- [ ] **Step 4: `app.js`** — autor do comentário:

```js
  setComentarioAutor(id) {
    state.currentUserId = id;
    if (id) localStorage.setItem('probsys_user', id);
  },

  addComment() {
    const input = document.getElementById('novo-comentario');
    const texto = input.value.trim();
    if (!state.modal) return;
    const autorId = document.getElementById('comentario-autor').value;
    const autor = state.pessoas.find(p => p.id === autorId);
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
```
```js
function renderComentarioAutor() {
  const sel = document.getElementById('comentario-autor');
  sel.innerHTML = `<option value="">Quem está comentando?</option>` +
    state.pessoas.map(p => `<option value="${esc(p.id)}" ${p.id === state.currentUserId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
}
```
Chamar `renderComentarioAutor()` dentro de `renderModal()` quando `isEdit` (junto de `renderComentarios()`).

- [ ] **Step 5: Verificar** — `node --check app.js`; `grep -n "Você é\|current-user-select\|setCurrentUser\|Central de Problemas" index.html app.js README.md` deve listar apenas o README (corrigido na Task 7); abrir o app no Playwright/Edge e confirmar: cabeçalho sem "Você é", barra mostra "MAPEAMENTO DE ATIVIDADES", aba do navegador com o título novo, ao editar um problema o formulário de comentário tem o seletor e recusa enviar sem escolher.

- [ ] **Step 6: Commit**

```bash
git add index.html app.js
git commit -m "feat: renomeia para MAPEAMENTO DE ATIVIDADES e troca 'Você é' por autor no comentário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Interface fluida no celular

**Files:**
- Modify: `index.html` (CSS `@media`), `app.js` (`openNew`, `openEdit`, `closeModal`)

**Interfaces:**
- Consumes: classes da Task 3; ids `btn-new`, `#toast`.
- Produces: comportamento responsivo em `max-width: 768px`; `body.modal-open` controla o travamento de rolagem.

- [ ] **Step 1: Adicionar ao final do `<style>`**

```css
@media (max-width:768px){
  body{font-size:15px}
  .app-header{padding:14px 16px;gap:12px}
  .header-tools{width:100%}
  .search{width:100%}
  .system-bar{padding:10px 16px}
  .wrap{padding:16px 16px 0}
  main{padding:8px 16px 104px}
  #btn-new{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:40;min-height:52px;padding:0 22px;border-radius:999px;background:var(--brand);color:#fff;box-shadow:0 6px 18px rgba(15,23,42,.35);border:2px solid #fff}
  #toast{bottom:calc(88px + env(safe-area-inset-bottom))}

  .input,.select,.textarea,select,input,textarea{font-size:16px;min-height:44px}
  .btn{min-height:44px}
  .btn-sm{min-height:44px}
  .icon-btn{width:44px;height:44px}
  .round-btn{width:32px;height:32px}
  .pill{min-height:40px}
  .tabs{gap:22px}
  .tab{min-height:44px}
  .filters{flex-direction:column;margin:16px 0}
  .filters .select{width:100%;min-width:0}

  .table-card{border:0;background:transparent}
  .table thead{display:none}
  .table,.table tbody{display:block}
  .table tr.row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:14px 16px;margin-bottom:10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
  .table tr.row:nth-child(even){background:var(--surface)}
  .table tr.empty{display:block;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
  .table td{display:block;padding:0;border:0}
  .table td.c-titulo{order:0;flex:1 0 100%;font-size:15px!important}
  .table td.c-crit{order:1}
  .table td.c-status{order:2}
  .table td.c-resp{order:3;flex:1 0 100%}
  .table td.c-setor{order:4}
  .table td.c-prazo{order:5}
  .table td.c-aberto{order:6}
  .table td[data-label]::before{content:attr(data-label) ": ";color:var(--text-2);font-weight:600}
  .table td.c-prazo.vencido::before{color:var(--danger)}

  .kpi-grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .kpi{padding:16px}
  .kpi-value{font-size:28px}
  .bar-label{width:84px}
  .old-item{align-items:flex-start;flex-direction:column}
  .card-pad{padding:18px}
  .person-row{flex-wrap:wrap}
  .person-row .name{flex:1 0 calc(100% - 100px)}
  .person-row .select{min-height:44px}
  .inline-form .select,.inline-form .btn{width:100%}

  .modal-overlay{padding:0;align-items:stretch}
  .modal{width:100%;max-height:none;height:100vh;height:100dvh;border-radius:0}
  .modal-head{padding:16px}
  .modal-body{padding:4px 16px 16px}
  .modal-actions{padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-radius:0}
  .form-row{grid-template-columns:1fr}
  .confirm-box{padding:22px}
  .confirm-actions .btn{flex:1}
}
```

- [ ] **Step 2: `app.js`** — travar/destravar a rolagem: em `openNew()` e `openEdit()`, depois de remover `hidden` do overlay, `document.body.classList.add('modal-open');`; em `closeModal()`, `document.body.classList.remove('modal-open');`.

- [ ] **Step 3: Verificar** com Playwright (setup completo na Task 8): capturas em 360×740, 390×844 e 768×1024 da Lista, Dashboard, Configurações e do modal (novo e edição). Conferir: sem rolagem horizontal (`document.documentElement.scrollWidth <= window.innerWidth`), botão flutuante visível, cartões da lista legíveis, modal ocupa a tela com rodapé fixo, e em 1280 o layout desktop segue igual.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "feat: layout responsivo para celular (cartões, modal em tela cheia, botão flutuante)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Anexos (interface e lógica)

**Files:**
- Modify: `index.html` (script `anexos.js`, seção Anexos, CSS), `app.js` (estado, upload/remoção, `saveDraft`, `doDelete`, indicador na lista)

**Interfaces:**
- Consumes: `Anexos.*` (Task 1), bucket/coluna (Task 2), `showLoading(v, msg)` (Task 3).
- Produces: `BUCKET = 'anexos-problemas'`; `draft.anexos: Array<{path,nome,tipo,tamanho,enviado_em}>`, `draft.pendentes: Array<{tempId,file,nome,tipo,tamanho,previewUrl}>`, `draft.removidos: string[]`; `app.onFilesSelected(input)`, `app.removeAnexo(i)`, `app.removePendente(i)`, `app.openAnexo(i)`; `renderAnexos()`; `uploadAnexo(problemaId, pend) => Promise<meta>`; `removeFromStorage(paths) => Promise<void>` (melhor esforço).

- [ ] **Step 1: `index.html`** — antes de `<script src="app.js">`, adicionar `<script src="anexos.js"></script>`. No `.modal-body`, entre o bloco de Status e `#historico-section`, adicionar:

```html
<div id="anexos-section">
  <label class="lbl">Anexos <span id="anexos-count" class="muted"></span></label>
  <div id="anexos-list" class="anexos-list"></div>
  <input id="anexos-input" type="file" multiple class="hidden" onchange="app.onFilesSelected(this)">
  <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="document.getElementById('anexos-input').click()">Adicionar arquivo</button>
  <div class="muted" style="margin-top:6px;font-size:12px;">Imagens, PDF, Word, Excel, PowerPoint e TXT · até 10 MB cada · máx. 10 anexos</div>
</div>
```
CSS (antes do `@media`):
```css
.anexos-list{display:flex;flex-direction:column;gap:8px}
.anexo{display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:#fff}
.anexo-thumb{width:44px;height:44px;border-radius:6px;background:var(--brand-soft);color:var(--brand);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}
.anexo-thumb img{width:100%;height:100%;object-fit:cover}
.anexo-info{flex:1;min-width:0}
.anexo-nome{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.anexo-meta{font-size:12px;color:var(--text-2)}
.anexo-actions{display:flex;gap:6px;flex-shrink:0}
.clip{display:inline-flex;align-items:center;gap:3px;margin-left:8px;color:var(--text-2);font-size:12px;font-weight:600;vertical-align:middle}
```
Preencher `accept` em `app.js` na inicialização: `document.getElementById('anexos-input').accept = Anexos.ACCEPT;`.

- [ ] **Step 2: `app.js` — estado e helpers de storage**

```js
const BUCKET = 'anexos-problemas';

async function removeFromStorage(paths) {
  if (!paths || !paths.length) return;
  try { await sb.storage.from(BUCKET).remove(paths); } catch (_) { /* melhor esforço */ }
}

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
```
`state` ganha `signedUrls: {}`.

- [ ] **Step 3: `app.js` — draft e métodos de `app`**

Em `openNew`: `draft` inclui `anexos: [], pendentes: [], removidos: []`. Em `openEdit`: `anexos: (p.anexos || []).slice(), pendentes: [], removidos: []`. Chamar `renderAnexos()` no fim de `renderModal()`. Em `closeModal()`: revogar `previewUrl` dos pendentes (`URL.revokeObjectURL`) e `state.signedUrls = {}`.

```js
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
    const w = window.open('', '_blank');
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.path, 3600);
    if (error || !data) { if (w) w.close(); showToast('Não foi possível abrir o arquivo.'); return; }
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else { window.location.href = data.signedUrl; }
  },
```

- [ ] **Step 4: `app.js` — render dos anexos**

```js
function renderAnexos() {
  const { modal } = state;
  if (!modal) return;
  const d = modal.draft;
  const total = d.anexos.length + d.pendentes.length;
  document.getElementById('anexos-count').textContent = total ? `(${total}/${Anexos.MAX_FILES})` : '';
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
```

- [ ] **Step 5: `app.js` — `saveDraft` com envio antes de gravar**

Substituir o corpo do `try` de `saveDraft` por este fluxo (validações e `payload` atuais permanecem; `payload.anexos` é novo):

```js
    let uploaded = [];
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
          done++; showLoading(true, `Enviando anexos (${done}/${pend.length})...`);
          return meta;
        }));
        uploaded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.find(r => r.status === 'rejected');
        if (failed) throw failed.reason;
      }
      showLoading(true, 'Salvando...');
      const payload = {
        titulo: d.titulo.trim(), descricao: d.descricao || '', setor: d.setor, criticidade: d.criticidade,
        status: d.status || 'Aberto', responsavel_id: d.responsavel_id, aberto_por_id: d.aberto_por_id,
        prazo: d.prazo || null, comentarios: d.comentarios || [],
        anexos: (d.anexos || []).concat(uploaded), id: problemaId,
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
      uploaded = [];                       // gravado: não desfazer
      await removeFromStorage(d.removidos); // melhor esforço
      app.closeModal();
      render();
      showToast(modal.mode === 'new' ? 'Problema criado!' : 'Problema atualizado!');
    } catch (e) {
      await removeFromStorage(uploaded.map(u => u.path)); // desfaz o lote enviado
      showToast('Erro ao salvar: ' + e.message, 5000);
    } finally {
      showLoading(false);
    }
```
Se o salvamento falhar, o `draft` continua no formulário (nada foi perdido) e os pendentes seguem pendentes.

- [ ] **Step 6: `app.js` — excluir problema e indicador**

Em `doDelete`, antes de `deleteProblemaDB(id)`: `const paths = ((state.problems.find(p => p.id === id) || {}).anexos || []).map(a => a.path);` e, depois do `deleteProblemaDB` bem-sucedido, `await removeFromStorage(paths);`.

Em `renderLista`, no `c-titulo`, acrescentar depois do título:
```js
${(p.anexos || []).length ? `<span class="clip" title="${p.anexos.length} anexo(s)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 11.6l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>${p.anexos.length}</span>` : ''}
```

- [ ] **Step 7: Verificar** — `node --check app.js`; `node --test tests/`; E2E na Task 8.

- [ ] **Step 8: Commit**

```bash
git add index.html app.js
git commit -m "feat: anexos de imagens e documentos nos problemas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Trocar o título para `# MAPEAMENTO DE ATIVIDADES — Grupo GPS Mecanizada`; na lista de funcionalidades acrescentar `📎 **Anexos** de imagens e documentos (até 10 MB, máx. 10 por problema)` e `📱 **Interface responsiva** para celular`; remover menção a "Você é" se existir; em "Estrutura do banco" acrescentar `problemas … anexos (JSONB)` e o bucket `anexos-problemas` (privado, 10 MB); acrescentar seção "Testes" com `node --test tests/`; acrescentar nota de que o envio de anexos não exige login (mesmo nível de exposição das tabelas) e que a migração está em `supabase/migrations/`.
- [ ] **Step 2: Commit** `docs: atualiza README (nome, anexos, testes)`.

---

### Task 8: Verificação final e entrega

**Files:** nenhum (scripts no scratchpad)

- [ ] **Step 1: Setup** — `npm i playwright-core --prefix <scratchpad>`; servidor estático `serve.js` na porta 5173; scripts Playwright usam `chromium.launch({ channel: 'msedge' })` (sem baixar navegador).
- [ ] **Step 2: Layout** — em 360, 390, 768 e 1280 de largura: capturar Lista, Dashboard, Configurações e o modal (novo e edição). Para cada largura, checar `scrollWidth <= innerWidth` (sem rolagem horizontal) e que o botão "+ Novo problema" está visível e clicável. Ler as capturas e corrigir qualquer problema encontrado (novo commit `fix:`).
- [ ] **Step 3: E2E dos anexos no banco real** — via UI: abrir "+ Novo problema", preencher os obrigatórios com título `ZZ TESTE ANEXOS`, anexar `teste.pdf` (pequeno) e `foto.png` (gerada, > 1600px para exercitar o redimensionamento), tentar anexar `virus.exe` (deve ser recusado com aviso) e um arquivo de 11 MB (recusado); salvar; reabrir o problema, conferir 2 anexos, miniatura da imagem carregada e "Abrir" retornando URL assinada válida (HTTP 200 via `fetch`); remover 1 anexo e salvar; conferir no storage (`execute_sql` em `storage.objects where bucket_id='anexos-problemas'`) que o removido sumiu; excluir o problema pela UI e conferir que o storage ficou vazio e o problema não existe mais. Ao final, garantir por SQL que não sobrou nenhum objeto nem linha `ZZ TESTE ANEXOS`.
- [ ] **Step 4: Regressão** — abrir um problema existente (sem anexos), editar, salvar e conferir que grava (`anexos = []`); comentar escolhendo autor; recarregar e conferir que o autor foi lembrado.
- [ ] **Step 5: Testes e sintaxe** — `node --test tests/` e `node --check app.js` sem falhas. `git status` só com `.thumbnail` não versionado.
- [ ] **Step 6: Entrega** — resumir ao usuário o que mudou, o que foi verificado (e o que não foi), o avisos de exposição dos anexos e a pergunta de onde o app é publicado; **pedir confirmação antes de `git push`** (branch `mapeamento-de-atividades`) e perguntar se quer merge em `master`.
