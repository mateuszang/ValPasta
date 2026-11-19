const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { HttpError, exigir } = require('../utils');

router.post('/login', async (req, res) => {
  exigir(req.body, ['email', 'senha']);
  const [[u]] = await pool.query('SELECT * FROM usuarios WHERE email=? AND ativo=1', [req.body.email.trim().toLowerCase()]);
  const ok = u && (await bcrypt.compare(String(req.body.senha), u.senha_hash));
  if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos');

  const user = { id: u.id_usuario, nome: u.nome, perfil: u.perfil, id_funcionario: u.id_funcionario, id_setor: u.id_setor };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRA || '8h' });
  res.json({ token, user });
});

router.get('/me', autenticar, (req, res) => res.json({ user: req.user }));

module.exports = router;
