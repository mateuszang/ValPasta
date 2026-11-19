const mysql = require('mysql2/promise');

module.exports = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'valpasta',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // DATE/DATETIME voltam como texto (sem problema de fuso)
  decimalNumbers: true,   // DECIMAL volta como número
});
