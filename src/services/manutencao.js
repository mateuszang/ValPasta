const pool = require('../db');
const { HttpError } = require('../utils');

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
  const porMinuto = Number(process.env.SIMULADOR_HORAS_POR_MINUTO || 0);
  setInterval(async () => {
    try {
      if (porMinuto > 0) await simularHoras(porMinuto);
      else await verificarPreventivas();
    } catch (e) { console.error('[simulador]', e.message); }
  }, 60 * 1000);
}

module.exports = { verificarPreventivas, simularHoras, iniciarSimulador };
