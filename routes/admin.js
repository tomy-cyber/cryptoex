const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../db');
const auth    = require('../middleware/auth');
const router  = express.Router();

// ── Admin guard middleware ──────────────────────────
function adminOnly(req, res, next) {
  db.get(`SELECT is_admin FROM users WHERE id=?`, [req.user.id], (err, row) => {
    if (!row || !row.is_admin) return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

router.use(auth, adminOnly);

// ── GET /api/admin/users ────────────────────────────
router.get('/users', (req, res) => {
  db.all(`SELECT id, email, first_name, last_name, phone, country, kyc_status, is_admin,
                 created_at, last_login FROM users ORDER BY created_at DESC`, [], (err, rows) => {
    res.json(rows || []);
  });
});

// ── GET /api/admin/users/:id ────────────────────────
router.get('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.get(`SELECT id, email, first_name, last_name, phone, country, date_of_birth,
                 id_number, kyc_status, is_admin, referral_code, created_at, last_login
          FROM users WHERE id=?`, [id], (err, user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.all(`SELECT * FROM balances WHERE user_id=?`, [id], (_, bals) => {
      db.all(`SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [id], (_, txs) => {
        db.all(`SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [id], (_, orders) => {
          db.all(`SELECT * FROM invoices WHERE user_id=? ORDER BY created_at DESC`, [id], (_, invoices) => {
            res.json({ user, balances: bals || [], transactions: txs || [], orders: orders || [], invoices: invoices || [] });
          });
        });
      });
    });
  });
});

// ── PUT /api/admin/users/:id/balance ───────────────
// Set a user's coin balance to an exact amount
router.put('/users/:id/balance', [
  body('coin').notEmpty().trim().toUpperCase(),
  body('amount').isFloat({ min: 0 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = parseInt(req.params.id);
  const { coin, amount, avg_buy } = req.body;

  db.run(`INSERT INTO balances (user_id, coin, amount, avg_buy) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, coin) DO UPDATE SET amount=excluded.amount, avg_buy=COALESCE(excluded.avg_buy, avg_buy)`,
    [id, coin, amount, avg_buy || 0], function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update balance' });
      res.json({ message: `Balance set: ${amount} ${coin}` });
    });
});

// ── POST /api/admin/users/:id/transaction ──────────
// Create a manual transaction (deposit/withdraw/profit/adjustment)
router.post('/users/:id/transaction', [
  body('type').isIn(['deposit', 'withdraw', 'profit', 'adjustment']),
  body('coin').notEmpty().trim().toUpperCase(),
  body('amount').isFloat({ gt: 0 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = parseInt(req.params.id);
  const { type, coin, amount, note, status } = req.body;
  const txStatus = status || 'completed';
  const txid = 'ADM_' + Date.now();

  // Adjust balance for deposits, profits, and withdrawals
  if (type === 'deposit' || type === 'profit') {
    db.run(`INSERT INTO balances (user_id, coin, amount) VALUES (?, ?, ?)
            ON CONFLICT(user_id, coin) DO UPDATE SET amount=amount+?`,
      [id, coin, amount, amount]);
  } else if (type === 'withdraw') {
    db.run(`UPDATE balances SET amount=MAX(0, amount-?) WHERE user_id=? AND coin=?`,
      [amount, id, coin]);
  }

  db.run(`INSERT INTO transactions (user_id, type, coin, amount, status, txid, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, coin, amount, txStatus, txid, note || null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create transaction' });
      res.json({ transaction_id: this.lastID, txid, message: 'Transaction created' });
    });
});

// ── POST /api/admin/invoices ────────────────────────
router.post('/invoices', [
  body('user_id').isInt({ gt: 0 }),
  body('amount').isFloat({ gt: 0 }),
  body('coin').notEmpty().trim().toUpperCase(),
  body('description').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { user_id, amount, coin, description } = req.body;

  // Check user exists
  db.get(`SELECT id FROM users WHERE id=?`, [user_id], (err, user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate invoice number: INV-YYYYMMDD-XXXX
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand  = Math.floor(1000 + Math.random() * 9000);
    const number = `INV-${today}-${rand}`;

    db.run(`INSERT INTO invoices (user_id, number, amount, coin, description) VALUES (?, ?, ?, ?, ?)`,
      [user_id, number, amount, coin, description || null],
      function(err2) {
        if (err2) return res.status(500).json({ error: 'Failed to create invoice' });
        res.json({ invoice_id: this.lastID, number, message: 'Invoice created' });
      });
  });
});

// ── GET /api/admin/invoices ─────────────────────────
router.get('/invoices', (req, res) => {
  db.all(`SELECT i.*, u.email, u.first_name, u.last_name
          FROM invoices i JOIN users u ON i.user_id=u.id
          ORDER BY i.created_at DESC`, [], (err, rows) => {
    res.json(rows || []);
  });
});

// ── PUT /api/admin/invoices/:id/status ──────────────
router.put('/invoices/:id/status', [
  body('status').isIn(['pending', 'paid', 'cancelled']),
], (req, res) => {
  const { status } = req.body;
  const paidAt = status === 'paid' ? `datetime('now')` : 'NULL';
  db.run(`UPDATE invoices SET status=?, paid_at=${paidAt} WHERE id=?`,
    [status, req.params.id], function(err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Invoice not found' });
      res.json({ message: 'Invoice updated' });
    });
});

// ── PUT /api/admin/users/:id/kyc ───────────────────
router.put('/users/:id/kyc', [
  body('kyc_status').isIn(['unverified', 'pending', 'verified', 'rejected']),
], (req, res) => {
  const { kyc_status } = req.body;
  db.run(`UPDATE users SET kyc_status=? WHERE id=?`, [kyc_status, req.params.id], function(err) {
    if (err || this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'KYC status updated' });
  });
});

// ── PUT /api/admin/users/:id/admin ─────────────────
router.put('/users/:id/admin', [
  body('is_admin').isBoolean(),
], (req, res) => {
  const is_admin = req.body.is_admin ? 1 : 0;
  db.run(`UPDATE users SET is_admin=? WHERE id=?`, [is_admin, req.params.id], function(err) {
    if (err || this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Admin status updated' });
  });
});

// ── DELETE /api/admin/users/:id ────────────────────
router.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  // Prevent self-delete
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  db.run(`DELETE FROM users WHERE id=?`, [id], function(err) {
    if (err || this.changes === 0) return res.status(404).json({ error: 'User not found' });
    db.run(`DELETE FROM balances WHERE user_id=?`, [id]);
    db.run(`DELETE FROM orders WHERE user_id=?`, [id]);
    db.run(`DELETE FROM transactions WHERE user_id=?`, [id]);
    db.run(`DELETE FROM invoices WHERE user_id=?`, [id]);
    res.json({ message: 'User deleted' });
  });
});

