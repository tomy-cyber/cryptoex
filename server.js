require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const db         = require('./db');

// Fallback JWT_SECRET for production if .env is missing
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'cryptoex_production_secret_2026';
}
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = '7d';
}

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serve frontend

// ── Routes ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Init DB then Start ──────────────────────────────
db.init(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅  CryptoEx server running on port ${PORT}`);
    console.log(`   Frontend: http://localhost:${PORT}/index.html`);
    console.log(`   API:      http://localhost:${PORT}/api/\n`);
  });
});
