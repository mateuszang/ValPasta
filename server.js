// SGM ValPasta - Sistema de Gestão de Manutenção
// Back-end completo em UM arquivo (Node + Express + MySQL + bcrypt + JWT + cors)

// 1. IMPORTANDO AS BIBLIOTECAS
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

// ============================================================
// 2. CONFIGURAÇÕES (altere aqui se precisar)
// ============================================================

const PORT = 3000;
// Chave que assina os tokens JWT (na vida real ficaria num .env)
const SECRET_KEY = 'minha_chave_secreta_super_segura_123';
const TOKEN_EXPIRA = '8h';
// Simulador: horas somadas sozinhas a cada 60s (0 = só pelo botão "Simular +50h")
const HORAS_SIMULADAS_POR_MINUTO = 0;
// Custo da hora de mão de obra (projeção de custos)
const CUSTO_HORA_MO = 45;

// 3. CONECTANDO AO BANCO DE DADOS
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',                    // Modifique se o seu usuário MySQL for diferente
  password: 'senai',               // Modifique se o seu MySQL tiver senha
  database: 'valpasta',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,               // DATE/DATETIME voltam como texto
  decimalNumbers: true,            // DECIMAL volta como número
});

// ============================================================
// 4. FUNÇÕES DE APOIO
// ============================================================

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Garante que os campos obrigatórios foram enviados
function exigir(obj, campos) {
  const faltando = campos.filter(c => obj[c] === undefined || obj[c] === null || String(obj[c]).trim() === '');
  if (faltando.length) throw new HttpError(400, `Campos obrigatórios: ${faltando.join(', ')}`);
}

const num = (v) => (v === '' || v === undefined || v === null ? NaN : Number(v));

// ============================================================
// 5. SEGURANÇA: valida o token JWT e o perfil do usuário
// ============================================================

