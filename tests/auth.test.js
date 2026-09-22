const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

test('isCompanyEmail aceita os domínios da empresa', () => {
  assert.equal(A.isCompanyEmail('fulano@gestaogps.com.br'), true);
  assert.equal(A.isCompanyEmail('fulano@gpssa.com.br'), true);
  assert.equal(A.isCompanyEmail('FULANO@GESTAOGPS.COM.BR'), true);
});

test('isCompanyEmail recusa outros domínios', () => {
  assert.equal(A.isCompanyEmail('fulano@gmail.com'), false);
  assert.equal(A.isCompanyEmail('fulano@gestaogps.com.br.evil.com'), false);
  assert.equal(A.isCompanyEmail(''), false);
  assert.equal(A.isCompanyEmail(null), false);
});
