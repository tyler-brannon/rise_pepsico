// Live classroom prediction market: RiseandShine Corp. v. PepsiCo, Inc.
// One market, two outcomes, play money, LMSR automated market maker.

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lawclass';
const B = Number(process.env.LIQUIDITY) || 3000;       // higher = prices move less per dollar
const START_CASH = Number(process.env.START_CASH) || 1000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'state.json');
const SIDES = ['rise', 'pepsi'];
const NAMES = { rise: 'RiseandShine', pepsi: 'PepsiCo' };
const MAX_HISTORY = 800;
const MAX_FEED = 40;

// ---------- LMSR math ----------
function cost(q) {
  const m = Math.max(q.rise, q.pepsi);
  return m + B * Math.log(Math.exp((q.rise - m) / B) + Math.exp((q.pepsi - m) / B));
}
function priceOf(q, side) {
  const other = side === 'rise' ? 'pepsi' : 'rise';
  return 1 / (1 + Math.exp((q[other] - q[side]) / B));
}
// Shares received for spending `spend` dollars on `side`.
function sharesForSpend(q, side, spend) {
  const other = side === 'rise' ? 'pepsi' : 'rise';
  const c0 = cost(q);
  return B * Math.log(Math.expm1((spend + c0 - q[other]) / B)) + q[other] - q[side];
}
// Dollars received for selling `shares` of `side`.
function proceedsForSale(q, side, shares) {
  const after = { ...q, [side]: q[side] - shares };
  return cost(q) - cost(after);
}

// ---------- state ----------
function freshState() {
  return {
    q: { rise: 0, pepsi: 0 },
    open: true,
    users: {},            // token -> { id, name, cash, shares:{rise,pepsi}, trades }
    history: [{ t: Date.now(), p: 0.5 }],
    feed: [],
    volume: 0,
    epoch: crypto.randomBytes(4).toString('hex'), // changes on reset
  };
}

let state = freshState();
try {
  if (fs.existsSync(DATA_FILE)) {
    state = { ...freshState(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    console.log(`Loaded saved market (${Object.keys(state.users).length} traders)`);
  }
} catch (e) {
  console.error('Could not load saved state, starting fresh:', e.message);
}

let saveDirty = false;
function save() { saveDirty = true; }
setInterval(() => {
  if (!saveDirty) return;
  saveDirty = false;
  fs.mkdir(path.dirname(DATA_FILE), { recursive: true }, () => {
    fs.writeFile(DATA_FILE, JSON.stringify(state), (err) => {
      if (err) console.error('Save failed:', err.message);
    });
  });
}, 2000);

const round2 = (n) => Math.round(n * 100) / 100;
const pRise = () => priceOf(state.q, 'rise');

function userValue(u) {
  return u.cash + u.shares.rise * priceOf(state.q, 'rise') + u.shares.pepsi * priceOf(state.q, 'pepsi');
}
function leaderboard() {
  return Object.values(state.users)
    .map((u) => ({ id: u.id, name: u.name, value: round2(userValue(u)), trades: u.trades }))
    .sort((a, b) => b.value - a.value);
}
function publicState() {
  return {
    q: state.q, b: B, startCash: START_CASH, open: state.open,
    price: pRise(), volume: round2(state.volume),
    traders: Object.keys(state.users).length,
    history: state.history, feed: state.feed, epoch: state.epoch,
    names: NAMES, now: Date.now(),
  };
}
function meView(u) {
  return { id: u.id, name: u.name, cash: u.cash, shares: u.shares, trades: u.trades };
}

// ---------- server ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/qr.svg', async (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const url = `${proto}://${req.headers.host}/`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } });
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
});
app.get('/healthz', (_req, res) => res.send('ok'));

// Batched broadcasts so a burst of 50 trades doesn't flood every phone.
let tickDirty = false;
let pendingFeed = [];
let boardDirty = true;
setInterval(() => {
  if (!tickDirty) return;
  tickDirty = false;
  const point = { t: Date.now(), p: pRise() };
  state.history.push(point);
  if (state.history.length > MAX_HISTORY) {
    // thin the older half, keep recent detail
    const keepTail = 200;
    const head = state.history.slice(0, -keepTail).filter((_, i) => i % 2 === 0);
    state.history = head.concat(state.history.slice(-keepTail));
  }
  io.emit('tick', {
    q: state.q, price: point.p, point, open: state.open,
    volume: round2(state.volume), traders: Object.keys(state.users).length,
    feed: pendingFeed, now: point.t,
  });
  pendingFeed = [];
  boardDirty = true;
  save();
}, 300);
setInterval(() => {
  if (!boardDirty) return;
  boardDirty = false;
  io.emit('board', leaderboard());
}, 1500);

function markChanged() { tickDirty = true; }

