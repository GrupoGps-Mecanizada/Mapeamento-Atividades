const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

test('nomeToEmail usa só o primeiro nome, minúsculo, sem acento', () => {
  assert.equal(A.nomeToEmail('Warlison'), 'warlison@mecanizada.com');
  assert.equal(A.nomeToEmail('Warlison Abreu'), 'warlison@mecanizada.com');
  assert.equal(A.nomeToEmail('Ícaro Bernardo'), 'icaro@mecanizada.com');
  assert.equal(A.nomeToEmail('  Débora  Luisa  '), 'debora@mecanizada.com');
});

test('nomeToEmail remove espaços e símbolos do primeiro nome', () => {
  assert.equal(A.nomeToEmail("O'Neil"), 'oneil@mecanizada.com');
});

test('nomeToEmail devolve string vazia para entrada vazia', () => {
  assert.equal(A.nomeToEmail(''), '');
  assert.equal(A.nomeToEmail('   '), '');
  assert.equal(A.nomeToEmail(null), '');
  assert.equal(A.nomeToEmail(undefined), '');
});
