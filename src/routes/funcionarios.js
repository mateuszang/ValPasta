const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { permitir } = require('../middleware/auth');
const { HttpError, exigir } = require('../utils');

router.use(permitir('gerente'));

router.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT f.*, u.email, u.perfil FROM funcionarios f
       LEFT JOIN usuarios u ON u.id_funcionario = f.id_funcionario ORDER BY f.id_funcionario`);
  res.json(rows);
});

// Cadastra o funcionário e, se vier e-mail + senha, já cria o login dele
router.post('/', async (req, res) => {
  const b = req.body;
  exigir(b, ['id_funcionario', 'nome', 'cargo', 'turno']);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO funcionarios (id_funcionario,nome,cargo,turno,especialidade) VALUES (?,?,?,?,?)',
      [b.id_funcionario.trim().toUpperCase(), b.nome.trim(), b.cargo.trim(), b.turno, b.especialidade || null]);
    if (b.email && b.senha) {
      if (String(b.senha).length < 6) throw new HttpError(400, 'A senha deve ter ao menos 6 caracteres');
      const perfil = ['tecnico', 'gerente'].includes(b.perfil) ? b.perfil : 'tecnico';
      await conn.query(
        'INSERT INTO usuarios (nome,email,senha_hash,perfil,id_funcionario) VALUES (?,?,?,?,?)',
        [b.nome.trim(), b.email.trim().toLowerCase(), await bcrypt.hash(String(b.senha), 10), perfil, b.id_funcionario.trim().toUpperCase()]);
    }
    await conn.commit();
    res.status(201).json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

router.put('/:id', async (req, res) => {
  const b = req.body;
  exigir(b, ['nome', 'cargo', 'turno']);
  const [r] = await pool.query(
    'UPDATE funcionarios SET nome=?, cargo=?, turno=?, especialidade=? WHERE id_funcionario=?',
    [b.nome.trim(), b.cargo.trim(), b.turno, b.especialidade || null, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Funcionário não encontrado');
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM funcionarios WHERE id_funcionario=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
