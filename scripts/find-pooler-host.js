require('dotenv').config();
const { Client } = require('pg');

const PROJECT_REF = 'jfljyxbpkulfxpvwxjwm';
const PASSWORD = 'Pietrelcina2025.';
const REGION = 'us-west-2';

const candidates = [];
for (let i = 0; i <= 4; i++) {
  candidates.push(`aws-${i}-${REGION}.pooler.supabase.com`);
}

(async () => {
  console.log('Testando hosts possíveis para o projeto', PROJECT_REF, 'na região', REGION);
  console.log('---');
  let found = false;
  for (const host of candidates) {
    const url = `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${host}:6543/postgres`;
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      console.log('✅ FUNCIONOU:', host);
      console.log('---> STRING CORRETA:');
      console.log(`postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${host}:6543/postgres`);
      await client.end();
      found = true;
      break;
    } catch (e) {
      console.log('❌ falhou:', host, '-', e.message);
    }
  }
  if (!found) {
    console.log('---');
    console.log('Nenhum host funcionou. Pode ser outra região ou a senha precisa de ajuste.');
  }
  process.exit(0);
})();
