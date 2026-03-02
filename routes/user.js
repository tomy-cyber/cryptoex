const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db }  = require('../db');
const auth    = require('../middleware/auth');
const router  = express.Router();

function safeUser(u) { const { password_hash, ...s } = u; return s; }

// ── GET /api/user/me ────────────────────────────────
router.get('/me', auth, (req, res) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
  });
});

// ── PUT /api/user/profile ───────────────────────────
router.put('/profile', auth, [
  body('first_name').optional().trim().notEmpty(),
  body('last_name').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('country').optional().trim(),
  body('date_of_birth').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { first_name, last_name, phone, country, date_of_birth } = req.body;
  db.run(
    `UPDATE users SET first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name),
     phone=COALESCE(?,phone), country=COALESCE(?,country), date_of_birth=COALESCE(?,date_of_birth)
     WHERE id=?`,
    [first_name||null, last_name||null, phone||null, country||null, date_of_birth||null, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Update failed' });
      db.get(`SELECT * FROM users WHERE id=?`, [req.user.id], (_, u) => res.json(safeUser(u)));
    }
  );
});

// ── PUT /api/user/change-password ──────────────────
router.put('/change-password', auth, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 6 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { current_password, new_password } = req.body;
  db.get(`SELECT * FROM users WHERE id=?`, [req.user.id], (err, user) => {
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hash = bcrypt.hashSync(new_password, 12);
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, req.user.id], () => {
      res.json({ message: 'Password updated successfully' });
    });
  });
});

// ── POST /api/user/kyc ──────────────────────────────
router.post('/kyc', auth, [
  body('id_number').notEmpty(),
  body('date_of_birth').notEmpty(),
  body('country').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id_number, date_of_birth, country } = req.body;
  db.run(
    `UPDATE users SET id_number=?, date_of_birth=?, country=?, kyc_status='pending' WHERE id=?`,
    [id_number, date_of_birth, country, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'KYC submission failed' });
      // Simulate auto-approval after 2s
      setTimeout(() => {
        db.run(`UPDATE users SET kyc_status='verified' WHERE id=?`, [req.user.id]);
      }, 2000);
      res.json({ message: 'KYC submitted. Verification in progress.' });
    }
  );
});

// ── GET /api/user/balances ──────────────────────────
router.get('/balances', auth, (req, res) => {
  db.all(`SELECT * FROM balances WHERE user_id=?`, [req.user.id], (err, rows) => {
    res.json(rows || []);
  });
});

// ── GET /api/user/balance ─────────────────────────────
router.get('/balance', auth, (req, res) => {
  db.get(`SELECT amount FROM balances WHERE user_id=? AND coin='USDT'`, [req.user.id], (err, row) => {
    res.json({ balance: row ? row.amount : 0 });
  });
});

// ── POST /api/user/order ────────────────────────────
router.post('/order', auth, [
  body('pair').notEmpty(),
  body('side').isIn(['buy','sell']),
  body('amount').isFloat({ gt: 0 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  let { pair, type, side, price, amount } = req.body;
  // Normalize type
  type = type || 'limit';
  const typeMap = { 'limit':'Limit', 'market':'Market', 'stop_limit':'Stop-Limit', 'stop-limit':'Stop-Limit',
                    'Limit':'Limit', 'Market':'Market', 'Stop-Limit':'Stop-Limit' };
  type = typeMap[type] || 'Limit';

  // For market orders, use a simulated price
  if (type === 'Market' && !price) {
    price = amount > 0 ? 1 : 0; // Will be set dynamically below
  }
  const total = (price || 0) * amount;
  const coin  = pair.replace('USDT','');

  if (side === 'buy') {
    db.get(`SELECT amount FROM balances WHERE user_id=? AND coin='USDT'`, [req.user.id], (err, row) => {
      if (!row || row.amount < total) return res.status(400).json({ error: 'Insufficient USDT balance' });
      db.run(`UPDATE balances SET amount=amount-? WHERE user_id=? AND coin='USDT'`, [total, req.user.id]);
      db.run(`INSERT INTO balances (user_id,coin,amount,avg_buy) VALUES (?,?,?,?)
              ON CONFLICT(user_id,coin) DO UPDATE SET
              avg_buy=(avg_buy*amount+?*?)/(amount+?), amount=amount+?`,
        [req.user.id, coin, amount, price, amount, price, amount, amount]);
      saveOrder(req.user.id, pair, type, side, price, amount, total, res);
    });
  } else {
    db.get(`SELECT amount FROM balances WHERE user_id=? AND coin=?`, [req.user.id, coin], (err, row) => {
      if (!row || row.amount < amount) return res.status(400).json({ error: `Insufficient ${coin} balance` });
      db.run(`UPDATE balances SET amount=amount-? WHERE user_id=? AND coin=?`, [amount, req.user.id, coin]);
      db.run(`UPDATE balances SET amount=amount+? WHERE user_id=? AND coin='USDT'`, [total, req.user.id]);
      saveOrder(req.user.id, pair, type, side, price, amount, total, res);
    });
  }
});

function saveOrder(userId, pair, type, side, price, amount, total, res) {
  db.run(
    `INSERT INTO orders (user_id,pair,type,side,price,amount,total) VALUES (?,?,?,?,?,?,?)`,
    [userId, pair, type, side, price, amount, total],
    function(err) {
      if (err) return res.status(500).json({ error: 'Order failed' });
      res.json({ order_id: this.lastID, message: 'Order executed successfully' });
    }
  );
}

// ── GET /api/user/orders ────────────────────────────
router.get('/orders', auth, (req, res) => {
  db.all(`SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [req.user.id], (err, rows) => {
    res.json({ orders: rows || [] });
  });
});

// ── GET /api/user/transactions ──────────────────────
router.get('/transactions', auth, (req, res) => {
  db.all(`SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [req.user.id], (err, rows) => {
    res.json(rows || []);
  });
});

// ── POST /api/user/deposit ──────────────────────────
router.post('/deposit', auth, [
  body('coin').notEmpty(),
  body('amount').isFloat({ gt: 0 }),
], (req, res) => {
  const { coin, amount } = req.body;
  db.run(`INSERT INTO balances (user_id,coin,amount) VALUES (?,?,?)
          ON CONFLICT(user_id,coin) DO UPDATE SET amount=amount+?`,
    [req.user.id, coin, amount, amount]);
  db.run(`INSERT INTO transactions (user_id,type,coin,amount,txid) VALUES (?,?,?,?,?)`,
    [req.user.id, 'deposit', coin, amount, 'DEMO_' + Date.now()], function() {
      res.json({ message: `${amount} ${coin} deposited successfully` });
    });
});

module.exports = router;
