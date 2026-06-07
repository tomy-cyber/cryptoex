const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const DB_PATH = process.env.DB_PATH || './database.db';
const db      = new sqlite3.Database(path.resolve(DB_PATH));

function init(cb) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    UNIQUE NOT NULL,
      password_hash TEXT,
      first_name    TEXT,
      last_name     TEXT,
      phone         TEXT,
      country       TEXT,
      date_of_birth TEXT,
      id_number     TEXT,
      avatar        TEXT    DEFAULT 'default',
      kyc_status    TEXT    DEFAULT 'unverified',
      two_fa        INTEGER DEFAULT 0,
      is_admin      INTEGER DEFAULT 0,
      google_id     TEXT,
      referral_code TEXT,
      referred_by   TEXT,
      reset_code    TEXT,
      reset_expires DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login    DATETIME
    )`);

    // Migrate: add columns if upgrading from old schema
    db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS balances (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  INTEGER NOT NULL,
      coin     TEXT    NOT NULL,
      amount   REAL    DEFAULT 0,
      avg_buy  REAL    DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, coin)
    )`);

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

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      type       TEXT    NOT NULL,
      coin       TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      status     TEXT    DEFAULT 'completed',
      txid       TEXT,
      note       TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Migrate: add note column if upgrading
    db.run(`ALTER TABLE transactions ADD COLUMN note TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS invoices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      number      TEXT    NOT NULL,
      amount      REAL    NOT NULL,
      coin        TEXT    NOT NULL,
      description TEXT,
      status      TEXT    DEFAULT 'pending',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at     DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, cb);
  });
}

module.exports = { db, init };
