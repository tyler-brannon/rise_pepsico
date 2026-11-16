(function () {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'rp_token';

  const S = {
    q: { rise: 0, pepsi: 0 }, b: 3000, startCash: 1000, open: true, price: 0.5,
    history: [], feed: [], board: [], me: null,
    action: 'buy', side: 'rise', busy: false,
  };

  const socket = io({ auth: (cb) => cb({ token: Store.get(TOKEN_KEY) }) });

  // ---------- socket ----------
  socket.on('connect', () => { $('conn').hidden = true; });
  socket.on('disconnect', () => { $('conn').hidden = false; });
  socket.io.on('reconnect_attempt', () => { $('conn').hidden = false; });

  socket.on('state', (st) => {
    Object.assign(S, { q: st.q, b: st.b, startCash: st.startCash, open: st.open, price: st.price, history: st.history.slice(), feed: st.feed.slice() });
    setHeader(st.traders, st.volume);
    renderAll();
  });
  socket.on('tick', (t) => {
    const prev = S.price;
    S.q = t.q; S.price = t.price; S.open = t.open;
    S.history.push(t.point);
    if (S.history.length > 1000) S.history.splice(0, S.history.length - 1000);
    if (t.feed && t.feed.length) {
      S.feed = t.feed.slice().reverse().concat(S.feed).slice(0, 40);
    }
    setHeader(t.traders, t.volume);
    renderAll();
    if (Math.abs(t.price - prev) > 0.004) flash(t.price > prev);
  });
  socket.on('board', (b) => { S.board = b; renderBoard(); renderMe(); });
  socket.on('me', (me) => { S.me = me; $('join').hidden = true; renderAll(); });
  socket.on('needName', () => showJoin());
  socket.on('removed', () => { Store.del(TOKEN_KEY); S.me = null; showJoin('You were removed by the presenter. Pick a new nickname.'); });
  socket.on('reset', () => { Store.del(TOKEN_KEY); S.me = null; S.feed = []; S.board = []; showJoin('The market was reset. Join again!'); });

  // ---------- join ----------
  function showJoin(msg) {
    $('join').hidden = false;
    $('joinMsg').textContent = msg || '';
    $('joinMsg').className = msg ? 'msg' : 'msg err';
  }
  $('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('nameInput').value.trim();
    $('joinBtn').disabled = true;
    socket.timeout(8000).emit('join', { name }, (err, res) => {
      $('joinBtn').disabled = false;
      if (err) { $('joinMsg').className = 'msg err'; $('joinMsg').textContent = 'Connection problem. Try again.'; return; }
      if (!res.ok) { $('joinMsg').className = 'msg err'; $('joinMsg').textContent = res.error; return; }
      Store.set(TOKEN_KEY, res.token);
      S.me = res.me;
      $('join').hidden = true;
      $('nameInput').blur();
      renderAll();
    });
  });

  // ---------- tabs ----------
  document.querySelectorAll('.tabbar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b === btn));
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + btn.dataset.tab));
      window.scrollTo(0, 0);
      if (btn.dataset.tab === 'trade') drawChart();
    });
  });

  // ---------- ticket ----------
  document.querySelectorAll('.seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.action = btn.dataset.action;
      document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b === btn));
      $('amount').value = '';
      $('msg').textContent = '';
      renderTicket();
    });
  });
  document.querySelectorAll('.side').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.side = btn.dataset.side;
      document.querySelectorAll('.side').forEach((b) => b.classList.toggle('on', b === btn));
      if (S.action === 'sell') $('amount').value = '';
      renderTicket();
    });
  });
  $('amount').addEventListener('input', () => {
    const v = $('amount').value.replace(/[^0-9.]/g, '');
    const parts = v.split('.');
    $('amount').value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
    $('msg').textContent = '';
    renderTicket();
  });

  function maxAmount() {
    if (!S.me) return 0;
    return S.action === 'buy' ? S.me.cash : S.me.shares[S.side];
  }
  function amountValue() {
    const n = parseFloat($('amount').value);
    return Number.isFinite(n) ? n : 0;
  }

  function renderChips() {
    const box = $('chips');
    const defs = S.action === 'buy'
      ? [['$10', 10], ['$50', 50], ['$100', 100], ['$250', 250], ['Max', 'max']]
      : [['25%', 0.25], ['50%', 0.5], ['All', 1]];
    const sig = S.action;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = '';
    defs.forEach(([label, val]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        const max = maxAmount();
        let v;
        if (S.action === 'buy') v = val === 'max' ? Math.floor(max * 100) / 100 : Math.min(val, Math.floor(max * 100) / 100);
        else v = val === 1 ? max : Math.floor(max * val * 100) / 100;
        $('amount').value = S.action === 'sell' && val === 1 ? String(Math.floor(v * 100) / 100) : String(v);
        $('amount').dataset.all = S.action === 'sell' && val === 1 ? '1' : '';
        $('msg').textContent = '';
        renderTicket();
      });
      box.appendChild(b);
    });
  }

  function renderTicket() {
    renderChips();
    const buy = S.action === 'buy';
    const sideName = S.side === 'rise' ? 'RiseandShine' : 'PepsiCo';
    $('prefix').hidden = !buy;
    $('suffix').hidden = buy;
    $('amtLabel').textContent = buy ? 'Amount to spend' : 'Shares to sell';
    $('amtAvail').textContent = S.me
      ? (buy ? Mkt.money(S.me.cash) + ' available' : Mkt.sharesFmt(S.me.shares[S.side]) + ' owned')
      : '';
    const btn = $('submit');
    btn.classList.toggle('pepsi', S.side === 'pepsi');
    btn.textContent = (buy ? 'Buy ' : 'Sell ') + sideName;

    // preview
    let amt = amountValue();
    if (!buy && $('amount').dataset.all === '1' && S.me && Math.abs(amt - Math.floor(S.me.shares[S.side] * 100) / 100) < 0.005) {
      amt = S.me.shares[S.side];
    }
    const max = maxAmount();
    const pv = $('preview');
    let valid = amt > 0 && S.me && S.open && amt <= max + 1e-6;
    if (!S.open) { pv.textContent = 'Trading is closed.'; }
    else if (!S.me) { pv.textContent = ''; }
    else if (amt <= 0) {
      pv.textContent = buy
        ? `Each ${sideName} share costs ${Mkt.cents(Mkt.price(S.q, S.b, S.side))} right now.`
        : (S.me.shares[S.side] > 0 ? `Sell ${sideName} shares back at the current price.` : `You don't own any ${sideName} shares.`);
    } else if (amt > max + 1e-6) {
      pv.textContent = buy ? "You don't have that much cash." : "You don't own that many shares.";
    } else {
      const sharesAmt = buy ? Mkt.sharesForSpend(S.q, S.b, S.side, amt) : amt;
      const dollars = buy ? amt : Mkt.proceedsForSale(S.q, S.b, S.side, amt);
      const after = { ...S.q, [S.side]: S.q[S.side] + (buy ? sharesAmt : -sharesAmt) };
      const pAfter = Mkt.price(after, S.b, S.side);
      pv.innerHTML = '';
      const dl = document.createElement('dl');
      const row = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
      if (buy) {
        row('You get', '≈ ' + Mkt.sharesFmt(sharesAmt) + ' shares');
        row('Avg price', Mkt.cents(dollars / sharesAmt));
      } else {
        row('You receive', '≈ ' + Mkt.money(dollars));
        row('Avg price', Mkt.cents(dollars / sharesAmt));
      }
      row(sideName + ' price after', Mkt.cents(pAfter));
      pv.appendChild(dl);
    }
    btn.disabled = !valid || S.busy;
    $('ticket').style.opacity = S.open ? '' : '.55';
  }

  $('submit').addEventListener('click', () => {
    if (!S.me || S.busy) return;
    let amt = amountValue();
    if (S.action === 'sell' && $('amount').dataset.all === '1' && Math.abs(amt - Math.floor(S.me.shares[S.side] * 100) / 100) < 0.005) {
      amt = S.me.shares[S.side];
    }
    if (!(amt > 0)) return;
    S.busy = true;
    renderTicket();
    const side = S.side, action = S.action;
    socket.timeout(8000).emit('trade', { side, action, amount: amt }, (err, res) => {
      S.busy = false;
      if (err) { setMsg('Connection problem. Try again.', true); renderTicket(); return; }
      if (!res.ok) { setMsg(res.error, true); renderTicket(); return; }
      S.me = res.me;
      $('amount').value = '';
      $('amount').dataset.all = '';
      const name = side === 'rise' ? 'RiseandShine' : 'PepsiCo';
      toast(action === 'buy'
        ? `Bought ${Mkt.sharesFmt(res.shares)} ${name} shares for ${Mkt.money(res.dollars)}`
        : `Sold ${Mkt.sharesFmt(res.shares)} ${name} shares for ${Mkt.money(res.dollars)}`);
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      setMsg('');
      renderAll();
    });
  });

  function setMsg(text, err) {
    $('msg').textContent = text || '';
    $('msg').className = 'msg' + (err ? ' err' : '');
  }
  let toastTimer;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- rendering ----------
  function setHeader(traders, volume) {
    $('traders').textContent = traders;
    $('volume').textContent = Mkt.moneyShort(volume || 0);
  }
  function flash(up) {
    const el = $('pctRise'), el2 = $('pctPepsi');
    [el, el2].forEach((e) => e.classList.remove('flash-up', 'flash-down'));
    void el.offsetWidth;
    el.classList.add(up ? 'flash-up' : 'flash-down');
    el2.classList.add(up ? 'flash-down' : 'flash-up');
  }

  function renderOdds() {
    const p = S.price;
    $('pctRise').textContent = Mkt.pct(p);
    $('pctPepsi').textContent = Mkt.pct(1 - p);
    $('barRise').style.width = (p * 100).toFixed(1) + '%';
    $('pxRise').textContent = Mkt.cents(p);
    $('pxPepsi').textContent = Mkt.cents(1 - p);
    $('live').classList.toggle('closed', !S.open);
    $('liveText').textContent = S.open ? 'Live' : 'Closed';
    $('closedBanner').hidden = S.open;
    $('boardTitle').textContent = S.open ? 'Leaderboard' : 'Final standings';
  }

  function renderMe() {
    const me = S.me;
    if (!me) return;
    const pr = Mkt.price(S.q, S.b, 'rise'), pp = 1 - pr;
    const value = me.cash + me.shares.rise * pr + me.shares.pepsi * pp;
    const pnl = value - S.startCash;
    $('myValue').textContent = Mkt.money(value);
    $('myCash').textContent = Mkt.money(me.cash);
    $('myPnl').textContent = (pnl >= 0 ? '+' : '−') + Mkt.money(Math.abs(pnl));
    $('myPnl').className = pnl > 0.005 ? 'up' : pnl < -0.005 ? 'down' : '';
    $('myRise').textContent = Mkt.sharesFmt(me.shares.rise);
    $('myPepsi').textContent = Mkt.sharesFmt(me.shares.pepsi);
    $('holdRise').textContent = me.shares.rise > 0 ? 'You own ' + Mkt.sharesFmt(me.shares.rise) : '';
    $('holdPepsi').textContent = me.shares.pepsi > 0 ? 'You own ' + Mkt.sharesFmt(me.shares.pepsi) : '';
    const idx = S.board.findIndex((r) => r.id === me.id);
    $('myRank').textContent = idx >= 0 ? `#${idx + 1} of ${S.board.length}` : '–';
  }

  function renderFeed() {
    const ul = $('feed');
    ul.innerHTML = '';
    if (!S.feed.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No trades yet. Be the first!';
      ul.appendChild(li);
      return;
    }
    S.feed.forEach((f) => {
      const li = document.createElement('li');
      const tag = document.createElement('span');
      tag.className = 'tag ' + f.side;
      tag.textContent = (f.action === 'buy' ? 'Buy ' : 'Sell ') + (f.side === 'rise' ? 'Rise' : 'Pepsi');
      const main = document.createElement('div');
      main.className = 'feed-main';
      const b = document.createElement('b');
      b.textContent = f.name;
      main.append(b, document.createTextNode(` ${f.action === 'buy' ? 'bought' : 'sold'} ${Mkt.money(f.dollars)}`));
      const time = document.createElement('div');
      time.className = 'feed-time';
      time.textContent = `${Mkt.timeAgo(f.t)} · Rise ${Mkt.pct(f.p)}`;
      main.appendChild(time);
      li.append(tag, main);
      ul.appendChild(li);
    });
  }

  function renderBoard() {
    const ol = $('board');
    ol.innerHTML = '';
    if (!S.board.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No traders yet.';
      ol.appendChild(li);
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    S.board.forEach((r, i) => {
      const li = document.createElement('li');
      if (S.me && r.id === S.me.id) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'rank' + (i < 3 ? ' medal' : '');
      rank.textContent = i < 3 ? medals[i] : i + 1;
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = r.name + (S.me && r.id === S.me.id ? ' (you)' : '');
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = Mkt.money(r.value);
      const pnl = r.value - S.startCash;
      const sm = document.createElement('small');
      sm.className = pnl > 0.005 ? 'up' : pnl < -0.005 ? 'down' : '';
      sm.textContent = (pnl >= 0 ? '+' : '−') + ((Math.abs(pnl) / S.startCash) * 100).toFixed(1) + '%';
      val.appendChild(sm);
      li.append(rank, who, val);
      ol.appendChild(li);
    });
  }

  function drawChart() {
    Mkt.drawChart($('chart'), S.history);
  }

  function renderAll() {
    renderOdds();
    renderTicket();
    renderMe();
    renderFeed();
    renderBoard();
    drawChart();
  }

  window.addEventListener('resize', drawChart);
  setInterval(() => { drawChart(); if ($('tab-feed').classList.contains('on')) renderFeed(); }, 5000);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', drawChart);

  renderAll();
})();
