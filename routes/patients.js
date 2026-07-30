const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { encrypt, decrypt, hashToken } = require('../crypto');
const { requirePatient } = require('../middleware/auth');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function signPatientToken(patientId) {
  return jwt.sign({ patientId }, process.env.JWT_SECRET, { expiresIn: '180d' });
}

// Cria uma conta nova (e-mail + senha) na primeira vez que o paciente usa o checklist
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!phone || String(phone).replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Telefone inválido.' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

    const emailHash = hashToken(normalizeEmail(email));
    const existing = await pool.query('SELECT id FROM patients WHERE email_hash = $1', [emailHash]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Faça login em vez de cadastrar.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await pool.query(
      `INSERT INTO patients (email_hash, email_enc, name_enc, phone_enc, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [emailHash, encrypt(String(email).trim()), encrypt(String(name).trim()), encrypt(String(phone).trim()), passwordHash]
    );

    const patientId = result.rows[0].id;
    res.status(201).json({
      token: signPatientToken(patientId),
      patient: { id: patientId, name: String(name).trim(), email: String(email).trim(), phone: String(phone).trim() },
    });
  } catch (e) {
    next(e);
  }
});

// Login com e-mail + senha
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });

    const emailHash = hashToken(normalizeEmail(email));
    const result = await pool.query('SELECT * FROM patients WHERE email_hash = $1', [emailHash]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    const patient = result.rows[0];
    const ok = await bcrypt.compare(String(password), patient.password_hash);
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    res.json({
      token: signPatientToken(patient.id),
      patient: {
        id: patient.id,
        name: decrypt(patient.name_enc),
        email: decrypt(patient.email_enc),
        phone: decrypt(patient.phone_enc),
      },
    });
  } catch (e) {
    next(e);
  }
});

// Dados básicos do paciente logado (usado para reconhecer sessão salva / preencher formulário)
router.get('/me', requirePatient, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [req.patientId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Conta não encontrada.' });
    const p = result.rows[0];
    res.json({ id: p.id, name: decrypt(p.name_enc), email: decrypt(p.email_enc), phone: decrypt(p.phone_enc) });
  } catch (e) {
    next(e);
  }
});

// Histórico combinado: sinais de alerta + autoavaliação + check-ins semanais, para o painel de evolução
router.get('/me/history', requirePatient, async (req, res, next) => {
  try {
    const submissionsResult = await pool.query(
      'SELECT * FROM submissions WHERE patient_id = $1 ORDER BY started_at ASC',
      [req.patientId]
    );
    const checkinsResult = await pool.query(
      'SELECT * FROM checkins WHERE patient_id = $1 ORDER BY created_at ASC',
      [req.patientId]
    );

    const submissions = submissionsResult.rows.map((r) => ({
      id: r.id,
      alertSummary: r.alert_summary_enc ? decrypt(r.alert_summary_enc) : null,
      selfScore: r.self_score,
      selfCategory: r.self_category,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
    }));

    const checkins = checkinsResult.rows.map((r) => ({
      id: r.id,
      painScore: r.pain_score,
      movementScore: r.movement_score,
      confidenceScore: r.confidence_score,
      sleepScore: r.sleep_score,
      qolScore: r.qol_score,
      createdAt: r.created_at,
    }));

    res.json({ submissions, checkins });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
