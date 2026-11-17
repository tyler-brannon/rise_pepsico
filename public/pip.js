// Floating always-on-top mini market (Document Picture-in-Picture, Chrome/Edge 116+).
(function () {
  const supported = 'documentPictureInPicture' in window;
  let win = null;
  let last = null;
  const listeners = [];

  const CSS = `
    html, body { height: 100%; }
    body { margin: 0; background: var(--card); color: var(--text); overflow: hidden;
      display: flex; flex-direction: column; padding: 3vh 4vw 2.5vh; box-sizing: border-box; }
    .w-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
    .w-side { min-width: 0; }
    .w-side.pepsi { text-align: right; }
    .w-n { font-size: clamp(11px, 4.2vw, 30px); font-weight: 700; white-space: nowrap; }
    .w-p { font-size: clamp(26px, 14vw, 120px); font-weight: 800; letter-spacing: -.03em; line-height: 1; }
    .rise .w-p { color: var(--rise); } .pepsi .w-p { color: var(--pepsi); }
    .w-bar { display: flex; height: max(5px, 1.6vh); border-radius: 99px; overflow: hidden; background: var(--pepsi); margin: 1.5vh 0 1vh; }
    .w-bar span { background: var(--rise); transition: width .5s ease; }
    canvas { flex: 1; min-height: 0; width: 100%; display: block; }
    .w-foot { display: flex; justify-content: space-between; gap: 8px; font-size: clamp(10px, 3.2vw, 22px);
      color: var(--muted); font-weight: 600; margin-top: .8vh; white-space: nowrap; }
    .w-foot b { color: var(--text); }
    .w-closed { color: var(--down); }
    .w-live { display: inline-flex; align-items: center; gap: 6px; }
    .w-live .dot { width: 7px; height: 7px; }
    .short canvas { display: none; }
  `;

  function el(tag, cls, text) {
    const e = win.document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  async function open() {
    if (win) { win.close(); return; }
    win = await documentPictureInPicture.requestWindow({ width: 380, height: 240 });
    const d = win.document;
    d.title = 'Rise v. PepsiCo';
    const link = d.createElement('link');
    link.rel = 'stylesheet';
    link.href = location.origin + '/style.css';
    link.onload = () => update(last);
    const style = d.createElement('style');
    style.textContent = CSS;
    d.head.append(link, style);

    const top = el('div', 'w-top');
    const r = el('div', 'w-side rise'); r.append(el('div', 'w-n', 'RiseandShine'), el('div', 'w-p', '50%'));
    const p = el('div', 'w-side pepsi'); p.append(el('div', 'w-n', 'PepsiCo'), el('div', 'w-p', '50%'));
    top.append(r, p);
    const bar = el('div', 'w-bar'); bar.appendChild(el('span'));
    const canvas = el('canvas');
    const foot = el('div', 'w-foot');
    const live = el('span', 'w-live'); live.append(el('span', 'dot'), el('span', 'w-status', 'Live'));
    foot.append(live, el('span', 'w-join'));
    d.body.append(top, bar, canvas, foot);

    win.addEventListener('resize', () => update(last));
    win.addEventListener('pagehide', () => { win = null; notify(); });
    notify();
    update(last);
  }

  function update(S) {
    if (S) last = S;
    if (!win || !last) return;
    const d = win.document;
    const q = (s) => d.querySelector(s);
    if (!q('.w-top')) return;
    q('.rise .w-p').textContent = Mkt.pct(last.price);
    q('.pepsi .w-p').textContent = Mkt.pct(1 - last.price);
    q('.w-bar span').style.width = (last.price * 100).toFixed(1) + '%';
    q('.w-live').classList.toggle('w-closed', !last.open);
    q('.w-live .dot').style.background = last.open ? '' : 'var(--down)';
    q('.w-live .dot').style.animation = last.open ? '' : 'none';
    q('.w-status').textContent = last.open ? `Live · ${last.traders || 0} traders` : 'Trading closed';
    q('.w-join').textContent = 'Join: ' + location.host;
    d.body.classList.toggle('short', win.innerHeight < 170);
    if (win.innerHeight >= 170) {
      const fs = Math.max(10, Math.min(20, Math.round(win.innerWidth / 32)));
      Mkt.drawChart(q('canvas'), last.history, { fontSize: fs, lineWidth: Math.max(2, fs / 5) });
    }
  }

  function notify() { listeners.forEach((fn) => fn(!!win)); }

  window.MarketPip = {
    supported,
    open,
    update,
    isOpen: () => !!win,
    onChange: (fn) => listeners.push(fn),
  };
})();
