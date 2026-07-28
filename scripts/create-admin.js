require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.log('Uso: npm run create-admin -- <usuario> <senha>');
    process.exit(1);
  }
  if (password.length < 10) {
    console.log('Use uma senha com pelo menos 10 caracteres.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
    [username, hash]
  );
  console.log(`Usuário admin "${username}" criado/atualizado com sucesso.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
