try { process.loadEnvFile(); } catch { /* sem .env: usa variáveis do sistema */ }
// Cria os usuários de demonstração com senha criptografada (bcrypt).
// Rode DEPOIS de importar o schema.sql:  npm run seed
const bcrypt = require('bcrypt');
const pool = require('../src/db');

const usuarios = [
  { nome: 'Roberto Lima', email: 'gerente@valpasta.com',  senha: '123456', perfil: 'gerente',  func: 'F-03', setor: null },
  { nome: 'Carlos Silva', email: 'tecnico@valpasta.com',  senha: '123456', perfil: 'tecnico',  func: 'F-01', setor: null },
  { nome: 'Ana Souza',    email: 'ana@valpasta.com',      senha: '123456', perfil: 'tecnico',  func: 'F-02', setor: null },
  { nome: 'Operador Corte', email: 'operador@valpasta.com', senha: '123456', perfil: 'operador', func: null,   setor: 'S02' },
];

(async () => {
  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.senha, 10);
    await pool.query(
      `INSERT INTO usuarios (nome,email,senha_hash,perfil,id_funcionario,id_setor)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE senha_hash=VALUES(senha_hash), perfil=VALUES(perfil)`,
      [u.nome, u.email, hash, u.perfil, u.func, u.setor]
    );
    console.log('✔', u.email, '/', u.senha, `(${u.perfil})`);
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
