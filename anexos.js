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
