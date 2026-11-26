// Kiem tra may chu dang chay (mac dinh http://127.0.0.1:8787).
// Phan co ban (moi may chu): tao 2 nhan vat, ket noi, thay nhau, danh quai nhan EXP, tui do, to doi, chong di qua nhanh.
// Phan Dungeon va quai ve cho (chi khi may chu chay voi --var DEV:1 de doi cap, dich chuyen): vao Hang Hai Dang Co, mo cong, den ngu, ha Boss.
// Chay: npx wrangler dev --var DEV:1 (cua so khac), roi: npm test   hoac   node test/smoke.mjs https://lazyeyes-server.<ten>.workers.dev
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS = BASE.replace(/^http/, 'ws');
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../client/data/rules.js'); require('../../client/data/dbm.js'); require('../../client/data/hhd.js');
const R = globalThis.LAZ_RULES, MAPS = globalThis.LAZ_MAPS;
const GEO = R.makeGeo(MAPS.dbm);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (cond, text) => { console.log((cond ? 'OK   ' : 'LOI  ') + text); if (!cond) fail++; };

async function create(name, race, cls) {
  const r = await fetch(BASE + '/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, race, cls, bg: 'linh', gender: 'f', outfit: 1 }) });
  return [r.status, await r.json()];
}
// bot: giu bang quai theo goi thay doi (m) va xoa (g), nhu may khach that
function connect(acc) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${WS}/ws?id=${acc.id}&key=${acc.key}`);
    const st = { ws, hi: null, snap: null, ev: [], others: new Set(), mobs: new Map(), rows: 0, snaps: 0, zseq: 0, x: 0, y: 0 };
    st.u = (ev = [], move = true) => ws.send(JSON.stringify(move ? { t: 'u', z: st.zseq, x: st.x, y: st.y, f: 0, fl: 0, s: 1, hp: 140, ev } : { t: 'u', z: st.zseq, ev }));
    st.has = (k, f = () => true) => st.ev.some(e => e[0] === k && f(e));
    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.t === 'hi') { st.hi = d; st.x = d.x; st.y = d.y; d.others.forEach(o => st.others.add(o.n)); res(st); }
      if (d.t === 'err') rej(new Error(d.text));
      if (d.t === 's') {
        st.snap = d; st.snaps++; st.rows += d.m.length;
        if (d.dm) st.dm = d.dm;
        if (d.e) for (const x of d.e) if (x[0] === 'map') st.mobs.clear();     // doi ban do truoc khi nhan quai cua ban do moi (nhu may khach)
        for (const r of d.m) st.mobs.set(r[0], r);
        if (d.g) for (const id of d.g) st.mobs.delete(id);
        if (d.e) {
          st.ev.push(...d.e);
          for (const x of d.e) {
            if (x[0] === 'pj') st.others.add(x[1].n);
            if (x[0] === 'pos') { st.x = x[1]; st.y = x[2]; }
            if (x[0] === 'map') { st.zseq = x[3]; st.x = x[4]; st.y = x[5]; }
            if (x[0] === 'inv') st.inv = x[1];
          }
        }
      }
    };
    ws.onerror = () => rej(new Error('khong ket noi duoc ' + WS));
  });
}
// di bo toi (tx, ty) theo duong tim duoc, 5 m/giay, gui 5 lan moi giay
async function walk(b, geo, tx, ty, maxS = 40) {
  let path = geo.findPath(b.x, b.y, tx, ty) || [{ x: tx, y: ty }];
  for (let i = 0; i < maxS * 5 && path.length; i++) {
    let budget = 5 * 8 * .2;
    while (budget > 0 && path.length) {
      const w = path[0], dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy);
      if (d <= budget) { b.x = w.x; b.y = w.y; budget -= d; path.shift(); } else { b.x += dx / d * budget; b.y += dy / d * budget; budget = 0; }
    }
    b.u(); await sleep(200);
  }
}

const tag = Date.now().toString(36).slice(-5);
const health = await (await fetch(BASE + '/api/health')).json();
ok(health.ok, 'May chu tra loi /api/health');
const [c1, a1] = await create('Thu ' + tag, 'human', 'cb');
ok(c1 === 200 && a1.key, 'Tao nhan vat 1 (Human, Chien Binh)');
ok(a1.char && a1.char.eq && ['vk', ...R.ARMOR].every(s => a1.char.eq[s]) && R.ACC.every(s => !a1.char.eq[s]) && a1.char.bag.some(b => b.k === 'hp1' && b.n === 5), 'Nhan vat moi mac du 6 mon do tan thu, tui co 5 Binh Mau Nho');
const [c2] = await create('Thu ' + tag, 'elf', 'ct');
ok(c2 === 409, 'Trung ten bi tu choi (409)');
const [c3] = await create('Sai ' + tag, 'elf', 'cb');
ok(c3 === 400, 'Elf chon Chien Binh (khac phe) bi tu choi');
const [c4, a2] = await create('Ban ' + tag, 'elf', 'ct');
ok(c4 === 200, 'Tao nhan vat 2 (Elf, Cung Thu)');

const bad = await connect({ id: a1.id, key: 'sai' }).then(() => false, () => true);
ok(bad, 'Ma dang nhap sai bi tu choi');
const p1 = await connect(a1), p2 = await connect(a2);
ok(p1.hi.char.name === 'Thu ' + tag && p1.hi.char.gender === 'f' && p1.hi.char.outfit === 1, 'Vao the gioi, nhan lai dung nhan vat (gioi tinh, trang phuc)');
await sleep(600);
ok(p1.others.has(p2.hi.me) && p2.others.has(p1.hi.me), 'Hai nguoi choi thay nhau');
ok(p1.mobs.size > 0, `Nhan anh chup the gioi: ${p1.mobs.size} quai trong tam nhin`);
const r0 = p1.rows, s0 = p1.snaps;
await sleep(1500);
const perSnap = (p1.rows - r0) / Math.max(1, p1.snaps - s0);
ok(perSnap < p1.mobs.size * .6, `Goi tin chi gui quai co thay doi: trung binh ${perSnap.toFixed(1)} dong moi goi / ${p1.mobs.size} quai`);
const pl = p1.snap.p.find(r => r[0] === p2.hi.me);
ok(pl && pl.length >= 10 && typeof p1.snap.T === 'number', 'Moi nguoi choi co moc thoi gian di chuyen (de may khach noi suy muot)');

// ---- danh quai Yeu gan nhat ----
const kinds = p1.hi.kinds;
let tgt = null;
for (const m of p1.mobs.values()) if (['slime', 'crab', 'rabbit', 'rat'].includes(kinds[m[1]]) && (m[8] & 1))
  if (!tgt || Math.hypot(m[2] - p1.x, m[3] - p1.y) < Math.hypot(tgt[2] - p1.x, tgt[3] - p1.y)) tgt = m;
ok(!!tgt, 'Tim thay quai Yeu de danh: ' + (tgt ? kinds[tgt[1]] + ' Lv' + tgt[6] : '-'));
for (let i = 0; i < 300 && tgt; i++) {
  const cur = p1.mobs.get(tgt[0]);
  if (!cur || !(cur[8] & 1)) break;
  const d = Math.hypot(cur[2] - p1.x, cur[3] - p1.y);
  if (d > 14) { const path = GEO.findPath(p1.x, p1.y, cur[2], cur[3]); if (path) await walk(p1, GEO, path[0].x, path[0].y, 1); else break; }
  else { p1.u([['h', cur[0], -1]]); await sleep(1050); }
}
ok(p1.has('d', e => e[1] === tgt[0] && e[2] > 0), 'Gay sat thuong len quai');
ok(p1.has('k', e => e[1] === tgt[0]), 'Quai chet');
const xp = p1.ev.find(e => e[0] === 'xp');
ok(!!xp, 'Nhan EXP va tien tu may chu: ' + (xp ? `+${xp[1]} EXP, +${xp[2]} Dong` : '-'));

// ---- tui do ----
p1.u([['uq', 'mu']], false); await sleep(400);
ok(p1.inv && !p1.inv.eq.mu && p1.inv.bag.some(b => b.k === 'mu_trung_1'), 'Thao mu: mu vao tui');
const mi = p1.inv.bag.findIndex(b => b.k === 'mu_trung_1');
p1.u([['eq', mi, 'mu_trung_1']], false); await sleep(400);
ok(p1.inv.eq.mu && p1.inv.eq.mu.k === 'mu_trung_1', 'Mac lai mu tu tui');
p1.u([['eq', 0, 'hp1']], false); await sleep(400);
ok(p1.has('log', e => /không mặc|Không mặc|đổi chỗ/i.test(e[1])), 'Khong mac duoc binh mau (may chu tu choi)');
p1.u([['buy', 'vk_cb_10']], false); await sleep(400);
ok(p1.has('log', e => /đứng gần/.test(e[1])), 'Mua do o xa cua hang bi tu choi');
const hpBefore = p1.inv.bag.filter(b => b.k === 'hp1').reduce((t, b) => t + b.n, 0);   // quai co the roi them binh
p1.u([['use', p1.inv.bag.findIndex(b => b.k === 'hp1'), 'hp1']], false); await sleep(1200);
const hpAfter = p1.inv.bag.filter(b => b.k === 'hp1').reduce((t, b) => t + b.n, 0);
ok(p1.has('use', e => e[1] === 'hp1') && hpAfter === hpBefore - 1, `Uong binh mau: con ${hpAfter} binh`);

// ---- to doi ----
p1.u([['pi', p2.hi.me]], false); await sleep(400);
ok(p2.has('pinv', e => e[1] === p1.hi.me), 'Nguoi choi 2 nhan loi moi to doi');
p2.u([['pa']], false); await sleep(400);
const pt = [...p1.ev].reverse().find(e => e[0] === 'party');
ok(pt && pt[1] && pt[1].m.length === 2 && pt[1].leader === p1.hi.me, 'Lap to doi 2 nguoi, nguoi moi la doi truong');
p2.u([['m', 'xin chao doi', 'd']], false); await sleep(400);
ok(p1.has('chat', e => e[2] === 'xin chao doi' && e[3] === 'd'), 'Tro chuyen kenh to doi');

// ---- ban be ----
const last = (b, k) => [...b.ev].reverse().find(e => e[0] === k);
p1.u([['fa', p2.hi.me]], false); await sleep(400);
ok(p2.has('fq', e => e[1] === p1.hi.char.name), 'Nguoi choi 2 nhan loi moi ket ban');
p2.u([['fy', p1.hi.char.name]], false); await sleep(400);
ok(last(p1, 'fl') && last(p1, 'fl')[1].some(f => f[0] === p2.hi.char.name && f[1]) && last(p2, 'fl')[1].some(f => f[0] === p1.hi.char.name), 'Dong y: ca hai thay nhau trong danh sach ban (dang online)');
p1.u([['fv', p2.hi.char.name]], false); await sleep(400);
ok(last(p1, 'fv') && last(p1, 'fv')[1].eq.vk && last(p1, 'fv')[1].cls === 'ct', 'Xem trang bi cua ban');
p1.u([['fv', 'Khong Co Ai']], false); await sleep(400);
ok(p1.has('log', e => /Chỉ xem được trang bị của bạn bè/.test(e[1])), 'Khong xem duoc trang bi nguoi khong phai ban');
// nong trai, nau an: chi Nong Dan
p1.u([['fp', 0, 'hat_ca_rot'], ['ck', 'banh_mi']], false); await sleep(400);
ok(p1.has('log', e => /Chỉ Nông Dân/.test(e[1])), 'Class khac Nong Dan khong trong trot, nau an duoc');

// ---- giao dich ----
await walk(p1, GEO, p2.x + 16, p2.y, 60); await sleep(300);
p1.u([['tr', p2.hi.me]], false); await sleep(400);
if (!p2.has('tri')) { await walk(p1, GEO, p2.x + 16, p2.y, 20); await sleep(3000); p1.u([['tr', p2.hi.me]], false); await sleep(400); }   // chua toi gan: di tiep roi moi lai
ok(p2.has('tri', e => e[1] === p1.hi.me), 'Nguoi choi 2 nhan loi moi giao dich');
p2.u([['tra']], false); await sleep(400);
const tw = (b) => [...b.ev].reverse().find(e => e[0] === 'tw');
ok(tw(p1) && tw(p1)[1] && tw(p2) && tw(p2)[1] && tw(p2)[1].name === p1.hi.char.name, 'Mo bang giao dich o ca hai ben');
const sumK = (inv, k) => inv.bag.filter(b => b.k === k).reduce((t, b) => t + b.n, 0);
const t1 = p1.inv.tien, t2 = (p2.inv || p2.hi.char).tien, h1 = sumK(p1.inv, 'hp1'), h2 = sumK(p2.inv || p2.hi.char, 'hp1');
const give = Math.min(3, t1);
p1.u([['to', [p1.inv.bag.findIndex(b => b.k === 'hp1')], give]], false); await sleep(300);
p1.u([['tl', 1]], false); await sleep(300);
p2.u([['to', [(p2.inv || p2.hi.char).bag.findIndex(b => b.k === 'hp1')], 0]], false); await sleep(400);
ok(tw(p1)[1].me.lock === 0 && tw(p1)[1].them.it.length === 1, 'Doi offer thi ca hai mo khoa, thay do ben kia dua');
p1.u([['use', p1.inv.bag.findIndex(b => b.k === 'hp1'), 'hp1']], false); await sleep(400);
ok(p1.has('log', e => /Đang giao dịch/.test(e[1])), 'Dang giao dich thi khong dung / mac / ban do duoc');
p1.u([['tl', 1]], false); p2.u([['tl', 1]], false); await sleep(300);
p1.u([['tk']], false); await sleep(300);
ok(tw(p1)[1] && tw(p1)[1].me.ok === 1, 'Mot ben dong y: chua doi, cho ben kia');
p2.u([['tk']], false); await sleep(600);
ok(tw(p1)[1] === null && tw(p2)[1] === null, 'Ca hai dong y: dong bang giao dich');
ok(sumK(p1.inv, 'hp1') === h2 && sumK(p2.inv, 'hp1') === h1 && p1.inv.tien === t1 - give && p2.inv.tien === t2 + give,
  `Doi do va tien dung: nguoi 1 co ${sumK(p1.inv, 'hp1')} binh (truoc ${h1}), nguoi 2 nhan ${give} Dong`);
p2.u([['tr', p1.hi.me]], false); await sleep(400); p1.u([['tra']], false); await sleep(400);
p2.u([['tc']], false); await sleep(400);
ok(tw(p1)[1] === null && p1.has('log', e => /hủy giao dịch/.test(e[1])), 'Huy giao dich: dong bang o ca hai ben');
ok(p1.has('ach', e => e[1] === 'trade1') && p2.has('ach', e => e[1] === 'trade1'), 'Giao dich xong: ca hai dat thanh tuu Cai Bat Tay Dau Tien');
// dua mot phan chong: nguoi 2 dua 2 binh trong chong cua minh
{
  await sleep(2000);                                             // moi giao dich: cach nhau 3 giay
  const hA = sumK(p1.inv, 'hp1'), hB = sumK(p2.inv, 'hp1'), iB = p2.inv.bag.findIndex(b => b.k === 'hp1');
  p2.u([['tr', p1.hi.me]], false); await sleep(400); p1.u([['tra']], false); await sleep(400);
  p2.u([['to', [[iB, 2]], 0]], false); await sleep(400);
  ok(tw(p1)[1] && tw(p1)[1].them.it.length === 1 && tw(p1)[1].them.it[0].n === 2, 'Dua 2 binh trong chong: ben kia thay x2');
  p1.u([['tl', 1]], false); p2.u([['tl', 1]], false); await sleep(300);
  p1.u([['tk']], false); p2.u([['tk']], false); await sleep(600);
  ok(sumK(p1.inv, 'hp1') === hA + 2 && sumK(p2.inv, 'hp1') === hB - 2, `Doi mot phan chong dung: nguoi 1 ${hA} -> ${sumK(p1.inv, 'hp1')}, nguoi 2 ${hB} -> ${sumK(p2.inv, 'hp1')}`);
}

// ---- chong di qua nhanh ----
const b0 = p1.ev.filter(e => e[0] === 'pos').length;
for (let i = 1; i <= 20; i++) p1.ws.send(JSON.stringify({ t: 'u', z: p1.zseq, x: p1.x + i * 8, y: p1.y, f: 0, fl: 0, s: 1, hp: 140 }));
await sleep(500);
ok(p1.ev.filter(e => e[0] === 'pos').length > b0, 'Gui don nhieu buoc (chay nhanh hon 5 m/giay) bi may chu keo lai');

// ---- Dungeon va quai ve cho: can --var DEV:1 ----
p1.u([['dev', 'lv', 12]], false); await sleep(400);
const dev = p1.has('lv', e => e[1] === 12);
if (!dev) console.log('     (may chu khong chay voi DEV:1: bo qua phan Dungeon)');
else {
  // quai ve cho: Cung Thu (tam 16 m) dung cach Goblin 17,5 m (ngoai vung gioi han 14 m) va ban lien tuc
  p2.u([['dev', 'tp', 290, 760]], false); p2.x = 290; p2.y = 760; await sleep(900);
  const g = [...p2.mobs.values()].filter(m => kinds[m[1]] === 'goblin' && (m[8] & 1))[0];
  if (g) {
    let spot = null;
    for (let a = 0; a < 360 && !spot; a += 15) { const x = g[2] + Math.cos(a * Math.PI / 180) * 17.5 * 8, y = g[3] + Math.sin(a * Math.PI / 180) * 17.5 * 8; if (GEO.canStand(x, y)) spot = { x, y }; }
    p2.u([['dev', 'tp', spot.x, spot.y]], false); p2.x = spot.x; p2.y = spot.y; await sleep(400);
    let evaded = false, minD = 1e9;
    for (let i = 0; i < 40; i++) {
      p2.u([['h', g[0], -1]]); await sleep(400);
      const cur = p2.mobs.get(g[0]);
      if (cur) minD = Math.min(minD, Math.hypot(cur[2] - p2.x, cur[3] - p2.y));
      if (cur && (cur[8] & 1024)) { evaded = true; break; }
    }
    // tu 14/10/2026 cay nho khong chan duong: Goblin co the chay toi duoc nguoi ban, khi do khong can bo cuoc
    ok(evaded || minD < 3 * 8, evaded ? `Goblin bi ban tu ngoai vung gioi han thi bo cuoc quay ve, mien nhiem (gan nhat ${(minD / 8).toFixed(1)} m)` : `Goblin chay toi duoc nguoi ban (${(minD / 8).toFixed(1)} m), khong can bo cuoc`);
    await sleep(900);                                             // cho toc danh hoi lai (may chu chan danh nhanh hon toc danh)
    p2.u([['h', g[0], -1]]); await sleep(600);
    if (evaded) ok(p2.has('fx', e => e[1] === g[0] && e[2] === 'Miễn nhiễm'), 'Danh quai dang quay ve: Mien nhiem, khong mat mau');
  }
  // mua mon Tot o Ba Mira: co 1 dong phu (chi mang, sat thuong chi mang, toc danh...)
  p1.u([['dev', 'tp', 930, 312], ['dev', 'tien', 100000]], false); p1.x = 930; p1.y = 312; await sleep(400);
  p1.u([['buy', 'vk_cb_10', 1]], false); await sleep(500);
  const good = p1.inv && p1.inv.bag.find(b => b.k === 'vk_cb_10' && b.r === 1);
  ok(good && good.s && good.s.length === 1 && ['atk', 'crit', 'cd', 'aspd'].includes(good.s[0][0]), `Mua vu khi pham Tot: 1 dong phu ${good && good.s ? good.s[0].join(' +') + '%' : '-'}`);
  // ren o Tho Ren Bram: +1 luon thanh cong, +5% chi so chinh
  p1.u([['dev', 'tp', R.SMITH_NPC.x, R.SMITH_NPC.y + 12]], false); p1.x = R.SMITH_NPC.x; p1.y = R.SMITH_NPC.y + 12; await sleep(400);
  p1.u([['ren', 'vk']], false); await sleep(500);
  ok(p1.inv.eq.vk.up === 1 && p1.has('log', e => /Rèn thành công/.test(e[1])), `Ren vu khi +1 o Tho Ren Bram (${p1.inv.eq.vk.k} +${p1.inv.eq.vk.up})`);
  const st = R.hero('cb', 12, { vk: good });
  ok(st.crit >= .05 && st.cd >= 1.5 && st.aspd >= 1, `Chi so nhan vat co Chi mang ${Math.round(st.crit * 100)}%, Sat thuong chi mang ${Math.round(st.cd * 100)}%, Toc danh ${st.aspd.toFixed(2)}`);
  // vao hang: ca to doi phai dung o cua hang, bam San sang roi vao cung luc
  p2.u([['dev', 'lv', 12]], false);
  const door = MAPS.dbm.items.find(i => i.name === 'Hang Hải Đăng Cổ');
  p1.u([['dev', 'tp', 1312, 790]], false); p1.x = 1312; p1.y = 790;
  p2.u([['dev', 'tp', 930, 312]], false); p2.x = 930; p2.y = 312;
  await sleep(400);
  p1.u([['dg', 'hhd']], false); await sleep(400);
  ok(p1.has('log', e => /chưa tới cửa hang/.test(e[1])) && !p1.has('map', e => e[1] === 'hhd'), 'Dong doi chua toi cua hang thi chua mo hang duoc');
  p2.u([['dev', 'tp', 1312, 790]], false); p2.x = 1312; p2.y = 790; await sleep(300);
  p2.u([['dg', 'hhd']], false); await sleep(300);
  ok(p2.has('log', e => /Đội trưởng mở hang/.test(e[1])), 'Chi doi truong moi mo hang cho to doi');
  p1.u([['dg', 'hhd']], false); await sleep(400);
  const rc2 = [...p2.ev].reverse().find(e => e[0] === 'rc');
  ok(rc2 && rc2[1] && rc2[1].m.length === 2 && rc2[1].m.find(x => x[0] === p1.hi.me)[2] === 1 && rc2[1].m.find(x => x[0] === p2.hi.me)[2] === 0, 'Ca to doi nhan bang San sang (doi truong da san sang)');
  p2.u([['ry', 0]], false); await sleep(400);
  ok(p1.has('log', e => /chưa sẵn sàng/.test(e[1])) && !p1.has('map', e => e[1] === 'hhd'), 'Mot nguoi chua san sang thi huy, khong ai vao');
  p1.u([['dg', 'hhd']], false); await sleep(400);
  p2.u([['ry', 1]], false); await sleep(500);
  const m1 = p1.ev.find(e => e[0] === 'map' && e[1] === 'hhd'), m2 = p2.ev.find(e => e[0] === 'map' && e[1] === 'hhd');
  ok(m1 && m2 && m1[2] === m2[2], 'Du nguoi san sang: ca 2 nguoi vao cung mot phong, cung luc');
  await sleep(500);
  const dk = [...p1.mobs.values()].map(m => kinds[m[1]]);
  ok(dk.includes('saltslime') && !dk.includes('slime'), 'Thay quai cua hang (Slime Muoi), khong con quai ngoai dao');
  const ss = [...p1.mobs.values()].find(m => kinds[m[1]] === 'saltslime');
  ok(ss && ss[5] === Math.round(1420 * R.dungeonHp(2)), `Mau quai theo so nguoi trong to doi (2 nguoi: x0,58): ${ss ? ss[5] : '-'} / 1420`);
  // thu han: p1 danh truoc 1 don, p2 danh nhieu hon thi quai doi sang p2; p1 thay ky nang va dan cua p2
  const tm = [...p1.mobs.values()].find(m => kinds[m[1]] === 'saltslime' && (m[8] & 1));
  if (tm) {
    for (const b of [p1, p2]) { b.u([['dev', 'tp', tm[2] + (b === p1 ? 12 : -40), tm[3]]], false); b.x = tm[2] + (b === p1 ? 12 : -40); b.y = tm[3]; }
    await sleep(500);
    p1.u([['h', tm[0], -1]]); await sleep(1200);
    const t1 = p1.mobs.get(tm[0]);
    ok(t1 && t1[10] === p1.hi.me, 'Quai duoi nguoi danh truoc');
    p2.u([['c', 0, 0, tm[0]]]); await sleep(150);
    for (let i = 0; i < 2; i++) { p2.u([['h', tm[0], 0]]); await sleep(150); }
    for (let i = 0; i < 8; i++) { p2.u([['h', tm[0], -1]]); await sleep(450); }
    await sleep(1200);
    const t2 = p1.mobs.get(tm[0]);
    ok(t2 && t2[10] === p2.hi.me, `Nguoi gay nhieu sat thuong hon keo quai (thu han): quai dang duoi ${t2 ? (t2[10] === p2.hi.me ? 'p2' : t2[10]) : '-'}`);
    ok(p1.has('oc', e => e[1] === p2.hi.me && e[2] === 'ct.g0' && e[3] === tm[0]), 'Nguoi choi khac thay dong doi dung ky nang (su kien oc)');
    ok(p1.has('oa', e => e[1] === p2.hi.me), 'Nguoi choi khac thay dan danh thuong cua Cung Thu (su kien oa)');
    ok(p1.dm && p1.dm.some(r => r[0] === p2.hi.char.name && r[1] > 0) && p1.dm.some(r => r[0] === p1.hi.char.name), `Bang sat thuong trong hang: ${JSON.stringify(p1.dm)}`);
    for (const b of [p1, p2]) { b.u([['dev', 'tp', MAPS.hhd.start.x, MAPS.hhd.start.y]], false); b.x = MAPS.hhd.start.x; b.y = MAPS.hhd.start.y; }
    await sleep(400);
  }
  // cong tang 2 dong: di vao bi keo lai
  const G2 = R.makeGeo(MAPS.hhd);
  for (const gt of MAPS.hhd.gates) G2.setBlock(gt, true);
  const gate = MAPS.hhd.gates[0];
  p1.u([['dev', 'tp', 192, 650]], false); p1.x = 192; p1.y = 650; await sleep(300);
  const pb = p1.ev.filter(e => e[0] === 'pos').length;
  for (let i = 0; i < 8; i++) { p1.y -= 6; p1.u(); await sleep(200); }
  ok(p1.ev.filter(e => e[0] === 'pos').length > pb && p1.y > gate.y0, 'Cong tang 2 dong thi khong di qua duoc');
  ok(p1.snap.tl > 570 && p1.snap.tl <= 600, `Dong ho Dungeon dem nguoc tu 10 phut (con ${p1.snap.tl} giay)`);
  const xp0 = p1.ev.filter(e => e[0] === 'xp').length;
  p1.u([['dev', 'kill', 1]], false); await sleep(500);
  ok(p1.has('gate', e => e[1] === 1), 'Ha het quai tang 1 thi cong tang 2 mo');
  ok(p1.ev.filter(e => e[0] === 'xp').length === xp0, 'Quai trong hang chua cho EXP, tien (giu lai toi khi ha Boss)');
  // di bo qua cong tang 2 len tang 2 (ban do khong bi bit)
  p1.u([['dev', 'tp', 192, 660]], false); p1.x = 192; p1.y = 660; await sleep(300);
  const pw = p1.ev.filter(e => e[0] === 'pos').length;
  for (let i = 0; i < 20; i++) { p1.y -= 6; p1.u(); await sleep(200); }
  ok(p1.ev.filter(e => e[0] === 'pos').length === pw && p1.y < 560, `Cong mo thi di bo qua duoc len tang 2 (y ${p1.y})`);
  // het 5 phut: phong lam lai tu dau, ve dau hang, mat thuong da tich
  const nm = p1.ev.filter(e => e[0] === 'map').length;
  p1.u([['dev', 'dclock', 600]], false); await sleep(700);
  const rm = p1.ev.filter(e => e[0] === 'map');
  ok(rm.length > nm && rm[rm.length - 1][1] === 'hhd' && rm[rm.length - 1][6] === 0 && p1.has('log', e => /Hết 10 phút/.test(e[1])), 'Het 10 phut: ve dau hang, cong dong lai');
  ok(p2.has('log', e => /làm lại từ đầu/.test(e[1])), 'Dong doi cung bi dua ve dau hang');
  await sleep(400);
  ok([...p1.mobs.values()].some(m => kinds[m[1]] === 'saltslime' && (m[8] & 1)) && p1.snap.tl > 595, `Quai tang 1 sinh lai, dong ho chay lai (con ${p1.snap.tl} giay)`);
  p1.u([['dev', 'kill', 1]], false); await sleep(500);
  p1.u([['dev', 'kill', 2]], false); await sleep(500);
  ok(p1.has('gate', e => e[1] === 2), 'Ha het quai tang 2 (ca Tinh Anh) thi cong tang 3 mo');
  // den ngu: dung gan Boss cho Boss danh thuc, dung ngoai vung sang thi Buon Ngu tang
  p1.u([['dev', 'tp', 192, 168]], false); p1.x = 192; p1.y = 168; await sleep(2500);
  ok(p1.snap.L && typeof p1.snap.zz === 'number', `Boss bat den quet (goc ${p1.snap.L ? p1.snap.L[0] : '-'}°), Buon Ngu ${p1.snap.zz}`);
  for (let i = 0; i < 70 && !p1.has('sl'); i++) {
    // luon dung o phia nguoc voi den
    const a = p1.snap.L ? p1.snap.L[0] + 180 : 90, r = 5 * 8, bx = 192, by = 128;
    p1.x = bx + Math.cos(a * Math.PI / 180) * r; p1.y = by + Math.sin(a * Math.PI / 180) * r;
    p1.u([['dev', 'tp', p1.x, p1.y]], false); await sleep(200);
  }
  ok(p1.has('sl'), 'Dung ngoai vung sang du lau thi ngu gat (su kien sl)');
  p1.u([['dev', 'kill', 'keeper']], false); await sleep(600);
  ok(p1.has('log', e => /Hoàn thành Hang Hải Đăng Cổ/.test(e[1])) && p1.has('loot', e => e[1] === 'manh_hd'), 'Ha Boss: hoan thanh Dungeon, nhan vu khi va Manh Ban Do Hai Dang');
  ok(p2.has('loot'), 'Dong doi trong phong cung nhan thuong');
  ok(p1.has('dmf', e => e[1] === 'Hang Hải Đăng Cổ' && Array.isArray(e[3])) && p2.has('dmf'), 'Ha Boss: ca to doi nhan bang vinh danh top sat thuong');
  ok(p1.ev.filter(e => e[0] === 'xp').length > xp0 && p1.ev.filter(e => e[0] === 'xp').pop()[1] > 0, `Ha Boss moi nhan EXP, tien da tich trong hang (${p1.ev.filter(e => e[0] === 'xp').pop()[1]} EXP)`);
  await sleep(300);
  ok(p1.snap.tl === -1 && p1.snap.ox > 7 && p1.snap.ox <= 10, `Hoan thanh: dong ho dung, dem nguoc ${p1.snap.ox} giay roi tu ra`);
  ok(p1.has('loot', e => e[1] === 'hp2'), 'Qua Boss co them Binh Mau Vua');
  await sleep(10500);
  ok(p1.ev.filter(e => e[0] === 'map').pop()[1] === 'dbm' && p2.ev.filter(e => e[0] === 'map').pop()[1] === 'dbm', 'Het 10 giay: ca to doi tu ra, ve Dao Binh Minh truoc cua hang');
  const ex = MAPS.hhd.items.find(i => i.cat === 'exit'); void ex;
  void door;
  ok(p1.has('ach', e => e[1] === 'hhd1') && p1.has('log', e => /Lần đầu clear/.test(e[1])), 'Clear lan dau: thanh tuu Ngon Den Da Tat, bao lan sau quai con 50% EXP');
  // nhanh ky nang Lv20
  p1.u([['dev', 'lv', 19]], false); await sleep(300);
  p1.u([['sk', 'thuy', null]], false); await sleep(400);
  ok(p1.has('log', e => /Không chọn được nhánh/.test(e[1])), 'Chua du Lv20 thi khong chon duoc nhanh');
  p1.u([['dev', 'lv', 20]], false); await sleep(5200);             // het giao tranh (5 giay sau don cuoi)
  p1.u([['sk', 'thuy', null]], false); await sleep(400);
  const skE = () => [...p1.ev].reverse().find(e => e[0] === 'sk');
  ok(skE() && skE()[1] === 'thuy' && skE()[2] === null && p1.has('ach', e => e[1] === 'branch'), 'Lv20 chon nhanh Thuy Kiem Su, dat thanh tuu Chon Loi Di');
  p1.u([['sk', 'thuy', ['cb.g0', 'cb.thuy.0', 'ps.g0']]], false); await sleep(400);
  ok(JSON.stringify(skE()[2]) === JSON.stringify(['cb.g0', 'cb.thuy.0', null]), `Gan o ky nang: ky nang class khac bi bo (${JSON.stringify(skE()[2])})`);
  p1.u([['sk', 'khong_co', null]], false); await sleep(400);
  ok(skE()[1] === 'thuy', 'Nhanh khong co that bi tu choi');
}

p1.ws.close(); await sleep(300);
const p1b = await connect(a1);
ok(p1b.hi.char.exp > 0 || p1b.hi.char.lv > 1, `Dang nhap lai van giu EXP (Lv${p1b.hi.char.lv}, ${p1b.hi.char.exp} EXP)`);
ok((!dev || p1b.hi.char.bag.some(b => b.k === 'manh_hd')) && p1b.hi.char.bag.some(b => b.k === 'hp1'), 'Dang nhap lai van giu tui do');
const A = p1b.hi.char.ach || {};
ok(A.kill > 0 && A.done && A.done.kill1 && (!dev || (A.clr.hhd === 1 && A.best.hhd > 0 && p1b.hi.char.br === 'thuy')), `Dang nhap lai van giu thanh tuu (${A.kill} quai, clear hang ${A.clr ? A.clr.hhd : 0} lan) va nhanh ky nang`);
// so lieu dung chung: EXP Dungeon lan sau, trang suc, nhanh
ok(R.cleared(p1b.hi.char, 'hhd') === !!dev && R.REPEAT_EXP === .5, 'Da clear hang: quai trong hang con 50% EXP');
ok(R.hero('cb', 20, { vk: R.newItem('vk_cb_10'), day: R.newItem('day_10'), bong: R.newItem('bong_lua_10') }).el.lua > .07, 'Trang suc: Bong Tai Hoa Ngoc cong sat thuong Lua');
ok(Object.keys(R.BRANCHES).every(k => R.BRANCHES[k].length === (k === 'nd' ? 0 : 2)) && Object.values(R.SKILL).length === 90, '10 class co 2 nhanh, moi nhanh 3 ky nang (90 ky nang tinh ca ky nang goc)');
{
  const c = { cls: 'nd', bag: [], tien: 0, eq: R.starterEq('nd') };
  R.bagAdd(c, { k: 'hat_lua_mi', n: 1 });
  const w = [R.doPlant(c, 0, 'hat_lua_mi', 0), R.doHarvest(c, 0, 1000)[0], R.doHarvest(c, 0, 240001, () => .99)];
  ok(w[0] === '' && /chưa chín/.test(w[1]) && w[2][0] === '' && w[2][1] === 4 && R.bagCount(c, 'lua_mi') === 4, 'Nong Dan: trong Lua Mi, 4 phut sau thu hoach 2-4 Lua Mi');
  ok(R.doCook(c, 'banh_mi') === '' && R.bagCount(c, 'banh_mi') === 1 && R.bagCount(c, 'lua_mi') === 1 && R.doCook(c, '__proto__') !== '', 'Nau Banh Mi tu 3 Lua Mi; mon khong co thi tu choi');
  ok(R.hero('cb', 1, { bong: R.newItem('bong_may_1') }).may === .05 && R.hero('cb', 1, { bong: R.newItem('bong_toc_1') }).aspd > R.hero('cb', 1, {}).aspd, 'Bong tai khong nguyen to: May man, Toc danh');
}
ok((p1b.hi.char.fr || []).includes(p2.hi.char.name), 'Dang nhap lai van giu danh sach ban');
p1b.u([['fr', p2.hi.char.name]], false); await sleep(400);
ok(last(p1b, 'fl')[1].length === 0 && last(p2, 'fl') && !p2.has('log', e => /lỗi/.test(e[1])), 'Xoa ban: danh sach trong');
p1b.ws.close(); p2.ws.close();
console.log(fail ? `\n${fail} muc loi` : '\nTat ca deu dat');
process.exit(fail ? 1 : 0);
