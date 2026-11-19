const router = require('express').Router();
const pool = require('../db');
const { permitir } = require('../middleware/auth');
const { HttpError, exigir, num } = require('../utils');
const { verificarPreventivas } = require('../services/manutencao');

const FOTO_OK = /^data:image\/(png|jpeg|webp);base64,/;
const FOTO_MAX = 6 * 1024 * 1024; // caracteres do base64

const LISTA = `
  SELECT o.id_os, o.id_maquina, o.tipo, o.status, o.descricao, o.id_tecnico, o.tempo_estimado, o.tempo_reparo,
         o.data_abertura, o.data_inicio, o.data_conclusao, o.automatica, o.id_tipo_falha,
         (o.foto IS NOT NULL) AS tem_foto,
         m.modelo, s.nome AS setor, f.nome AS tecnico, tf.nome AS tipo_falha,
         (SELECT GROUP_CONCAT(CONCAT(p.nome,' x',op.quantidade) SEPARATOR ', ')
            FROM os_pecas op JOIN pecas p ON p.id_peca=op.id_peca WHERE op.id_os=o.id_os) AS pecas
    FROM ordens_servico o
    JOIN maquinas m ON m.id_maquina=o.id_maquina
    JOIN setores s ON s.id_setor=m.id_setor
    LEFT JOIN funcionarios f ON f.id_funcionario=o.id_tecnico
    LEFT JOIN tipos_falha tf ON tf.id_tipo_falha=o.id_tipo_falha`;

// Listagem conforme o perfil
router.get('/', async (req, res) => {
  const u = req.user;
  let where = '', params = [];
  if (u.perfil === 'tecnico') { where = 'WHERE o.id_tecnico=?'; params = [u.id_funcionario]; }
  if (u.perfil === 'operador') {
    where = u.id_setor ? 'WHERE (m.id_setor=? OR o.id_solicitante=?)' : 'WHERE o.id_solicitante=?';
    params = u.id_setor ? [u.id_setor, u.id] : [u.id];
  }
  const [rows] = await pool.query(`${LISTA} ${where} ORDER BY o.data_abertura DESC, o.id_os DESC`, params);
  res.json(rows);
});

router.get('/:id/foto', async (req, res) => {
  const [[o]] = await pool.query('SELECT foto FROM ordens_servico WHERE id_os=?', [req.params.id]);
  if (!o || !o.foto) throw new HttpError(404, 'Esta OS não tem foto');
  res.json({ foto: o.foto });
});

// Abertura de chamado (RF-007). Operador só abre corretiva (RN-003)
router.post('/', async (req, res) => {
  const b = req.body, u = req.user;
  exigir(b, ['id_maquina', 'descricao']);
  const tipo = u.perfil === 'gerente' && b.tipo === 'Preventiva' ? 'Preventiva' : 'Corretiva';
  if (b.foto) {
    if (!FOTO_OK.test(b.foto) || b.foto.length > FOTO_MAX) throw new HttpError(400, 'Foto inválida ou maior que 4 MB');
  }
  const [[m]] = await pool.query('SELECT id_setor, status FROM maquinas WHERE id_maquina=?', [b.id_maquina]);
  if (!m) throw new HttpError(404, 'Máquina não encontrada');
  if (u.perfil === 'operador' && u.id_setor && u.id_setor !== m.id_setor) throw new HttpError(403, 'Você só pode abrir chamados do seu setor');

  const [r] = await pool.query(
    `INSERT INTO ordens_servico (id_maquina,tipo,descricao,foto,id_tipo_falha,id_solicitante) VALUES (?,?,?,?,?,?)`,
    [b.id_maquina, tipo, b.descricao.trim(), b.foto || null, b.id_tipo_falha || null, u.id]);
  // Chamado corretivo para a máquina: ela passa a "Parada" (se ainda não estiver em manutenção)
  if (tipo === 'Corretiva' && m.status !== 'Em manutenção') {
    await pool.query(`UPDATE maquinas SET status='Parada' WHERE id_maquina=?`, [b.id_maquina]);
  }
  res.status(201).json({ id_os: r.insertId });
});

