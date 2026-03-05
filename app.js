/* ============================================================
   CryptoEx – Main Application JS
   ============================================================ */
const API = '/api';

// ── Coin Data with real icons ────────────────────────────────
const ICON_CDN = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color';
const COINS = [
  { id:'BTC',  name:'Bitcoin',   price:67432,  change:2.34,  cap:'$1.33T', vol:'$38.2B', color:'#f7931a', icon:`${ICON_CDN}/btc.png`,  new:false },
  { id:'ETH',  name:'Ethereum',  price:3521,   change:1.87,  cap:'$423B',  vol:'$18.1B', color:'#627eea', icon:`${ICON_CDN}/eth.png`,  new:false },
  { id:'BNB',  name:'BNB',       price:412,    change:-0.52, cap:'$63B',   vol:'$2.1B',  color:'#f0b90b', icon:`${ICON_CDN}/bnb.png`,  new:false },
  { id:'SOL',  name:'Solana',    price:178,    change:4.12,  cap:'$82B',   vol:'$5.4B',  color:'#9945ff', icon:`${ICON_CDN}/sol.png`,  new:false },
  { id:'XRP',  name:'XRP',       price:0.617,  change:-1.23, cap:'$34B',   vol:'$1.8B',  color:'#00aae4', icon:`${ICON_CDN}/xrp.png`,  new:false },
  { id:'ADA',  name:'Cardano',   price:0.487,  change:3.21,  cap:'$17B',   vol:'$0.9B',  color:'#0033ad', icon:`${ICON_CDN}/ada.png`,  new:false },
  { id:'DOGE', name:'Dogecoin',  price:0.141,  change:-2.88, cap:'$20B',   vol:'$1.2B',  color:'#c2a633', icon:`${ICON_CDN}/doge.png`, new:false },
  { id:'DOT',  name:'Polkadot',  price:8.23,   change:0.94,  cap:'$11B',   vol:'$0.6B',  color:'#e6007a', icon:`${ICON_CDN}/dot.png`,  new:true  },
  { id:'AVAX', name:'Avalanche', price:36.4,   change:5.67,  cap:'$15B',   vol:'$0.8B',  color:'#e84142', icon:`${ICON_CDN}/avax.png`, new:true  },
  { id:'LINK', name:'Chainlink', price:18.72,  change:2.11,  cap:'$11B',   vol:'$0.7B',  color:'#2a5ada', icon:`${ICON_CDN}/link.png`, new:false },
  { id:'MATIC',name:'Polygon',   price:0.92,   change:-0.34, cap:'$9B',    vol:'$0.5B',  color:'#8247e5', icon:`${ICON_CDN}/matic.png`,new:false },
  { id:'UNI',  name:'Uniswap',   price:11.34,  change:1.44,  cap:'$7B',    vol:'$0.4B',  color:'#ff007a', icon:`${ICON_CDN}/uni.png`,  new:false },
];
// Helper: get coin icon HTML
function coinIcon(c, size=32) {
  return `<img src="${c.icon}" alt="${c.id}" width="${size}" height="${size}" style="border-radius:50%" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><span class="coin-logo-fallback" style="display:none;width:${size}px;height:${size}px;border-radius:50%;background:${c.color}22;border:1.5px solid ${c.color}44;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(size*0.34)}px;color:${c.color}">${c.id.slice(0,3)}</span>`;
}

const liveData = {};
COINS.forEach(c => { liveData[c.id] = { price: c.price, change: c.change }; });

// ── Utils ────────────────────────────────────────────────────
function randBetween(min, max) { return Math.random() * (max - min) + min; }
function jitter(price) { return parseFloat((price * (1 + randBetween(-0.003, 0.003))).toPrecision(6)); }

function fmtPrice(p) {
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  if (p >= 1)    return '$' + p.toFixed(3);
  return '$' + p.toFixed(4);
}
function fmtChange(c) { return (c >= 0 ? '+' : '') + c.toFixed(2) + '%'; }

function genSparkData(base, points = 20) {
  const arr = [base];
  for (let i = 1; i < points; i++) arr.push(parseFloat((arr[i-1]*(1+randBetween(-0.015,0.015))).toPrecision(6)));
  return arr;
}

function makeSparkline(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas, {
    type:'line',
    data:{ labels:data.map((_,i)=>i), datasets:[{ data, borderColor:color, borderWidth:1.5, pointRadius:0, tension:0.4, fill:true, backgroundColor:color+'18' }] },
    options:{ responsive:true, animation:false, plugins:{legend:{display:false},tooltip:{enabled:false}}, scales:{x:{display:false},y:{display:false}} }
  });
}

