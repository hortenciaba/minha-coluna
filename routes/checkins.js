const express = require('express');
const { pool } = require('../db');
const { encrypt, decrypt } = require('../crypto');

const router = express.Router();

// Cria um novo check-in semanal, identificado por e-mail + telefone
router.post('/', async (req, res, next) => {
  try {
    const { email, phone, answers, painScore, movementScore, confidenceScore, sleepScore, qolScore } = req.body || {};
    if (!email || !phone) return res.status(400).json({ error: 'E-mail e telefone são obrigatórios.' });
    if (!answers) return res.status(400).json({ error: 'Respostas do check-in são obrigatórias.' });

    await pool.query(
      `INSERT INTO checkins (email_enc, phone_enc, answers_enc, pain_score, movement_score, confidence_score, sleep_score, qol_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        encrypt(String(email).trim()),
        encrypt(String(phone).trim()),
        encrypt(JSON.stringify(answers)),
        painScore ?? null,
        movementScore ?? null,
        confidenceScore ?? null,
        sleepScore ?? null,
        qolScore ?? null,
      ]
    );

    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Histórico de check-ins de um paciente, por e-mail + telefone
router.post('/history', async (req, res, next) => {
  try {
    const { email, phone } = req.body || {};
    if (!email || !phone) return res.status(400).json({ error: 'Informe e-mail e telefone.' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).replace(/\D/g, '');

    const result = await pool.query('SELECT * FROM checkins ORDER BY created_at ASC');
    const history = result.rows
      .filter((r) => {
        const rowEmail = decrypt(r.email_enc).trim().toLowerCase();
        const rowPhone = decrypt(r.phone_enc).replace(/\D/g, '');
        return rowEmail === normalizedEmail && rowPhone === normalizedPhone;
      })
      .map((r) => ({
        painScore: r.pain_score,
        movementScore: r.movement_score,
        confidenceScore: r.confidence_score,
        sleepScore: r.sleep_score,
        qolScore: r.qol_score,
        createdAt: r.created_at,
      }));

    res.json({ history });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
