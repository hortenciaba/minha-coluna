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

    let checkins = [];
    if (r.patient_id) {
      const checkinsResult = await pool.query(
        'SELECT * FROM checkins WHERE patient_id = $1 ORDER BY created_at ASC',
        [r.patient_id]
      );
      checkins = checkinsResult.rows.map((c) => ({
        painScore: c.pain_score,
        movementScore: c.movement_score,
        confidenceScore: c.confidence_score,
        sleepScore: c.sleep_score,
        qolScore: c.qol_score,
        createdAt: c.created_at,
      }));
    }

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
      hasAccount: !!r.patient_id,
      checkins,
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

// Lista todas as contas de pacientes (inclusive quem só fez check-ins de evolução, sem responder o checklist)
router.get('/patients', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM submissions s WHERE s.patient_id = p.id) AS submissions_count,
        (SELECT COUNT(*) FROM checkins c WHERE c.patient_id = p.id) AS checkins_count
      FROM patients p
      ORDER BY p.created_at DESC
    `);
    const data = result.rows.map((r) => ({
      id: r.id,
      name: decrypt(r.name_enc),
      email: decrypt(r.email_enc),
      phone: decrypt(r.phone_enc),
      createdAt: r.created_at,
      submissionsCount: Number(r.submissions_count),
      checkinsCount: Number(r.checkins_count),
    }));
    await pool.query('INSERT INTO audit_log (actor, action, ip) VALUES ($1, $2, $3)', [req.admin.username, 'list_patients', req.ip]);
    res.json({ patients: data });
  } catch (e) {
    next(e);
  }
});

// Evolução (check-ins semanais) de uma conta de paciente específica
router.get('/patients/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const patientResult = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);
    if (patientResult.rowCount === 0) return res.status(404).json({ error: 'Conta não encontrada.' });
    const p = patientResult.rows[0];

    const checkinsResult = await pool.query('SELECT * FROM checkins WHERE patient_id = $1 ORDER BY created_at ASC', [id]);
    const submissionsResult = await pool.query('SELECT id, self_score, self_category, started_at, updated_at FROM submissions WHERE patient_id = $1 ORDER BY started_at ASC', [id]);

    await pool.query('INSERT INTO audit_log (actor, action, target_id, ip) VALUES ($1, $2, $3, $4)', [req.admin.username, 'view_patient', id, req.ip]);
    res.json({
      id: p.id,
      name: decrypt(p.name_enc),
      email: decrypt(p.email_enc),
      phone: decrypt(p.phone_enc),
      createdAt: p.created_at,
      checkins: checkinsResult.rows.map((c) => ({
        painScore: c.pain_score,
        movementScore: c.movement_score,
        confidenceScore: c.confidence_score,
        sleepScore: c.sleep_score,
        qolScore: c.qol_score,
        createdAt: c.created_at,
      })),
      submissions: submissionsResult.rows.map((s) => ({
        id: s.id,
        selfScore: s.self_score,
        selfCategory: s.self_category,
        startedAt: s.started_at,
        updatedAt: s.updated_at,
      })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