// ── Ticker ───────────────────────────────────────────────────
function buildTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const all = [...COINS,...COINS];
  track.innerHTML = all.map(c => {
    const cls = c.change >= 0 ? 'positive' : 'negative';
    return `<div class="ticker-item">
      <span class="t-symbol">${c.id}/USDT</span>
      <span class="t-price" id="tick-${c.id}-${all.indexOf(c)}">${fmtPrice(c.price)}</span>
      <span class="t-change ${cls}" id="tick-chg-${c.id}-${all.indexOf(c)}">${fmtChange(c.change)}</span>
    </div>`;
  }).join('');
}

// ── Live Price Simulation ────────────────────────────────────
function updatePrices() {
  COINS.forEach(c => {
    const prev   = liveData[c.id].price;
    const next   = jitter(prev);
    const chg    = parseFloat((liveData[c.id].change + randBetween(-0.05,0.05)).toFixed(2));
    liveData[c.id] = { price:next, change:chg };
    const cls    = chg >= 0 ? 'positive' : 'negative';
    const flash  = next > prev ? '#0ecb8155' : '#f6465d55';

    // ticker (both copies)
    for (let i=0; i<24; i++) {
      const pe = document.getElementById(`tick-${c.id}-${i}`);
      const ce = document.getElementById(`tick-chg-${c.id}-${i}`);
      if (pe) { pe.textContent=fmtPrice(next); pe.style.color=next>prev?'var(--green)':'var(--red)'; setTimeout(()=>pe.style.color='',500); }
      if (ce) { ce.textContent=fmtChange(chg); ce.className=`t-change ${cls}`; }
    }

    // home table
    const ht_p = document.getElementById(`ht-price-${c.id}`);
    const ht_c = document.getElementById(`ht-change-${c.id}`);
    if (ht_p) { ht_p.textContent=fmtPrice(next); ht_p.style.color=next>prev?'var(--green)':'var(--red)'; setTimeout(()=>ht_p.style.color='',500); }
    if (ht_c) { ht_c.textContent=fmtChange(chg); ht_c.className=cls; }

    // markets page table
    const mp_p = document.getElementById(`mp-price-${c.id}`);
    const mp_c = document.getElementById(`mp-change-${c.id}`);
    if (mp_p) { mp_p.textContent=fmtPrice(next); mp_p.style.color=next>prev?'var(--green)':'var(--red)'; setTimeout(()=>mp_p.style.color='',500); }
    if (mp_c) { mp_c.textContent=fmtChange(chg); mp_c.className=cls; }

    // hero BTC
    if (c.id === 'BTC') {
      const hp = document.getElementById('heroBtcPrice');
      const hc = document.getElementById('heroBtcChange');
      if (hp) hp.textContent = fmtPrice(next);
      if (hc) { hc.textContent = fmtChange(chg) + (chg>=0?' ▲':' ▼'); hc.className='price-change '+(chg>=0?'positive':'negative'); }
      if (heroChartInst) { heroData.push(next); heroData.shift(); heroChartInst.data.datasets[0].data=[...heroData]; heroChartInst.update('none'); }
    }

    // trade page
    const tPrice = document.getElementById('tradeCurrentPrice');
    const tChg   = document.getElementById('tradeChangeEl');
    const tPair  = document.getElementById('activeTradePair');
    if (tPair && tPrice && tChg && tPair.dataset.id === c.id) {
      tPrice.textContent = fmtPrice(next);
      tPrice.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
      tChg.textContent = fmtChange(chg);
      tChg.className = chg >= 0 ? 'positive' : 'negative';
    }
  });
}

// ── Hero Chart ───────────────────────────────────────────────
let heroChartInst = null;
const heroData    = genSparkData(67432, 50);
function buildHeroChart() {
  const canvas = document.getElementById('heroChart');
  if (!canvas) return;
  heroChartInst = new Chart(canvas, {
    type:'line',
    data:{ labels:heroData.map((_,i)=>i), datasets:[{
      data:heroData, borderColor:'#0ecb81', borderWidth:2, pointRadius:0, tension:0.4, fill:true,
      backgroundColor:(ctx)=>{ const g=ctx.chart.ctx.createLinearGradient(0,0,0,80); g.addColorStop(0,'rgba(14,203,129,0.3)'); g.addColorStop(1,'rgba(14,203,129,0)'); return g; }
    }]},
    options:{ responsive:true, animation:false, plugins:{legend:{display:false},tooltip:{enabled:false}}, scales:{x:{display:false},y:{display:false}} }
  });
}

