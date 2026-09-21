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