function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar' });
  try {
    req.user = jwt.verify(token, SECRET_KEY);
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

// ============================================================
// 6. SIMULADOR DE HORÍMETRO E GERAÇÃO DE OS PREVENTIVA
// ============================================================

/**
 * Verificação do horímetro (RN-001 / RF-006 / RNF-005).
 * - Atualiza o status "Operando" <-> "Manutenção próxima" (>= 90% do limite)
 * - Gera OS preventiva automaticamente quando horas >= limite (sem duplicar)
 * Aceita o pool ou uma conexão (para rodar dentro de transação).
 */
async function verificarPreventivas(db = pool) {
  const [maquinas] = await db.query(
    `SELECT id_maquina, horas_funcionamento AS h, limite_horas AS l, status
       FROM maquinas WHERE status IN ('Operando','Manutenção próxima')`
  );
  let geradas = 0;
  for (const m of maquinas) {
    const novo = m.h >= m.l * 0.9 ? 'Manutenção próxima' : 'Operando';
    if (novo !== m.status) {
      await db.query('UPDATE maquinas SET status=? WHERE id_maquina=?', [novo, m.id_maquina]);
    }
    if (m.h >= m.l) {
      const [abertas] = await db.query(
        `SELECT 1 FROM ordens_servico WHERE id_maquina=? AND tipo='Preventiva' AND status<>'Concluída' LIMIT 1`,
        [m.id_maquina]
      );
      if (!abertas.length) {
        await db.query(
          `INSERT INTO ordens_servico (id_maquina,tipo,status,descricao,automatica)
           VALUES (?,'Preventiva','Aberta',?,1)`,
          [m.id_maquina, `Preventiva automática: horímetro atingiu ${m.h}h (limite ${m.l}h)`]
        );
        geradas++;
      }
    }
  }
  return geradas;
}

// Simulador de horímetro: soma horas nas máquinas que estão rodando
async function simularHoras(horas) {
  if (!(horas > 0 && horas <= 1000)) throw new HttpError(400, 'Informe de 1 a 1000 horas');
  await pool.query(
    `UPDATE maquinas SET horas_funcionamento = horas_funcionamento + ?, horas_totais = horas_totais + ?
      WHERE status IN ('Operando','Manutenção próxima')`,
    [horas, horas]
  );
  return verificarPreventivas();
}

// Timer do simulador: a cada 60s (RNF-005)
function iniciarSimulador() {
  const porMinuto = HORAS_SIMULADAS_POR_MINUTO;
  setInterval(async () => {
    try {
      if (porMinuto > 0) await simularHoras(porMinuto);
      else await verificarPreventivas();
    } catch (e) { console.error('[simulador]', e.message); }
  }, 60 * 1000);
}

// ============================================================
// 7. ROTAS DA API
// ============================================================

const rotasAuth = (() => {
  const router = express.Router();
  router.post('/login', async (req, res) => {
    exigir(req.body, ['email', 'senha']);
    const [[u]] = await pool.query('SELECT * FROM usuarios WHERE email=? AND ativo=1', [req.body.email.trim().toLowerCase()]);
    const ok = u && (await bcrypt.compare(String(req.body.senha), u.senha_hash));
    if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos');

    const user = { id: u.id_usuario, nome: u.nome, perfil: u.perfil, id_funcionario: u.id_funcionario, id_setor: u.id_setor };
    const token = jwt.sign(user, SECRET_KEY, { expiresIn: TOKEN_EXPIRA });
    res.json({ token, user });
  });

  router.get('/me', autenticar, (req, res) => res.json({ user: req.user }));
  return router;
})();

const rotasMaquinas = (() => {
  const router = express.Router();
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
  return router;
})();

const rotasFuncionarios = (() => {
  const router = express.Router();
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
  return router;
})();

const rotasPecas = (() => {
  const router = express.Router();
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
  return router;
})();

const rotasOS = (() => {
  const router = express.Router();
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
  return router;
})();

const rotasDashboard = (() => {
  const router = express.Router();
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
  return router;
})();

const rotasRelatorios = (() => {
  const router = express.Router();
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
    const custoHora = CUSTO_HORA_MO;
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
  return router;
})();


// ============================================================
// 8. INICIALIZANDO O SERVIDOR EXPRESS
// ============================================================

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' })); // fotos em base64

app.use('/api/auth', rotasAuth);
app.use('/api', autenticar);                 // tudo abaixo exige login
app.use('/api/maquinas', rotasMaquinas);
app.use('/api/funcionarios', rotasFuncionarios);
app.use('/api/pecas', rotasPecas);
app.use('/api/os', rotasOS);
app.use('/api/relatorios', rotasRelatorios);
app.use('/api', rotasDashboard);
app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Disponibiliza os arquivos do front-end (pasta 'public')
app.use(express.static(path.join(__dirname, 'public')));

// Tratamento de erros (Express 5 repassa erros de funções async para cá)
app.use((err, _req, res, _next) => {
  const mapa = {
    ER_DUP_ENTRY: [409, 'Já existe um registro com este código/e-mail'],
    ER_ROW_IS_REFERENCED_2: [409, 'Não é possível excluir: existem registros vinculados (OS, usuários...)'],
    ER_NO_REFERENCED_ROW_2: [400, 'Referência inválida (setor, técnico ou peça inexistente)'],
    ER_TRUNCATED_WRONG_VALUE: [400, 'Valor inválido em algum campo'],
    ER_CHECK_CONSTRAINT_VIOLATED: [409, 'Operação deixaria o estoque negativo'],
  };
  const [status, msg] = err.status ? [err.status, err.message] : mapa[err.code] || [500, 'Erro interno do servidor'];
  if (status === 500) console.error(err);
  res.status(status).json({ erro: msg });
});

// Cria os usuários de demonstração (senha 123456, com bcrypt) se a tabela estiver vazia
async function criarUsuariosDemo() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM usuarios');
  if (n > 0) return;
  const demo = [
    ['Roberto Lima', 'gerente@valpasta.com', 'gerente', 'F-03', null],
    ['Carlos Silva', 'tecnico@valpasta.com', 'tecnico', 'F-01', null],
    ['Ana Souza', 'ana@valpasta.com', 'tecnico', 'F-02', null],
    ['Operador Corte', 'operador@valpasta.com', 'operador', null, 'S02'],
  ];
  const hash = await bcrypt.hash('123456', 10);
  for (const [nome, email, perfil, func, setor] of demo) {
    await pool.query(
      'INSERT INTO usuarios (nome,email,senha_hash,perfil,id_funcionario,id_setor) VALUES (?,?,?,?,?,?)',
      [nome, email, hash, perfil, func, setor]);
  }
  console.log('Usuários de demonstração criados (senha 123456)');
}

// 9. LIGANDO O SERVIDOR
app.listen(PORT, async () => {
  console.log(`Servidor rodando e escutando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
  try {
    await pool.query('SELECT 1');
    console.log('Conectado ao banco de dados MySQL com sucesso!');
    await criarUsuariosDemo();
    await verificarPreventivas();
    iniciarSimulador();
  } catch (e) { console.error('Erro ao conectar no banco:', e.message); }
});