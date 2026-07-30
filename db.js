const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      write_token_hash TEXT NOT NULL,
      name_enc TEXT NOT NULL,
      email_enc TEXT NOT NULL,
      phone_enc TEXT NOT NULL,
      consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      alert_answers_enc TEXT,
      alert_summary_enc TEXT,
      self_answers_enc TEXT,
      self_score INTEGER,
      self_category TEXT,
      observations_enc TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS self_other_text_enc TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_enc TEXT NOT NULL,
      phone_enc TEXT NOT NULL,
      answers_enc TEXT NOT NULL,
      pain_score INTEGER,
      movement_score INTEGER,
      confidence_score INTEGER,
      sleep_score INTEGER,
      qol_score INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      ip TEXT,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, initDb };
