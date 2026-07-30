const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { encrypt, decrypt, hashToken } = require('../crypto');
const { requireWriteToken } = require('../middleware/auth');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Cria um novo registro quando o paciente começa o checklist
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, consent } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!phone || String(phone).replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Telefone inválido.' });
    if (!consent) return res.status(400).json({ error: 'É necessário concordar com o armazenamento dos dados.' });

    const writeToken = crypto.randomBytes(24).toString('hex');

    const result = await pool.query(
      `INSERT INTO submissions (write_token_hash, name_enc, email_enc, phone_enc, consent_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id`,
      [hashToken(writeToken), encrypt(String(name).trim()), encrypt(String(email).trim()), encrypt(String(phone).trim())]
    );

    res.status(201).json({ id: result.rows[0].id, writeToken });
  } catch (e) {
    next(e);
  }
});

// Paciente atualiza seu próprio registro (respostas de cada etapa do checklist)
router.patch('/:id', requireWriteToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};

    const sets = [];
    const values = [];
    let i = 1;

    if (patch.alertAnswers !== undefined) { sets.push(`alert_answers_enc = $${i++}`); values.push(encrypt(JSON.stringify(patch.alertAnswers))); }
    if (patch.alertSummary !== undefined) { sets.push(`alert_summary_enc = $${i++}`); values.push(encrypt(patch.alertSummary)); }
    if (patch.selfAnswers !== undefined) { sets.push(`self_answers_enc = $${i++}`); values.push(encrypt(JSON.stringify(patch.selfAnswers))); }
    if (patch.selfOtherText !== undefined) { sets.push(`self_other_text_enc = $${i++}`); values.push(encrypt(JSON.stringify(patch.selfOtherText))); }
    if (patch.selfScore !== undefined) { sets.push(`self_score = $${i++}`); values.push(patch.selfScore); }
    if (patch.selfCategory !== undefined) { sets.push(`self_category = $${i++}`); values.push(patch.selfCategory); }
    if (patch.observations !== undefined) { sets.push(`observations_enc = $${i++}`); values.push(encrypt(patch.observations)); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

    sets.push('updated_at = now()');
    values.push(id);

    await pool.query(`UPDATE submissions SET ${sets.join(', ')} WHERE id = $${i}`, values);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Direito de acesso do titular (LGPD art. 18, II) — paciente consulta seus próprios dados
router.get('/:id', requireWriteToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Não encontrado.' });
    const r = result.rows[0];
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

// Direito de eliminação do titular (LGPD art. 18, VI) — paciente apaga seus próprios dados
router.delete('/:id', requireWriteToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM submissions WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Histórico de pontuação da Autoavaliação para o próprio paciente (por e-mail + telefone)
router.post('/history', async (req, res, next) => {
  try {
    const { email, phone } = req.body || {};
    if (!email || !phone) return res.status(400).json({ error: 'Informe e-mail e telefone.' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).replace(/\D/g, '');

    const result = await pool.query('SELECT * FROM submissions ORDER BY updated_at ASC');
    const history = result.rows
      .filter((r) => {
        const rowEmail = decrypt(r.email_enc).trim().toLowerCase();
        const rowPhone = decrypt(r.phone_enc).replace(/\D/g, '');
        return rowEmail === normalizedEmail && rowPhone === normalizedPhone;
      })
      .map((r) => ({
        selfScore: r.self_score,
        selfCategory: r.self_category,
        updatedAt: r.updated_at,
      }));

    res.json({ history });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
