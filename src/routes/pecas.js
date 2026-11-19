const router = require('express').Router();
const pool = require('../db');
const { permitir } = require('../middleware/auth');
const { HttpError, exigir, num } = require('../utils');

router.get('/', permitir('gerente', 'tecnico'), async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM pecas ORDER BY nome');
  res.json(rows);
});

function ler(b) {
  exigir(b, ['nome']);
  const atual = num(b.estoque_atual), min = num(b.estoque_minimo), custo = num(b.custo_unitario || 0);
  if (![atual, min, custo].every(v => v >= 0)) throw new HttpError(400, 'Estoque e custo devem ser números maiores ou iguais a zero');
  return [b.nome.trim(), Math.floor(atual), Math.floor(min), custo];
}

router.post('/', permitir('gerente'), async (req, res) => {
  await pool.query('INSERT INTO pecas (nome,estoque_atual,estoque_minimo,custo_unitario) VALUES (?,?,?,?)', ler(req.body));
  res.status(201).json({ ok: true });
});

router.put('/:id', permitir('gerente'), async (req, res) => {
  const [r] = await pool.query('UPDATE pecas SET nome=?, estoque_atual=?, estoque_minimo=?, custo_unitario=? WHERE id_peca=?',
    [...ler(req.body), req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Peça não encontrada');
  res.json({ ok: true });
});

router.delete('/:id', permitir('gerente'), async (req, res) => {
  await pool.query('DELETE FROM pecas WHERE id_peca=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
