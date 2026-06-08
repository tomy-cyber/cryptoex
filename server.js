require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const session    = require('express-session');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const { db, init } = require('./db');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'novatrace_production_secret_change_me';
}
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = '7d';
}

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname)));

// ── Google OAuth Strategy ───────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/api/auth/google/callback`,
  }, (accessToken, refreshToken, profile, done) => {
    const email     = profile.emails?.[0]?.value;
    const googleId  = profile.id;
    const firstName = profile.name?.givenName || '';
    const lastName  = profile.name?.familyName || '';

    if (!email) return done(new Error('No email from Google'));

    db.get(`SELECT * FROM users WHERE email=?`, [email], (err, user) => {
      if (user) {
        // Update google_id if not set
        if (!user.google_id) {
          db.run(`UPDATE users SET google_id=?, last_login=CURRENT_TIMESTAMP WHERE id=?`, [googleId, user.id]);
        } else {
          db.run(`UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?`, [user.id]);
        }
        return done(null, user);
      }
      // Create new user via Google
      const referral = Math.random().toString(36).substring(2, 9).toUpperCase();
      db.run(`INSERT INTO users (email, google_id, first_name, last_name, referral_code, password_hash)
              VALUES (?, ?, ?, ?, ?, '')`,
        [email, googleId, firstName, lastName, referral],
        function(err2) {
          if (err2) return done(err2);
          db.get(`SELECT * FROM users WHERE id=?`, [this.lastID], (_, newUser) => done(null, newUser));
        });
    });
  }));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get(`SELECT * FROM users WHERE id=?`, [id], (err, user) => done(err, user));
});

// ── Routes ─────────────────────────────────────────
app.use('/api/auth',  authRoutes);
app.use('/api/user',  userRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── News proxy (server-side fetch → no CORS issues) ─
// Cache: refresh every 10 minutes
let _newsCache = null;
let _newsCacheTime = 0;
const NEWS_TTL = 10 * 60 * 1000; // 10 min

app.get('/api/news', async (req, res) => {
  try {
    const now = Date.now();
    if (_newsCache && (now - _newsCacheTime) < NEWS_TTL) {
      return res.json(_newsCache);
    }

    // Fetch from multiple CryptoCompare endpoints in parallel
    const urls = [
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest',
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH&sortOrder=latest',
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=DeFi,NFT,Regulation&sortOrder=latest',
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=Mining,Exchange&sortOrder=latest',
    ];

    const results = await Promise.allSettled(
      urls.map(u => fetch(u, { headers: { 'User-Agent': 'NovaTrace/1.0' } }).then(r => r.json()))
    );

    const seen = new Set();
    const merged = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.Data) {
        for (const a of r.value.Data) {
          if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
        }
      }
    }

    merged.sort((a, b) => b.published_on - a.published_on);
    _newsCache = { Data: merged, count: merged.length };
    _newsCacheTime = now;
    res.json(_newsCache);
  } catch(e) {
    console.error('News proxy error:', e.message);
    res.status(502).json({ error: 'Failed to fetch news', Data: [] });
  }
});

// Public config for frontend (wallet address for MetaMask payments)
app.get('/api/config', (req, res) => res.json({
  eth_address:  process.env.ADMIN_ETH_ADDRESS  || null,
  usdt_address: process.env.ADMIN_USDT_ADDRESS || process.env.ADMIN_ETH_ADDRESS || null,
  network: process.env.PAYMENT_NETWORK || 'mainnet',
}));

// ── Init DB then Start ──────────────────────────────
init(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅  NovaTrace server running on port ${PORT}`);
    console.log(`   Frontend: http://localhost:${PORT}/index.html`);
    console.log(`   Admin:    http://localhost:${PORT}/admin.html`);
    console.log(`   API:      http://localhost:${PORT}/api/\n`);
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.log('   ⚠️  Google OAuth disabled — set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in .env\n');
    }
  });
});
