const router = require('express').Router();
const pool = require('../db');
const { permitir } = require('../middleware/auth');
const { HttpError, exigir, num } = require('../utils');
const { verificarPreventivas } = require('../services/manutencao');

const SELECT = `SELECT m.*, s.nome AS setor FROM maquinas m JOIN setores s ON s.id_setor = m.id_setor`;
const limitarSetor = (u) => (u.perfil === 'operador' && u.id_setor ? u.id_setor : null);

router.get('/setores', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM setores ORDER BY nome');
  res.json(rows);
});

router.get('/tipos-falha', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM tipos_falha ORDER BY id_tipo_falha');
  res.json(rows);
});

router.get('/', async (req, res) => {
  const setor = limitarSetor(req.user);
  const [rows] = await pool.query(`${SELECT} ${setor ? 'WHERE m.id_setor=?' : ''} ORDER BY m.id_maquina`, setor ? [setor] : []);
  res.json(rows);
});

// Ficha da máquina (também aberta pelo QR Code)
router.get('/:id', async (req, res) => {
  const [[m]] = await pool.query(`${SELECT} WHERE m.id_maquina=?`, [req.params.id]);
  if (!m) throw new HttpError(404, 'Máquina não encontrada');
  const setor = limitarSetor(req.user);
  if (setor && setor !== m.id_setor) throw new HttpError(403, 'Máquina de outro setor');
  const [historico] = await pool.query(
    `SELECT o.id_os, o.tipo, o.status, o.descricao, o.data_abertura, o.data_conclusao, o.tempo_reparo,
            f.nome AS tecnico,
            (SELECT GROUP_CONCAT(CONCAT(p.nome,' x',op.quantidade) SEPARATOR ', ')
               FROM os_pecas op JOIN pecas p ON p.id_peca=op.id_peca WHERE op.id_os=o.id_os) AS pecas
       FROM ordens_servico o LEFT JOIN funcionarios f ON f.id_funcionario=o.id_tecnico
      WHERE o.id_maquina=? ORDER BY o.data_abertura DESC`, [req.params.id]);
  res.json({ ...m, historico });
});

function lerCampos(b) {
  exigir(b, ['id_maquina', 'modelo', 'id_setor', 'limite_horas']);
  const limite = num(b.limite_horas), horas = num(b.horas_funcionamento || 0);
  if (!(limite > 0)) throw new HttpError(400, 'O limite de horas deve ser maior que zero');
  if (!(horas >= 0)) throw new HttpError(400, 'Horas de funcionamento inválidas');
  return {
    id_maquina: b.id_maquina.trim().toUpperCase(), modelo: b.modelo.trim(), id_setor: b.id_setor,
    data_aquisicao: b.data_aquisicao || null, ultima_manutencao: b.ultima_manutencao || null,
    horas_funcionamento: horas, limite_horas: limite,
  };
}

router.post('/', permitir('gerente'), async (req, res) => {
  const c = lerCampos(req.body);
  await pool.query(
    `INSERT INTO maquinas (id_maquina,modelo,id_setor,data_aquisicao,ultima_manutencao,horas_funcionamento,horas_totais,limite_horas)
     VALUES (?,?,?,?,?,?,?,?)`,
    [c.id_maquina, c.modelo, c.id_setor, c.data_aquisicao, c.ultima_manutencao, c.horas_funcionamento, c.horas_funcionamento, c.limite_horas]);
  await verificarPreventivas();
  res.status(201).json({ ok: true });
});

router.put('/:id', permitir('gerente'), async (req, res) => {
  const c = lerCampos({ ...req.body, id_maquina: req.params.id });
  const [r] = await pool.query(
    `UPDATE maquinas SET modelo=?, id_setor=?, data_aquisicao=?, ultima_manutencao=?, horas_funcionamento=?, limite_horas=? WHERE id_maquina=?`,
    [c.modelo, c.id_setor, c.data_aquisicao, c.ultima_manutencao, c.horas_funcionamento, c.limite_horas, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Máquina não encontrada');
  await verificarPreventivas();
  res.json({ ok: true });
});

router.delete('/:id', permitir('gerente'), async (req, res) => {
  await pool.query('DELETE FROM maquinas WHERE id_maquina=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