// ── Earn Donut ───────────────────────────────────────────────
function buildEarnChart() {
  const canvas = document.getElementById('earnChart');
  if (!canvas) return;
  new Chart(canvas, {
    type:'doughnut',
    data:{ labels:['Savings','Staking','Liquidity','Yield Farm'],
      datasets:[{ data:[35,30,20,15], backgroundColor:['#f0b90b','#0ecb81','#1890ff','#8b5cf6'], borderWidth:0, hoverOffset:8 }] },
    options:{ responsive:true, plugins:{ legend:{display:true,position:'right',labels:{color:'#848e9c',font:{size:12},padding:16,boxWidth:12}},
      tooltip:{ callbacks:{ label:ctx=>` ${ctx.label}: ${ctx.parsed}%` } } }, cutout:'70%' }
  });
}

// ── Home Market Table ─────────────────────────────────────────
const sparkCharts = {};
function buildHomeTable(filter='all') {
  const tbody = document.getElementById('homeMarketBody');
  if (!tbody) return;
  let coins = [...COINS];
  if (filter==='gainers') coins=coins.filter(c=>c.change>0).sort((a,b)=>b.change-a.change);
  if (filter==='losers')  coins=coins.filter(c=>c.change<0).sort((a,b)=>a.change-b.change);
  if (filter==='new')     coins=coins.filter(c=>c.new);

  tbody.innerHTML = coins.slice(0,8).map((c,i) => {
    const cls = c.change>=0?'positive':'negative';
    return `<tr>
      <td style="color:var(--text2)">${i+1}</td>
      <td><div class="coin-name-cell">
        <div class="coin-logo">${coinIcon(c, 34)}</div>
        <div><div class="coin-symbol">${c.id}${c.new?'<span class="badge-new">NEW</span>':''}</div><div class="coin-full">${c.name}</div></div>
      </div></td>
      <td id="ht-price-${c.id}" style="font-weight:700">${fmtPrice(c.price)}</td>
      <td class="${cls}" id="ht-change-${c.id}">${fmtChange(c.change)}</td>
      <td style="color:var(--text2)">${c.cap}</td>
      <td style="color:var(--text2)">${c.vol}</td>
      <td><canvas id="spark-${c.id}" width="100" height="34"></canvas></td>
      <td><button class="trade-btn" onclick="location.href='trade.html?pair=${c.id}USDT'">Trade</button></td>
    </tr>`;
  }).join('');

  coins.slice(0,8).forEach(c => {
    const color = c.change>=0 ? '#0ecb81' : '#f6465d';
    if (sparkCharts[c.id]) sparkCharts[c.id].destroy();
    sparkCharts[c.id] = makeSparkline(`spark-${c.id}`, genSparkData(c.price), color);
  });
}
function filterTable(filter, btn) {
  document.querySelectorAll('.table-tabs .tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  buildHomeTable(filter);
}

// ── Modal Helpers ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function closeModalOutside(e, id) { if (e.target.id===id) closeModal(id); }
function switchModal(close, open) { closeModal(close); openModal(open); }

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  if (!t) return;
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  const iconEl = t.querySelector('.toast-icon');
  const msgEl  = t.querySelector('.toast-msg');
  if (iconEl) { iconEl.className = `toast-icon fa ${icons[type]||icons.success}`; }
  if (msgEl)  { msgEl.textContent = msg; }
  else        { t.textContent = msg; }
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 4000);
}

// ── Auth (connected to real backend) ─────────────────────────
function getToken() { return localStorage.getItem('cx_token'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('cx_user')||'null'); } catch { return null; } }

function updateNavForUser() {
  const user = getUser();
  if (!user) return;
  const loginBtn    = document.getElementById('navLoginBtn');
  const registerBtn = document.getElementById('navRegisterBtn');
  const userMenu    = document.getElementById('navUserMenu');
  const navNameEl   = document.getElementById('navUserName');
  const navAvEl     = document.getElementById('navUserAvatar');
  if (loginBtn)    loginBtn.style.display    = 'none';
  if (registerBtn) registerBtn.style.display = 'none';
  if (userMenu)    userMenu.style.display    = 'flex';
  if (navNameEl)   navNameEl.textContent     = user.first_name || user.email?.split('@')[0];
  if (navAvEl)     navAvEl.textContent       = (user.first_name||user.email||'?')[0].toUpperCase();
}

