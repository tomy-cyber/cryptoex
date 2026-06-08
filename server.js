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

// ── News proxy — RSS2JSON (no API key needed) ──
// Aggregates 10 free crypto RSS feeds, caches 15 min
let _newsCache     = null;
let _newsCacheTime = 0;
const NEWS_TTL = 15 * 60 * 1000;

const RSS_FEEDS = [
  { url: 'https://cointelegraph.com/rss',                    name: 'CoinTelegraph',  cat: 'Bitcoin' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk',       cat: 'Bitcoin' },
  { url: 'https://decrypt.co/feed',                         name: 'Decrypt',        cat: 'Ethereum' },
  { url: 'https://www.newsbtc.com/feed/',                   name: 'NewsBTC',        cat: 'Bitcoin' },
  { url: 'https://cryptoslate.com/feed/',                   name: 'CryptoSlate',    cat: 'DeFi' },
  { url: 'https://bitcoinmagazine.com/feed',                name: 'Bitcoin Magazine', cat: 'Bitcoin' },
  { url: 'https://beincrypto.com/feed/',                    name: 'BeInCrypto',     cat: 'Regulation' },
  { url: 'https://cryptopotato.com/feed/',                  name: 'CryptoPotato',   cat: 'Exchange' },
  { url: 'https://bitcoinist.com/feed/',                    name: 'Bitcoinist',     cat: 'Mining' },
  { url: 'https://ambcrypto.com/feed/',                     name: 'AMBCrypto',      cat: 'NFT' },
  { url: 'https://utoday.one/rss',                          name: 'U.Today',        cat: 'Ethereum' },
  { url: 'https://cryptobriefing.com/feed/',                name: 'Crypto Briefing', cat: 'DeFi' },
];

// Simple RSS XML parser (no external library needed)
function parseRSS(xml, feedMeta) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const mm = r.exec(block);
      return mm ? mm[1].trim() : '';
    };
    const getAttr = (tag, attr) => {
      const r = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, 'i');
      const mm = r.exec(block);
      return mm ? mm[1].trim() : '';
    };

    const title     = get('title');
    const link      = get('link') || getAttr('link', 'href');
    const pubDate   = get('pubDate') || get('dc:date');
    const desc      = get('description');
    const content   = get('content:encoded') || desc;
    const encUrl    = getAttr('enclosure', 'url');
    const mediaUrl  = getAttr('media:thumbnail', 'url') || getAttr('media:content', 'url');
    // Extract first <img src=...> from content as fallback thumbnail
    const imgInContent = /<img[^>]+src=["']([^"']+)["']/i.exec(content);
    const imageurl  = encUrl || mediaUrl || (imgInContent ? imgInContent[1] : '');

    if (!title || !link) continue;

    const ts = pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
    // Stable numeric id from link hash
    let id = 0;
    for (let i = 0; i < link.length; i++) id = (Math.imul(31, id) + link.charCodeAt(i)) | 0;
    id = Math.abs(id);

    // Strip HTML from description
    const bodyText = (content || desc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);

    items.push({
      id,
      title,
      url: link,
      imageurl,
      body: bodyText,
      published_on: ts,
      source: feedMeta.name,
      source_info: { name: feedMeta.name },
      categories: feedMeta.cat,
    });
  }
  return items;
}

app.get('/api/news', async (req, res) => {
  try {
    const now = Date.now();
    if (_newsCache && (now - _newsCacheTime) < NEWS_TTL) {
      return res.json(_newsCache);
    }

    const results = await Promise.allSettled(
      RSS_FEEDS.map(f =>
        fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}&count=20`, {
          headers: { 'User-Agent': 'NovaTrace/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        .then(r => r.json())
        .then(data => {
          if (data.status !== 'ok' || !data.items?.length) {
            // Fallback: fetch raw RSS and parse manually
            return fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })
              .then(r => r.text())
              .then(xml => ({ _raw: true, items: parseRSS(xml, f), feed: f }));
          }
          // Normalise rss2json format
          return {
            items: data.items.map((item, idx) => {
              let id = 0;
              const lnk = item.link || '';
              for (let i = 0; i < lnk.length; i++) id = (Math.imul(31, id) + lnk.charCodeAt(i)) | 0;
              id = Math.abs(id) + idx;
              const bodyText = (item.content || item.description || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200);
              return {
                id,
                title: item.title || '',
                url: item.link || '',
                imageurl: item.thumbnail || item.enclosure?.link || '',
                body: bodyText,
                published_on: item.pubDate ? Math.floor(new Date(item.pubDate).getTime()/1000) : Math.floor(Date.now()/1000),
                source: f.name,
                source_info: { name: f.name },
                categories: f.cat,
              };
            })
          };
        })
      )
    );

    const seen = new Set();
    const merged = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.items) {
        for (const a of r.value.items) {
          if (a.title && !seen.has(a.id)) { seen.add(a.id); merged.push(a); }
        }
      }
    }

    merged.sort((a, b) => b.published_on - a.published_on);
    console.log(`[News] Fetched ${merged.length} articles from ${results.filter(r=>r.status==='fulfilled').length}/${RSS_FEEDS.length} feeds`);

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
