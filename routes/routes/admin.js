const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { decrypt } = require('../crypto');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

    const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const admin = result.rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      await pool.query('INSERT INTO audit_log (actor, action, ip) VALUES ($1, $2, $3)', [username, 'login_failed', req.ip]);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign({ sub: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
    await pool.query('INSERT INTO audit_log (actor, action, ip) VALUES ($1, $2, $3)', [username, 'login_success', req.ip]);
    res.json({ token });
  } catch (e) {
    next(e);
  }
});

router.get('/submissions', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM submissions ORDER BY updated_at DESC');
    const data = result.rows.map((r) => ({
      id: r.id,
      name: decrypt(r.name_enc),
      email: decrypt(r.email_enc),
      phone: decrypt(r.phone_enc),
      alertSummary: r.alert_summary_enc ? decrypt(r.alert_summary_enc) : null,
      selfScore: r.self_score,
      selfCategory: r.self_category,
      observations: r.observations_enc ? decrypt(r.observations_enc) : null,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
    }));
    await pool.query('INSERT INTO audit_log (actor, action, ip) VALUES ($1, $2, $3)', [req.admin.username, 'list_submissions', req.ip]);
    res.json({ submissions: data });
  } catch (e) {
    next(e);
  }
});

router.get('/submissions/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Não encontrado.' });
    const r = result.rows[0];
    await pool.query('INSERT INTO audit_log (actor, action, target_id, ip) VALUES ($1, $2, $3, $4)', [req.admin.username, 'view_submission', id, req.ip]);
    res.json({
      id: r.id,
      name: decrypt(r.name_enc),
      email: decrypt(r.email_enc),
      phone: decrypt(r.phone_enc),
      alertAnswers: r.alert_answers_enc ? JSON.parse(decrypt(r.alert_answers_enc)) : null,
      alertSummary: r.alert_summary_enc ? decrypt(r.alert_summary_enc) : null,
      selfAnswers: r.self_answers_enc ? JSON.parse(decrypt(r.self_answers_enc)) : null,
      selfOtherText: r.self_other_text_enc ? JSON.parse(decrypt(r.self_other_text_enc)) : null,
      selfScore: r.self_score,
      selfCategory: r.self_category,
      observations: r.observations_enc ? decrypt(r.observations_enc) : null,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/submissions/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM submissions WHERE id = $1', [id]);
    await pool.query('INSERT INTO audit_log (actor, action, target_id, ip) VALUES ($1, $2, $3, $4)', [req.admin.username, 'delete_submission', id, req.ip]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