io.on('connection', (socket) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  socket.emit('state', publicState());
  socket.emit('board', leaderboard());
  if (token && state.users[token]) {
    socket.data.token = token;
    socket.emit('me', meView(state.users[token]));
  } else {
    socket.emit('needName');
  }

  socket.on('join', (msg, ack) => {
    if (typeof ack !== 'function') return;
    const name = String((msg && msg.name) || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (name.length < 2) return ack({ ok: false, error: 'Name must be at least 2 characters.' });
    const taken = Object.values(state.users).some((u) => u.name.toLowerCase() === name.toLowerCase());
    if (taken) return ack({ ok: false, error: 'That name is taken. Try another.' });
    const tok = crypto.randomBytes(16).toString('hex');
    const u = { id: crypto.randomBytes(6).toString('hex'), name, cash: START_CASH, shares: { rise: 0, pepsi: 0 }, trades: 0 };
    state.users[tok] = u;
    socket.data.token = tok;
    markChanged();
    ack({ ok: true, token: tok, me: meView(u) });
  });

  socket.on('trade', (msg, ack) => {
    if (typeof ack !== 'function') return;
    const u = state.users[socket.data.token];
    if (!u) return ack({ ok: false, error: 'Please enter your name first.' });
    if (!state.open) return ack({ ok: false, error: 'Trading is closed.' });
    const now = Date.now();
    if (socket.data.lastTrade && now - socket.data.lastTrade < 250) return ack({ ok: false, error: 'Slow down a moment.' });
    socket.data.lastTrade = now;

    const side = msg && msg.side;
    const action = msg && msg.action;
    let amount = Number(msg && msg.amount);
    if (!SIDES.includes(side) || !['buy', 'sell'].includes(action) || !Number.isFinite(amount) || amount <= 0) {
      return ack({ ok: false, error: 'Invalid trade.' });
    }

    let shares, dollars;
    if (action === 'buy') {
      if (amount > u.cash + 1e-9) return ack({ ok: false, error: 'Not enough cash.' });
      amount = Math.min(amount, u.cash);
      if (amount < 0.01) return ack({ ok: false, error: 'Minimum trade is $0.01.' });
      shares = sharesForSpend(state.q, side, amount);
      if (!Number.isFinite(shares) || shares <= 0) return ack({ ok: false, error: 'Trade failed.' });
      dollars = amount;
      state.q[side] += shares;
      u.cash -= amount;
      if (u.cash < 1e-9) u.cash = 0;
      u.shares[side] += shares;
    } else {
      if (amount > u.shares[side] + 1e-6) return ack({ ok: false, error: "You don't have that many shares." });
      shares = Math.min(amount, u.shares[side]);
      if (shares < 0.01) return ack({ ok: false, error: 'Minimum sale is 0.01 shares.' });
      dollars = proceedsForSale(state.q, side, shares);
      if (!Number.isFinite(dollars) || dollars < 0) return ack({ ok: false, error: 'Trade failed.' });
      state.q[side] -= shares;
      u.shares[side] -= shares;
      if (u.shares[side] < 1e-6) u.shares[side] = 0;
      u.cash += dollars;
    }
    u.trades += 1;
    state.volume += dollars;
    const item = { t: now, name: u.name, side, action, dollars: round2(dollars), p: pRise() };
    state.feed.unshift(item);
    state.feed.length = Math.min(state.feed.length, MAX_FEED);
    pendingFeed.push(item);
    markChanged();
    ack({ ok: true, shares, dollars, me: meView(u) });
  });

  // ----- admin -----
  socket.on('admin', (msg, ack) => {
    if (typeof ack !== 'function') return;
    if (!msg || msg.password !== ADMIN_PASSWORD) return ack({ ok: false, error: 'Wrong password.' });
    switch (msg.action) {
      case 'login':
        break;
      case 'close':
      case 'open':
        state.open = msg.action === 'open';
        markChanged();
        boardDirty = true;
        break;
      case 'remove': {
        const tok = Object.keys(state.users).find((k) => state.users[k].id === msg.id);
        if (!tok) return ack({ ok: false, error: 'User not found.' });
        delete state.users[tok];
        for (const s of io.sockets.sockets.values()) {
          if (s.data.token === tok) { s.data.token = null; s.emit('removed'); }
        }
        markChanged();
        boardDirty = true;
        break;
      }
      case 'reset':
        state = freshState();
        for (const s of io.sockets.sockets.values()) s.data.token = null;
        io.emit('reset');
        io.emit('state', publicState());
        io.emit('board', []);
        save();
        break;
      default:
        return ack({ ok: false, error: 'Unknown action.' });
    }
    ack({ ok: true, open: state.open, traders: Object.keys(state.users).length, volume: round2(state.volume) });
  });
});

server.listen(PORT, () => {
  console.log(`Market running on http://localhost:${PORT}`);
  console.log(`  Students:  /          Projector: /screen          Presenter: /admin`);
  if (!process.env.ADMIN_PASSWORD) console.log(`  Admin password (default): ${ADMIN_PASSWORD}  -- set ADMIN_PASSWORD to change it`);
});