async function doRegister() {
  const first  = document.getElementById('reg_first')?.value.trim();
  const last   = document.getElementById('reg_last')?.value.trim();
  const email  = document.getElementById('reg_email')?.value.trim();
  const pass   = document.getElementById('reg_pass')?.value;
  const ref    = document.getElementById('reg_ref')?.value.trim();
  const terms  = document.getElementById('reg_terms')?.checked;

  if (!first || !last)  { showToast('First and last name are required','error'); return; }
  if (!email)           { showToast('Email is required','error'); return; }
  if (!pass||pass.length<6) { showToast('Password must be at least 6 characters','error'); return; }
  if (!terms)           { showToast('Please accept the Terms of Service','error'); return; }

  const btn = document.getElementById('regSubmitBtn');
  if (btn) { btn.disabled=true; btn.textContent='Creating account…'; }

  try {
    const res  = await fetch(`${API}/auth/register`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ first_name:first, last_name:last, email, password:pass, referral_code:ref||undefined })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.errors?.[0]?.msg || data.error || 'Registration failed');
    localStorage.setItem('cx_token', data.token);
    localStorage.setItem('cx_user',  JSON.stringify(data.user));
    closeModal('registerModal');
    showToast(`✓ Welcome, ${data.user.first_name}! Account created.`, 'success');
    updateNavForUser();
    setTimeout(() => location.href='dashboard.html', 1200);
  } catch(e) {
    showToast(e.message || 'Registration failed', 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='Create Account'; }
  }
}

async function doLogin() {
  const email = document.getElementById('login_email')?.value.trim();
  const pass  = document.getElementById('login_pass')?.value;
  if (!email || !pass) { showToast('Please fill in all fields','error'); return; }

  const btn = document.getElementById('loginSubmitBtn');
  if (btn) { btn.disabled=true; btn.textContent='Logging in…'; }

  try {
    const res  = await fetch(`${API}/auth/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password:pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid credentials');
    localStorage.setItem('cx_token', data.token);
    localStorage.setItem('cx_user',  JSON.stringify(data.user));
    closeModal('loginModal');
    showToast(`✓ Welcome back, ${data.user.first_name||'Trader'}!`, 'success');
    updateNavForUser();
    setTimeout(() => location.href='dashboard.html', 1000);
  } catch(e) {
    showToast(e.message || 'Login failed', 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='Log In'; }
  }
}

function doLogout() {
  localStorage.removeItem('cx_token');
  localStorage.removeItem('cx_user');
  location.href='index.html';
}

// ── Forgot Password Flow ──────────────────────────────────────
let _resetEmail = '';
let _resetCode  = '';

async function doForgotPassword() {
  const email = document.getElementById('forgot_email')?.value.trim();
  if (!email) { showToast('Please enter your email address','error'); return; }

  const btn = document.getElementById('forgotSubmitBtn');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Sending...'; }

  try {
    const res = await fetch(`${API}/auth/forgot-password`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    _resetEmail = email;
    // In demo mode, the backend returns the code
    if (data.demo_code) {
      _resetCode = data.demo_code;
      showToast(`Demo: Your reset code is ${data.demo_code}`, 'info');
    } else {
      showToast('Reset code sent! Check your email.', 'success');
    }
    // Switch to reset code view
    switchModal('forgotModal','resetModal');
    const codeHint = document.getElementById('resetCodeHint');
    if (codeHint && data.demo_code) codeHint.textContent = `Demo code: ${data.demo_code}`;
  } catch(e) {
    showToast(e.message || 'Failed to send reset code', 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Send Reset Code'; }
  }
}

async function doResetPassword() {
  const code    = document.getElementById('reset_code')?.value.trim();
  const newPass = document.getElementById('reset_pass')?.value;
  if (!code)    { showToast('Please enter the reset code','error'); return; }
  if (!newPass || newPass.length<6) { showToast('Password must be at least 6 characters','error'); return; }

  const btn = document.getElementById('resetSubmitBtn');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Resetting...'; }

  try {
    const res = await fetch(`${API}/auth/reset-password`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:_resetEmail, code, new_password:newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reset failed');
    // Auto-login after reset
    if (data.token) {
      localStorage.setItem('cx_token', data.token);
      localStorage.setItem('cx_user',  JSON.stringify(data.user));
    }
    closeModal('resetModal');
    showToast('Password reset successfully! You are now logged in.', 'success');
    updateNavForUser();
    setTimeout(() => location.href='dashboard.html', 1200);
  } catch(e) {
    showToast(e.message || 'Reset failed', 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa fa-key"></i> Reset Password'; }
  }
}

// password strength indicator on register
function checkRegPwd(val) {
  const bar = document.getElementById('regPwdBar');
  if (!bar) return;
  let score=0;
  if (val.length>=6) score++;
  if (val.length>=10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const cols=['','var(--red)','var(--rgb-orange)','var(--yellow)','var(--green)','var(--rgb-cyan)'];
  bar.style.width=(score*20)+'%'; bar.style.background=cols[score]||cols[1];
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildTicker();
  buildHeroChart();
  buildEarnChart();
  buildHomeTable();
  updateNavForUser();
  setInterval(updatePrices, 1500);
});