// ── GET /api/admin/stats ────────────────────────────
router.get('/stats', (req, res) => {
  db.get(`SELECT COUNT(*) as total_users FROM users WHERE is_admin=0`, [], (_, r1) => {
    db.get(`SELECT COUNT(*) as total_transactions FROM transactions`, [], (_, r2) => {
      db.get(`SELECT COUNT(*) as total_invoices, SUM(amount) as invoice_total FROM invoices WHERE status='paid'`, [], (_, r3) => {
        db.get(`SELECT COUNT(*) as pending_kyc FROM users WHERE kyc_status='pending'`, [], (_, r4) => {
          res.json({
            total_users: r1?.total_users || 0,
            total_transactions: r2?.total_transactions || 0,
            paid_invoices: r3?.total_invoices || 0,
            invoice_revenue: r3?.invoice_total || 0,
            pending_kyc: r4?.pending_kyc || 0,
          });
        });
      });
    });
  });
});

// ── GET /api/admin/pending-deposits ────────────────
// All pending MetaMask deposits awaiting verification
router.get('/pending-deposits', (req, res) => {
  db.all(`SELECT t.*, u.email, u.first_name, u.last_name
          FROM transactions t JOIN users u ON t.user_id=u.id
          WHERE t.status='pending' AND t.type='deposit'
          ORDER BY t.created_at DESC`, [], (err, rows) => {
    res.json(rows || []);
  });
});

// ── PUT /api/admin/transactions/:id/confirm ─────────
// Confirm a pending deposit — credits the user's balance
router.put('/transactions/:id/confirm', (req, res) => {
  const id = parseInt(req.params.id);
  db.get(`SELECT * FROM transactions WHERE id=? AND status='pending'`, [id], (err, tx) => {
    if (!tx) return res.status(404).json({ error: 'Pending transaction not found' });
    db.run(`INSERT INTO balances (user_id,coin,amount) VALUES (?,?,?)
            ON CONFLICT(user_id,coin) DO UPDATE SET amount=amount+?`,
      [tx.user_id, tx.coin, tx.amount, tx.amount]);
    db.run(`UPDATE transactions SET status='completed' WHERE id=?`, [id], function(e) {
      if (e) return res.status(500).json({ error: 'Failed to confirm' });
      res.json({ message: 'Deposit confirmed and balance credited' });
    });
  });
});

// ── PUT /api/admin/transactions/:id/reject ──────────
router.put('/transactions/:id/reject', (req, res) => {
  db.run(`UPDATE transactions SET status='failed' WHERE id=? AND status='pending'`,
    [req.params.id], function(err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
      res.json({ message: 'Transaction rejected' });
    });
});

module.exports = router;
