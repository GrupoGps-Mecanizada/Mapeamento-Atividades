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
