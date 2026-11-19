const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Entre novamente' });
  }
}

// Ex.: router.post('/', permitir('gerente'), ...)
const permitir = (...perfis) => (req, res, next) =>
  perfis.includes(req.user.perfil)
    ? next()
    : res.status(403).json({ erro: 'Seu perfil não tem acesso a este recurso' });

module.exports = { autenticar, permitir };
