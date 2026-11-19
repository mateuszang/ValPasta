class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Garante que os campos obrigatórios foram enviados
function exigir(obj, campos) {
  const faltando = campos.filter(c => obj[c] === undefined || obj[c] === null || String(obj[c]).trim() === '');
  if (faltando.length) throw new HttpError(400, `Campos obrigatórios: ${faltando.join(', ')}`);
}

const num = (v) => (v === '' || v === undefined || v === null ? NaN : Number(v));

module.exports = { HttpError, exigir, num };
