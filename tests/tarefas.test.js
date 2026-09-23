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

test('shiftDate soma e subtrai dias respeitando virada de mês', () => {
  assert.equal(Tf.shiftDate('2026-09-22', 1), '2026-09-23');
  assert.equal(Tf.shiftDate('2026-09-22', -1), '2026-09-21');
  assert.equal(Tf.shiftDate('2026-09-30', 1), '2026-10-01');
  assert.equal(Tf.shiftDate('2026-10-01', -1), '2026-09-30');
});