// Atribuir técnico + estimativa (RN-004)
router.patch('/:id/atribuir', permitir('gerente'), async (req, res) => {
  exigir(req.body, ['id_tecnico', 'tempo_estimado']);
  const est = num(req.body.tempo_estimado);
  if (!(est > 0)) throw new HttpError(400, 'Informe uma estimativa de tempo maior que zero');
  const [[o]] = await pool.query('SELECT status FROM ordens_servico WHERE id_os=?', [req.params.id]);
  if (!o) throw new HttpError(404, 'OS não encontrada');
  if (o.status === 'Concluída' || o.status === 'Em andamento') throw new HttpError(409, `OS ${o.status.toLowerCase()} não pode ser reatribuída`);
  await pool.query(`UPDATE ordens_servico SET id_tecnico=?, tempo_estimado=?, status='Atribuída' WHERE id_os=?`,
    [req.body.id_tecnico, est, req.params.id]);
  res.json({ ok: true });
});

async function carregarOS(db, id, user, forUpdate = false) {
  const [[o]] = await db.query(`SELECT * FROM ordens_servico WHERE id_os=? ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  if (!o) throw new HttpError(404, 'OS não encontrada');
  const dono = user.perfil === 'gerente' || (user.perfil === 'tecnico' && o.id_tecnico === user.id_funcionario);
  if (!dono) throw new HttpError(403, 'Esta OS não está atribuída a você');
  return o;
}

router.patch('/:id/iniciar', permitir('gerente', 'tecnico'), async (req, res) => {
  const o = await carregarOS(pool, req.params.id, req.user);
  if (o.status !== 'Atribuída') throw new HttpError(409, 'Só é possível iniciar uma OS atribuída a um técnico');
  await pool.query(`UPDATE ordens_servico SET status='Em andamento', data_inicio=NOW() WHERE id_os=?`, [o.id_os]);
  await pool.query(`UPDATE maquinas SET status='Em manutenção' WHERE id_maquina=?`, [o.id_maquina]);
  res.json({ ok: true });
});

// Encerrar OS: baixa de estoque só aqui, dentro de transação (RF-008 / RN-002)
router.patch('/:id/concluir', permitir('gerente', 'tecnico'), async (req, res) => {
  const b = req.body;
  const tempo = num(b.tempo_reparo);
  if (!(tempo > 0)) throw new HttpError(400, 'Informe o tempo de reparo em horas');
  const pecas = Array.isArray(b.pecas) ? b.pecas : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const o = await carregarOS(conn, req.params.id, req.user, true);
    if (o.status !== 'Em andamento') throw new HttpError(409, 'Inicie a OS antes de encerrá-la');

    for (const p of pecas) {
      const qtd = Math.floor(num(p.quantidade));
      if (!(qtd > 0)) throw new HttpError(400, 'Quantidade de peça inválida');
      const [[peca]] = await conn.query('SELECT nome, custo_unitario FROM pecas WHERE id_peca=?', [p.id_peca]);
      if (!peca) throw new HttpError(404, 'Peça não encontrada');
      const [r] = await conn.query('UPDATE pecas SET estoque_atual = estoque_atual - ? WHERE id_peca=? AND estoque_atual >= ?', [qtd, p.id_peca, qtd]);
      if (!r.affectedRows) throw new HttpError(409, `Estoque insuficiente de "${peca.nome}"`);
      await conn.query('INSERT INTO os_pecas (id_os,id_peca,quantidade,custo_unitario) VALUES (?,?,?,?)',
        [o.id_os, p.id_peca, qtd, peca.custo_unitario]);
    }

    await conn.query(
      `UPDATE ordens_servico SET status='Concluída', data_conclusao=NOW(), tempo_reparo=?, id_tipo_falha=COALESCE(?, id_tipo_falha) WHERE id_os=?`,
      [tempo, b.id_tipo_falha || null, o.id_os]);
    // Preventiva zera o horímetro do ciclo; corretiva mantém
    await conn.query(
      `UPDATE maquinas SET ultima_manutencao=CURDATE(), status='Operando',
              horas_funcionamento = IF(?='Preventiva', 0, horas_funcionamento) WHERE id_maquina=?`,
      [o.tipo, o.id_maquina]);
    await verificarPreventivas(conn); // recalcula "Manutenção próxima" / gera nova OS se ainda passou do limite
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

module.exports = router;
