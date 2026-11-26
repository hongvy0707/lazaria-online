// Do do tre: N nguoi choi dung gan nhau o bai quai, vua di vua danh. In khoang cach giua cac goi 's', kich thuoc goi, so lan bi keo lai.
// Chay: npm run dev (cua so khac), roi: node test/lag.mjs [dia chi] [so nguoi] [giay]
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const N = +(process.argv[3] || 3), SECS = +(process.argv[4] || 15);
const WS = BASE.replace(/^http/, 'ws');
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../client/data/rules.js'); require('../../client/data/dbm.js');
const MAP = globalThis.LAZ_MAPS.dbm, GEO = globalThis.LAZ_RULES.makeGeo(MAP);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tag = Date.now().toString(36).slice(-4);
const bots = [];
for (let i = 0; i < N; i++) {
  const r = await fetch(BASE + '/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Lag ${tag} ${i}`, race: 'elf', cls: 'ct', bg: 'linh', gender: 'f', outfit: 0 }) });
  const a = await r.json();
  const st = { a, gaps: [], bytes: 0, n: 0, last: 0, pos: 0, hi: null, mobs: new Map() };
  await new Promise((res, rej) => {
    const ws = new WebSocket(`${WS}/ws?id=${a.id}&key=${a.key}`);
    st.ws = ws;
    ws.onmessage = e => {
      const d = JSON.parse(e.data), now = performance.now();
      if (d.t === 'hi') { st.hi = d; res(); return; }
      if (d.t !== 's') return;
      if (st.last) st.gaps.push(now - st.last);
      st.last = now; st.bytes += e.data.length; st.n++;
      st.snap = d; for (const r of d.m) st.mobs.set(r[0], r); if (d.g) for (const id of d.g) st.mobs.delete(id);
      if (d.e) for (const x of d.e) if (x[0] === 'pos') st.pos++;
    };
    ws.onerror = rej;
  });
  bots.push(st);
}
// dua ca nhom toi Dong co phia tay nam (slime, tho) bang cach di tung buoc hop le
const goal = { x: 520, y: 780 };
for (const b of bots) {
  b.x = b.hi.x; b.y = b.hi.y;
  b.path = GEO.findPath(b.x, b.y, goal.x + Math.random() * 30, goal.y + Math.random() * 20) || [];
}
const t0 = performance.now();
let sent = 0;
while (performance.now() - t0 < SECS * 1000) {
  for (const b of bots) {
    let budget = 5 * 8 * .2;
    while (budget > 0 && b.path.length) {
      const w = b.path[0], dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy);
      if (d <= budget) { b.x = w.x; b.y = w.y; budget -= d; b.path.shift(); }
      else { b.x += dx / d * budget; b.y += dy / d * budget; budget = 0; }
    }
    if (!b.path.length) b.path = GEO.findPath(b.x, b.y, goal.x + (Math.random() - .5) * 120, goal.y + (Math.random() - .5) * 80) || [];
    const ev = [];
    if (b.snap) { const m = [...b.mobs.values()].find(m => (m[8] & 1) && Math.hypot(m[2] - b.x, m[3] - b.y) < 15 * 8); if (m) ev.push(['h', m[0], -1]); }
    b.ws.send(JSON.stringify({ t: 'u', x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, f: 0, fl: 0, s: 1, hp: 200, ev }));
    sent++;
  }
  await sleep(200);
}
for (const b of bots) {
  const g = b.gaps.slice().sort((a, c) => a - c), q = p => g[Math.floor(g.length * p)] || 0;
  console.log(`${b.a.char.name}: ${b.n} goi, trung binh ${Math.round(b.bytes / b.n)} byte (${Math.round(b.bytes / SECS / 1024)} KB/s), khoang cach p50 ${q(.5).toFixed(0)} ms p95 ${q(.95).toFixed(0)} ms max ${g[g.length - 1].toFixed(0)} ms, bi keo lai ${b.pos} lan, thay ${b.mobs.size} quai, ${b.snap.p.length} nguoi`);
  b.ws.close();
}
process.exit(0);
