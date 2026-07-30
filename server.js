require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const submissionsRouter = require('./routes/submissions');
const adminRouter = require('./routes/admin');
const checkinsRouter = require('./routes/checkins');
const { initDb } = require('./db');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '200kb' }));

// CORS — restrinja ao domínio real do seu app em produção (variável ALLOWED_ORIGIN)
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin === '*' ? true : allowedOrigin.split(',').map((s) => s.trim()),
  credentials: true,
}));

// Limite geral de requisições, para reduzir abuso da API
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(generalLimiter);

// Limite mais rígido especificamente no login de administrador (força bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
});
app.use('/api/admin/login', loginLimiter);

app.use('/api/submissions', submissionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/checkins', checkinsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Tratamento genérico de erros não capturados nas rotas
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
  })
  .catch((err) => {
    console.error('Erro ao iniciar banco de dados:', err);
    process.exit(1);
  });
