const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const DB_PATH = process.env.DB_PATH || './database.db';
const db      = new sqlite3.Database(path.resolve(DB_PATH));

function init(cb) {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      first_name    TEXT,
      last_name     TEXT,
      phone         TEXT,
      country       TEXT,
      date_of_birth TEXT,
      id_number     TEXT,
      avatar        TEXT    DEFAULT 'default',
      kyc_status    TEXT    DEFAULT 'unverified',
      two_fa        INTEGER DEFAULT 0,
      referral_code  TEXT,
      referred_by    TEXT,
      reset_code     TEXT,
      reset_expires  DATETIME,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login     DATETIME
    )`);

    // Portfolio / balances table
    db.run(`CREATE TABLE IF NOT EXISTS balances (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  INTEGER NOT NULL,
      coin     TEXT    NOT NULL,
      amount   REAL    DEFAULT 0,
      avg_buy  REAL    DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, coin)
    )`);

    // Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      pair       TEXT    NOT NULL,
      type       TEXT    NOT NULL,
      side       TEXT    NOT NULL,
      price      REAL    NOT NULL,
      amount     REAL    NOT NULL,
      total      REAL    NOT NULL,
      status     TEXT    DEFAULT 'filled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Transactions table
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      type       TEXT    NOT NULL,
      coin       TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      status     TEXT    DEFAULT 'completed',
      txid       TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, cb);
  });
}

module.exports = { db, init };
