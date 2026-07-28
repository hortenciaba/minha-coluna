const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { hashToken } = require('../crypto');

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// Confere se o token enviado corresponde ao registro que o paciente está tentando acessar/alterar
async function requireWriteToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token de acesso ausente.' });

  const { id } = req.params;
  try {
    const result = await pool.query('SELECT write_token_hash FROM submissions WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Registro não encontrado.' });
    if (result.rows[0].write_token_hash !== hashToken(token)) {
      return res.status(403).json({ error: 'Token inválido para este registro.' });
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireAdmin, requireWriteToken };
