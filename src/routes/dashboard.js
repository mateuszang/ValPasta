const router = require('express').Router();
const pool = require('../db');
const { permitir } = require('../middleware/auth');
const { simularHoras } = require('../services/manutencao');
const { num } = require('../utils');

router.get('/dashboard', async (req, res) => {
  const u = req.user;
  const setor = u.perfil === 'operador' && u.id_setor ? u.id_setor : null;
  const [maquinas] = await pool.query(
    `SELECT m.*, s.nome AS setor FROM maquinas m JOIN setores s ON s.id_setor=m.id_setor
      ${setor ? 'WHERE m.id_setor=?' : ''} ORDER BY m.id_maquina`, setor ? [setor] : []);

  const alertas = [];
  for (const m of maquinas) {
    if (m.horas_funcionamento >= m.limite_horas) alertas.push({ tipo: 'limite', texto: `${m.id_maquina}: ${m.horas_funcionamento}/${m.limite_horas}h (limite atingido)` });
    else if (m.status === 'Manutenção próxima') alertas.push({ tipo: 'proxima', texto: `${m.id_maquina}: ${m.horas_funcionamento}/${m.limite_horas}h (manutenção próxima)` });
  }
  if (u.perfil !== 'operador') {
    const [baixo] = await pool.query('SELECT nome, estoque_atual FROM pecas WHERE estoque_atual <= estoque_minimo ORDER BY nome');
    baixo.forEach(p => alertas.push({ tipo: 'estoque', texto: `Estoque baixo: ${p.nome} (${p.estoque_atual})` }));
  }

  let kpis = null;
  if (u.perfil === 'gerente') {
    const total = maquinas.length || 1;
    const disponiveis = maquinas.filter(m => ['Operando', 'Manutenção próxima'].includes(m.status)).length;
    const [[f]] = await pool.query(`SELECT COUNT(*) AS falhas FROM ordens_servico WHERE tipo='Corretiva'`);
    const [[r]] = await pool.query(`SELECT AVG(tempo_reparo) AS mttr FROM ordens_servico WHERE tipo='Corretiva' AND status='Concluída'`);
    const horas = maquinas.reduce((a, m) => a + m.horas_totais, 0);
    kpis = {
      disponibilidade: Math.round((disponiveis / total) * 100),
      mtbf: f.falhas ? Math.round(horas / f.falhas) : null,   // horas operadas / nº de falhas
      mttr: r.mttr != null ? Math.round(r.mttr * 10) / 10 : null,
      alertas: alertas.length,
    };
  }
  res.json({ kpis, maquinas, alertas, total_alertas: alertas.length });
});

// Contador do menu: nº de alertas
router.post('/simulador', permitir('gerente'), async (req, res) => {
  const geradas = await simularHoras(num(req.body.horas));
  res.json({ ok: true, os_geradas: geradas });
});

module.exports = router;
