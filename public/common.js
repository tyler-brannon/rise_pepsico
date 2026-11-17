// Shared helpers for the student, projector and admin pages.
(function () {
  const other = (s) => (s === 'rise' ? 'pepsi' : 'rise');

  function cost(q, b) {
    const m = Math.max(q.rise, q.pepsi);
    return m + b * Math.log(Math.exp((q.rise - m) / b) + Math.exp((q.pepsi - m) / b));
  }
  function price(q, b, side) {
    return 1 / (1 + Math.exp((q[other(side)] - q[side]) / b));
  }
  function sharesForSpend(q, b, side, spend) {
    const o = other(side);
    return b * Math.log(Math.expm1((spend + cost(q, b) - q[o]) / b)) + q[o] - q[side];
  }
  function proceedsForSale(q, b, side, shares) {
    return cost(q, b) - cost({ ...q, [side]: q[side] - shares }, b);
  }

  const money = (n) =>
    '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyShort = (n) =>
    '$' + Math.round(n).toLocaleString();
  const cents = (p) => {
    const c = p * 100;
    return (c < 1 || c > 99 ? c.toFixed(1) : Math.round(c)) + '¢';
  };
  const pct = (p) => Math.round(p * 100) + '%';
  const sharesFmt = (n) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1));

  // Device clocks can be off by seconds. All timestamps come from the server,
  // so track the server-minus-device offset and draw on server time.
  // Max of recent samples = the sample with the least network delay.
  const offsets = [];
  let clockOffset = 0;
  function syncClock(serverNow) {
    if (!Number.isFinite(serverNow)) return;
    offsets.push(serverNow - Date.now());
    if (offsets.length > 15) offsets.shift();
    clockOffset = Math.max(...offsets);
  }
  const now = () => Date.now() + clockOffset;

  function timeAgo(t) {
    const s = Math.max(0, Math.round((now() - t) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Step chart of both sides' prices over time.
  function drawChart(canvas, history, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const fontSize = opts.fontSize || 11;
    const padR = fontSize * 3.2, padT = 8, padB = 8, padL = 2;
    const cw = w - padL - padR, ch = h - padT - padB;
    const lastT = history.length ? history[history.length - 1].t : 0;
    const end = Math.max(opts.endTime || now(), lastT); // never draw a point past "now"
    // Show at least a 1-minute window, padded on the left so "now" stays at the right edge.
    const t0 = Math.min(history.length ? history[0].t : end, end - 60000);
    const span = end - t0;
    const x = (t) => padL + ((t - t0) / span) * cw;
    const y = (p) => padT + (1 - p) * ch;

    const grid = cssVar('--grid'), muted = cssVar('--muted');
    ctx.font = `${fontSize}px ${cssVar('--font') || 'system-ui'}`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((g) => {
      ctx.strokeStyle = grid;
      ctx.setLineDash(g === 0.5 ? [] : [3, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y(g)) + 0.5);
      ctx.lineTo(padL + cw, Math.round(y(g)) + 0.5);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    const series = [
      { key: 'pepsi', color: cssVar('--pepsi'), f: (p) => 1 - p },
      { key: 'rise', color: cssVar('--rise'), f: (p) => p },
    ];
    const ends = [];
    series.forEach((s) => {
      if (!history.length) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = opts.lineWidth || 2.25;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let prev = s.f(history[0].p);
      ctx.moveTo(x(history[0].t), y(prev));
      for (let i = 1; i < history.length; i++) {
        const v = s.f(history[i].p);
        ctx.lineTo(x(history[i].t), y(prev));
        ctx.lineTo(x(history[i].t), y(v));
        prev = v;
      }
      ctx.lineTo(x(end), y(prev));
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x(end), y(prev), (opts.lineWidth || 2.25) + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ends.push({ v: prev, color: s.color });
    });

    // right-edge labels: end values, nudged apart if they collide
    ends.sort((a, b) => b.v - a.v);
    const minGap = fontSize * 1.3;
    let ys = ends.map((e) => y(e.v));
    if (ys.length === 2 && ys[1] - ys[0] < minGap) {
      const mid = (ys[0] + ys[1]) / 2;
      ys = [mid - minGap / 2, mid + minGap / 2];
    }
    ctx.textAlign = 'left';
    ctx.font = `600 ${fontSize}px ${cssVar('--font') || 'system-ui'}`;
    ends.forEach((e, i) => {
      ctx.fillStyle = e.color;
      ctx.fillText(Math.round(e.v * 100) + '%', padL + cw + 6, Math.min(h - fontSize / 2, Math.max(fontSize / 2, ys[i])));
    });
    if (!ends.length) {
      ctx.fillStyle = muted;
      ctx.fillText('No trades yet', padL + 4, h / 2);
    }
  }

  window.Mkt = { syncClock, now, cost, price, sharesForSpend, proceedsForSale, money, moneyShort, cents, pct, sharesFmt, timeAgo, drawChart, other };

  window.Store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
})();
