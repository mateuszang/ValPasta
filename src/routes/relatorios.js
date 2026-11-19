const router = require('express').Router();
const pool = require('../db');
const { permitir } = require('../middleware/auth');

router.use(permitir('gerente')); // RNF-002

router.get('/', async (_req, res) => {
  // 1) Máquinas com mais avarias (total e a líder de cada mês)
  const [porMaquina] = await pool.query(
    `SELECT id_maquina, COUNT(*) AS falhas FROM ordens_servico WHERE tipo='Corretiva'
      GROUP BY id_maquina ORDER BY falhas DESC, id_maquina`);
  const [porMes] = await pool.query(
    `SELECT DATE_FORMAT(data_abertura,'%Y-%m') AS mes, id_maquina, COUNT(*) AS falhas
       FROM ordens_servico WHERE tipo='Corretiva' GROUP BY mes, id_maquina ORDER BY mes DESC, falhas DESC`);
  const lideres = [];
  for (const r of porMes) if (!lideres.find(l => l.mes === r.mes)) lideres.push(r);

  // 2) Horas produtivas perdidas por setor (tempo de reparo das corretivas concluídas)
  const [porSetor] = await pool.query(
    `SELECT s.nome AS setor, COALESCE(SUM(o.tempo_reparo),0) AS horas
       FROM setores s JOIN maquinas m ON m.id_setor=s.id_setor
       LEFT JOIN ordens_servico o ON o.id_maquina=m.id_maquina AND o.tipo='Corretiva' AND o.status='Concluída'
      GROUP BY s.id_setor, s.nome HAVING COUNT(m.id_maquina) > 0 ORDER BY horas DESC`);

  // 3) MTTR por tipo de falha
  const [mttrTipo] = await pool.query(
    `SELECT tf.nome AS tipo_falha, ROUND(AVG(o.tempo_reparo),1) AS mttr, COUNT(*) AS ocorrencias
       FROM ordens_servico o JOIN tipos_falha tf ON tf.id_tipo_falha=o.id_tipo_falha
      WHERE o.status='Concluída' AND o.tempo_reparo IS NOT NULL GROUP BY tf.id_tipo_falha, tf.nome ORDER BY mttr DESC`);

  // 4) Preventivas por técnico
  const [porTecnico] = await pool.query(
    `SELECT f.nome AS tecnico, COUNT(*) AS preventivas
       FROM ordens_servico o JOIN funcionarios f ON f.id_funcionario=o.id_tecnico
      WHERE o.tipo='Preventiva' AND o.status='Concluída' GROUP BY f.id_funcionario, f.nome ORDER BY preventivas DESC`);

  // Resumo + projeção de custos para os próximos 30 dias
  const [[res1]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(AVG(tempo_reparo),0) AS media, COALESCE(SUM(tempo_reparo),0) AS horas
       FROM ordens_servico WHERE status='Concluída'`);
  const [[cp]] = await pool.query(`SELECT COALESCE(SUM(quantidade*custo_unitario),0) AS custo FROM os_pecas`);
  const [[osComPeca]] = await pool.query(`SELECT COUNT(DISTINCT id_os) AS n FROM os_pecas`);
  const [[pend]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(tempo_estimado, ?)),0) AS horas
       FROM ordens_servico WHERE status<>'Concluída'`, [res1.media || 2]);
  const [maq] = await pool.query('SELECT status FROM maquinas');
  const disp = maq.length ? Math.round(100 * maq.filter(m => ['Operando', 'Manutenção próxima'].includes(m.status)).length / maq.length) : 0;
  const custoHora = Number(process.env.CUSTO_HORA_MO || 45);
  const custoMedioPecas = osComPeca.n ? cp.custo / osComPeca.n : 0;

  res.json({
    falhas_por_maquina: porMaquina, lider_por_mes: lideres, horas_por_setor: porSetor,
    mttr_por_tipo: mttrTipo, preventivas_por_tecnico: porTecnico,
    resumo: {
      total_ordens: res1.total, tempo_medio: Math.round(res1.media * 10) / 10, horas_totais: res1.horas,
      custo_pecas: cp.custo, disponibilidade: disp,
    },
    projecao_30d: {
      os_pendentes: pend.n,
      pecas: Math.round(pend.n * custoMedioPecas * 100) / 100,
      mao_de_obra: Math.round(pend.horas * custoHora * 100) / 100,
      custo_hora: custoHora,
    },
  });
});

// Exportação CSV (RF-011). Separador ";" e BOM para abrir certo no Excel pt-BR
router.get('/csv', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT o.id_os, o.id_maquina, s.nome AS setor, o.tipo, o.status, tf.nome AS tipo_falha, f.nome AS tecnico,
            o.data_abertura, o.data_conclusao, o.tempo_reparo,
            COALESCE((SELECT SUM(op.quantidade*op.custo_unitario) FROM os_pecas op WHERE op.id_os=o.id_os),0) AS custo_pecas,
            REPLACE(o.descricao, '\n', ' ') AS descricao
       FROM ordens_servico o JOIN maquinas m ON m.id_maquina=o.id_maquina JOIN setores s ON s.id_setor=m.id_setor
       LEFT JOIN tipos_falha tf ON tf.id_tipo_falha=o.id_tipo_falha LEFT JOIN funcionarios f ON f.id_funcionario=o.id_tecnico
      ORDER BY o.id_os`);
  const cab = ['OS', 'Máquina', 'Setor', 'Tipo', 'Status', 'Tipo de falha', 'Técnico', 'Abertura', 'Conclusão', 'Tempo de reparo (h)', 'Custo de peças (R$)', 'Descrição'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\uFEFF' + [cab, ...rows.map(r => Object.values(r))].map(l => l.map(esc).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="relatorio-manutencao.csv"');
  res.send(csv);
});

module.exports = router;
