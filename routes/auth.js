const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const { db }   = require('../db');
const router   = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function genReferral() {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

function safeUser(u) {
  const { password_hash, reset_code, reset_expires, google_id, ...safe } = u;
  return safe;
}

// ── POST /api/auth/register ─────────────────────────
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, first_name, last_name, phone, country, referral_code } = req.body;
  const hash   = bcrypt.hashSync(password, 12);
  const myCode = genReferral();

  db.run(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, country, referral_code, referred_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [email, hash, first_name, last_name, phone || null, country || null, myCode, referral_code || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
        return res.status(500).json({ error: 'Registration failed' });
      }
      db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err2, user) => {
        const token = makeToken(user);
        res.status(201).json({ token, user: safeUser(user) });
      });
    }
  );
});

// ── POST /api/auth/login ────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);
    const token = makeToken(user);
    res.json({ token, user: safeUser(user) });
  });
});

// ── POST /api/auth/forgot-password ─────────────────
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
    if (user) {
      db.run(`UPDATE users SET reset_code=?, reset_expires=datetime('now','+15 minutes') WHERE id=?`,
        [code, user.id]);
      // TODO: send email with reset code via your email provider
      // sendResetEmail(email, code);
    }
    // Always respond the same to prevent email enumeration
    res.json({ message: 'If that email exists, a reset code has been sent.' });
  });
});

// ── POST /api/auth/reset-password ─────────────────
router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('code').notEmpty(),
  body('new_password').isLength({ min: 6 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, code, new_password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ? AND reset_code = ? AND reset_expires > datetime('now')`,
    [email, code], (err, user) => {
      if (!user) return res.status(400).json({ error: 'Invalid or expired reset code' });
      const hash = bcrypt.hashSync(new_password, 12);
      db.run(`UPDATE users SET password_hash=?, reset_code=NULL, reset_expires=NULL WHERE id=?`,
        [hash, user.id], () => {
          const token = makeToken(user);
          res.json({ message: 'Password reset successfully', token, user: safeUser(user) });
        });
    });
});

// ── Google OAuth ────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?auth=failed' }),
  (req, res) => {
    const token = makeToken(req.user);
    // Redirect to frontend with token in query string — frontend stores it
    res.redirect(`/dashboard.html?token=${token}&user=${encodeURIComponent(JSON.stringify(safeUser(req.user)))}`);
  }
);

module.exports = router;
