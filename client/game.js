/* LazyEyes – ban choi thu Dao Binh Minh (choi mot minh, hoac nhieu nguoi khi co may chu: data/server.js).
   Khong dung thu vien ngoai: canvas 2D cho the gioi, DOM cho giao dien.
   Ban do, va cham, diem quai lay tu data/dbm.js va data/hhd.js (Dungeon Hang Hai Dang Co).
   Chi so lay tu Bang Chi So Nen va Bang Can Bang; 11 class va ky nang goc lay tu tai lieu Nhanh, Ky Nang; trang bi tu Vat Pham & Che Tao.
   Hinh nhan vat: data/class_sprites.js (class_sprites.py). Don vi: 1 m = 1 o ban do = 8 px nghe thuat. */
(() => {
'use strict';
const SPR = window.LAZ_SPRITES, SPRC = window.LAZ_CLASS_SPRITES, ICO = window.LAZ_ICONS, SKI = window.LAZ_SKILL_ICONS;
const TMP = window.LAZ_TMP_ICONS || { img: '', f: {} };            // bieu tuong tam: ky nang nhanh, noi tai, trang suc (bieu_tuong_tam.py, nhap_nhanh.py)
const RIENG = window.LAZ_ICON_RIENG || { img: '', f: {} };       // bieu tuong tach rieng tung file: trang suc, nong trai (icon_rieng.py)
const VHD = window.LAZ_VAT_HD || { img: '', f: {} };               // hinh net cao cho do vat, dan lang Dao Binh Minh (nhap_vat.py)
// ve khung i cua dbm_vat: co ban HD thi ve ban HD cung kich thuoc
function drawVat(i, x, y, w, h) { const f = MAP.frames[i], d = MAP.key === 'dbm' && IMG.vathd && VHD.f[i]; if (d) ctx.drawImage(IMG.vathd, d[0], d[1], d[2], d[3], x, y, w, h); else ctx.drawImage(IMG.vat, f[0], f[1], f[2], f[3], x, y, w, h); }
const T = window.LAZ_T || (x => x);                            // dich theo ngon ngu dang chon (data/i18n.js)
// atlas hinh co truong s = so pixel anh tren 1 pixel the gioi (img/nguon -> nhap_hinh.py xuat ban net gap doi)
const fW = (sh, f) => f[2] / (sh.s || 1), fH = (sh, f) => f[3] / (sh.s || 1);
// so lieu va luat dung chung voi may chu: data/rules.js
const R = window.LAZ_RULES;
const { BAC, LOAI, CLASSES, CLS_ORDER, RACES, RACE_ORDER, BACKGROUNDS, BG_ORDER, ITEMS, SLOTS, SLOT_TEN, RARITY, STAT_TEN,
  expNeed, MAX_LV, CRIT, CRIT_X, DODGE, MOVE_ATK, DAY, NIGHT_FROM, rnd, irnd, clamp, dist, money } = R;
const PX = 8;                             // px moi met
const SPEED = 5 * PX, SHOT_SPEED = 30 * PX;               // 5 m/giay
const $ = id => document.getElementById(id);

// ---------------- choi mang ----------------
// Dia chi may chu: data/server.js (window.LAZ_SERVER) hoac ?server=... tren thanh dia chi; ?offline de choi mot minh.
const QS = new URLSearchParams(location.search);
const SERVER = String(QS.get('server') || window.LAZ_SERVER || '').replace(/\/$/, '');
const ONLINE = !!SERVER && !QS.has('offline');
const ACC_KEY = 'lazyeyes_acc';
const net = { ws: null, me: 0, out: [], sentAt: 0, last: '', beat: 0, rate: 1, shop: .05, others: new Map(), kinds: [], byId: new Map(), up: false, tries: 0,
  zi: 0, zseq: 0, off: null, party: null, zz: null, lamp: null, gates: 0 };
const FACE_IDX = { xuong: 0, len: 1, phai: 2 }, FACE_OF = ['xuong', 'len', 'phai'];
function loadAcc() { try { const a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); return a && a.server === SERVER ? a : null; } catch (e) { return null; } }
function saveAcc(a) { try { localStorage.setItem(ACC_KEY, JSON.stringify(a)); } catch (e) { /* trinh duyet chan luu */ } }
const send = ev => { if (ONLINE) net.out.push(ev); };          // hang doi su kien, gui ngay o khung hinh ke tiep
const shopRate = () => (ONLINE ? net.shop : .05);

// ---------------- tai anh ----------------
const IMG = {};
let nLoad = 0, nDone = 0;                                       // tien do man tai: 46% = file du lieu, phan con lai = hinh
const LZ = window.LZL || { set() {}, msg() {}, done() {}, fail() {} };
function load(name, src) { nLoad++; return new Promise((ok, bad) => { const im = new Image(); im.onload = () => { IMG[name] = im; nDone++; LZ.set(.46 + .5 * nDone / nLoad); ok(); }; im.onerror = () => bad(src); im.src = src + (/\?/.test(src) ? '' : '?v=' + IMG_VER); }); }
const IMG_VER = '20261014b';                                  // doi so nay khi thay hinh de trinh duyet tai lai

// ---------------- ban do hien tai (dao hoac Dungeon) ----------------
const cv = $('world'), ctx = cv.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
let Z = 3, VW = 0, VH = 0, cam = { x: 0, y: 0 };
let MAP = window.LAZ_MAPS.dbm, GEO = R.makeGeo(MAP), items = [], SPAWN = { x: 0, y: 0 };
const canStand = (x, y) => GEO.canStand(x, y), moveBy = (e, dx, dy) => GEO.moveBy(e, dx, dy), lineFree = (a, b) => GEO.lineFree(a, b);
const findPath = (sx, sy, tx, ty) => GEO.findPath(sx, sy, tx, ty);
const BUCKET = 64;
let BW = 1, BH = 1, buckets = [], seenMark = new Uint32Array(1), frameNo = 0;
function setMap(key) {
  MAP = window.LAZ_MAPS[key]; GEO = R.makeGeo(MAP);
  items = MAP.items.map(it => ({ ...it }));
  const sp = items.find(it => it.spawn);
  SPAWN = MAP.start ? { ...MAP.start } : { x: sp.x, y: sp.y + 46 };
  BW = Math.ceil(MAP.W / BUCKET); BH = Math.ceil(MAP.H / BUCKET);
  buckets = Array.from({ length: BW * BH }, () => []);
  MAP.objs.forEach((o, i) => {
    const f = MAP.frames[o.f];
    for (let by = Math.max(0, Math.floor(o.y / BUCKET)); by <= Math.min(BH - 1, Math.floor((o.y + f[3]) / BUCKET)); by++)
      for (let bx = Math.max(0, Math.floor(o.x / BUCKET)); bx <= Math.min(BW - 1, Math.floor((o.x + f[2]) / BUCKET)); bx++) buckets[by * BW + bx].push(i);
  });
  seenMark = new Uint32Array(Math.max(1, MAP.objs.length));
  for (const k of ['nen', 'vat', 'mini', 'suong']) IMG[k] = IMG[k + '_' + key] || null;
  mobs.length = 0; net.byId.clear(); shots.length = 0; bombs.length = 0; summons.length = 0; effects.length = 0;
  npcs.length = 0; spawnNpcs();
  P.target = null; P.path = null; P.dash = null; zone = null; net.lamp = null;
  if (MAP.gates) setGates(0);
  mini.hidden = !showMini;
}
function setGates(open) {
  net.gates = open;
  (MAP.gates || []).forEach((g, i) => GEO.setBlock(g, i >= open));
}

// ---------------- trang thai ----------------
const P = {
  x: 0, y: 0, face: 'xuong', flip: false, lv: 1, exp: 0, tien: 0, cls: 'cb',
  name: '', race: 'human', gender: 'm', outfit: 0, bg: 'linh', say: 0, line: '', eq: null, bag: [], br: null, sl: null, ach: {},
  hp: 0, st: 0, mp: 0, stPause: 0, atkCd: 0, cds: [0, 0, 0], dodge: 0, dodgeDir: null, dodgeCd: 0, combat: 0, path: null, target: null,
  fx: {}, shield: 0, chan: 0, hot: null, sleep: 0,
  block: 0, nextCrit: false, perfectUsed: false, buffer: null, dash: null,
  anim: 0, atkAnim: 0, moving: false, dead: 0,
};
let expRate = 5;
const S = () => R.hero(P.cls, P.lv, P.eq || undefined, P.br);
const SKS = () => R.skillsOf(P);                                // 3 o ky nang dang gan (goc hoac nhanh)
const C = () => CLASSES[P.cls];
const fxv = k => (P.fx[k] ? P.fx[k].v : 0);                 // bua loi dang co: atk, aspd, crit, def, ev
const skCost = sk => R.skCost(sk, P.lv);
const mobs = [], npcs = [], floats = [], shots = [], bombs = [], effects = [], summons = [];
let clock = 60, zone = null, dialogOpen = false, showMini = true, lastSave = 0;

function save() {
  if (ONLINE) return;                                               // choi mang: may chu luu nhan vat
  try {
    localStorage.setItem('lazyeyes_dbm', JSON.stringify({ lv: P.lv, exp: P.exp, tien: P.tien, x: P.x, y: P.y, fast: expRate > 1, cls: P.cls,
      name: P.name, race: P.race, gender: P.gender, outfit: P.outfit, bg: P.bg, eq: P.eq, bag: P.bag, br: P.br, sl: P.sl, ach: P.ach, farm: P.farm }));
  } catch (e) { /* trinh duyet chan luu: bo qua */ }
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem('lazyeyes_dbm') || 'null');
    if (!d) return false;
    Object.assign(P, { lv: d.lv, exp: d.exp, tien: d.tien, cls: CLASSES[d.cls] ? d.cls : 'cb' });
    // ban luu cu (truoc khi co tao nhan vat): doan chung toc theo phe cua class
    const phe = CLASSES[P.cls].phe;
    Object.assign(P, { name: d.name || '', race: RACES[d.race] ? d.race : (phe === 'Phe 2' ? 'elf' : phe === 'Phe 3' ? 'undead' : 'human'),
      gender: d.gender === 'f' ? 'f' : 'm', outfit: Math.min(2, Math.max(0, d.outfit | 0)), bg: BACKGROUNDS[d.bg] ? d.bg : 'linh' });
    // ban luu truoc khi co tui do: mac bo do tan thu
    P.eq = d.eq || R.starterEq(P.cls); P.bag = Array.isArray(d.bag) ? d.bag : []; P.farm = d.farm || null;
    P.br = d.br || null; P.sl = Array.isArray(d.sl) ? d.sl : null; P.ach = d.ach || {};
    if (!d.eq) R.bagAdd(P, { k: 'hp1', n: 5 });
    if (canStand(d.x, d.y)) { P.x = d.x; P.y = d.y; }
    expRate = d.fast === false ? 1 : 5;
    return true;
  } catch (e) { return false; }
}

// ---------------- NPC ----------------
function spawnNpcs() {
  if (MAP.key !== 'dbm') return;
  for (const n of MAP.npcs) npcs.push({ x: n.x, y: n.y, home: { x: n.x, y: n.y }, frame: n.frame, wait: rnd(1, 6), dest: null, flip: Math.random() < .5, say: 0, line: '' });
  npcs.push({ x: SPAWN.x + 16, y: SPAWN.y - 8, home: null, seren: true, wait: 1e9, flip: true, say: 0, line: '' });
  // Cho Cang: Ba Mira ban hang, Tho Ren Bram sua do
  for (const [N, k] of [[R.SHOP_NPC, 'shop'], [R.SMITH_NPC, 'smith']])
    npcs.push({ x: N.x, y: N.y, home: null, frame: MAP.npcs[N.frame].frame, wait: 1e9, flip: false, say: 0, line: '', [k]: true, tag: N.ten + ' · ' + N.vai });
}

// ---------------- quai (choi mot minh) ----------------
function zoneOf(x, y, cat) {
  let best = null;
  for (const it of items) if ((!cat || it.cat === cat) && it.cat !== 'light' && x >= it.x0 && x <= it.x1 && y >= it.y0 && y <= it.y1)
    if (!best || (it.x1 - it.x0) * (it.y1 - it.y0) < (best.x1 - best.x0) * (best.y1 - best.y0)) best = it;
  return best;
}
const makeMob = (kind, x, y, opts = {}) => R.makeMob(kind, x, y, PX, opts);
function spawnMobs() {
  if (!ONLINE) for (const p of MAP.mobs) { const at = GEO.freeSpot(p.x, p.y); mobs.push(Object.assign(makeMob(p.kind, at.x, at.y), { origin: true })); }   // choi mang: quai do may chu gui
}
const isNight = () => clock % DAY >= NIGHT_FROM;
function mobVisible(m) { return m.alive && (ONLINE ? !m.hidden : (!m.t.dem || isNight())); }
// moi truong cho AI quai dung chung (rules.js) khi choi mot minh: chi co mot nguoi choi
const OFF = {
  G: null, PX,
  target: m => ((m.state === 'chase' || m.state === 'flee') && !P.dead && !P.fx.stealth ? P : null),
  nearest: (m, r) => (!P.dead && !P.fx.stealth && dist(m, P) < r ? P : null),
  hurtBy: () => true, retarget: () => {}, aggro: m => aggro(m),
  strike: (m, _, w) => strikeOffline(m, w),
  split: m => splitSlime(m),
  respawn: m => Object.assign(m, makeMob(m.kind, m.home.x, m.home.y), { origin: true }),
  visible: m => mobVisible(m), tickDots: (m, dt) => tickDots(m, dt),
  evaded: m => addFloat(m, 'Về chỗ', '#cfe8ff'),
};

const mobRed = m => R.mobRed(m.def, P.lv);
// tra ve sat thuong da gay (0 neu truot)
function hitMob(m, mult, opts = {}) {
  if (!mobVisible(m)) return 0;
  if (ONLINE) {
    // may chu tinh sat thuong, EXP, tien; o day chi gui yeu cau va uoc luong (cho Hut Sinh Luc)
    send(['h', m.id, opts.s != null ? opts.s : -1]);
    if (P.fx.stealth && !opts.ally) delete P.fx.stealth;
    P.combat = 5;
    return m.evade ? 0 : R.dmgToMob(S(), S().atk * (1 + fxv('atk')), m, P.lv, mult, R.hitEl(P, opts.s != null ? opts.s : -1), false);
  }
  if (P.fx.stealth && !opts.ally) { delete P.fx.stealth; addFloat(P, 'Hiện hình', '#cfc8ff'); }   // ra don thi hien hinh
  P.combat = 5;
  if (m.evade) { addFloat(m, 'Miễn nhiễm', '#cfe8ff'); return 0; }
  const diff = Math.max(0, m.lv - P.lv);
  if (Math.random() < .02 * Math.min(15, diff)) { addFloat(m, 'Trượt', '#ddd'); return 0; }
  const s = S(), el = R.hitEl(P, opts.s != null ? opts.s : -1), ek = R.elMul(m, el);
  if (!ek) { addFloat(m, 'Miễn ' + R.EL[el], '#ddd'); if (m.state === 'idle') aggro(m); return 0; }
  const crit = !opts.noCrit && (P.nextCrit || Math.random() < Math.min(R.CAP.crit, s.crit + fxv('crit')));
  if (!opts.noCrit) P.nextCrit = false;
  const atk = s.atk * (1 + fxv('atk')) * (1 + (RACES[P.race].nightDmg && isNight() ? RACES[P.race].nightDmg : 0));   // Ac Ma: +5% ban dem
  const dmg = R.dmgToMob(s, atk, m, P.lv, mult, el, crit);
  m.hp -= dmg; m.hurt = .12;
  addFloat(m, (crit ? dmg + '!' : '' + dmg), crit ? '#FFD45A' : (opts.color || (ek > 1 ? R.EL_COL[el] : '#FFFFFF')), crit);
  if (ek > 1 && (!m.weakAt || (performance.now() / 1000) - m.weakAt > 4)) { m.weakAt = (performance.now() / 1000); addFloat(m, 'Yếu ' + R.EL[el] + '!', R.EL_COL[el]); }
  if (m.state === 'idle' || m.state === 'return') aggro(m);
  if (m.hp <= 0) killMob(m);
  else if (m.t.co === 'chay' && m.hp < m.max * .3 && !m.fledOnce) { m.fledOnce = true; m.state = 'flee'; m.flee = 4; log(m.t.ten + ' bỏ chạy!', ''); }
  return dmg;
}
// sat thuong theo thoi gian (chay mau, doc, An Tu Vong): % Cong moi giay, chot luc gay
function addDot(m, pct, secs, col, el = 'vatly') {
  if (ONLINE || m.evade) return;                                    // may chu tu tinh chay mau / doc theo ky nang
  const dmg = R.dmgToMob(S(), S().atk * (1 + fxv('atk')), m, P.lv, pct, el, false);
  if (!dmg) { addFloat(m, 'Miễn ' + R.EL[el], '#ddd'); return; }
  m.dots.push({ dmg, left: secs, tick: 1, col });
}
function tickDots(m, dt) {
  for (let i = m.dots.length - 1; i >= 0; i--) {
    const d = m.dots[i];
    d.tick -= dt;
    if (d.tick > 0) continue;
    d.tick += 1; d.left--;
    m.hp -= d.dmg; P.combat = 5;
    addFloat(m, '' + d.dmg, d.col);
    if (m.state === 'idle' || m.state === 'return') aggro(m);
    if (d.left <= 0) m.dots.splice(i, 1);
    if (m.hp <= 0) { killMob(m); return; }
  }
}
function aggro(m) {
  if (m.evade || m.state === 'chase' || m.state === 'flee') return;
  m.state = 'chase'; m.engaged = 0; m.best = 1e9; m.noReach = 0;
  if (m.t.co === 'bay') for (const o of mobs) if (o !== m && o.kind === m.kind && o.alive && dist(o, m) < 10 * PX && o.state !== 'chase' && !o.evade) { o.state = 'chase'; o.engaged = 0; o.best = 1e9; o.noReach = 0; }
}
function killMob(m) {
  m.alive = false; m.dying = .4; m.respawn = m.origin ? rnd(20, 32) : 0; m.wind = null; m.dash = null;
  if (P.target === m) P.target = null;
  const ex = Math.max(1, Math.round(R.killExp(m.exp, m.lv, P.lv) * expRate));   // Bang Chi So Nen: EXP theo chenh lech cap
  P.tien += m.tien;
  log(`+${ex} EXP · +${m.tien} Đồng`, 'exp');
  achShow(R.achKill(P, m.kind));
  for (const it of [R.dropFor(m, P.cls), R.potionDrop(m, P.cls)]) {
    if (!it) continue;
    const name = itemName(it) + (it.n > 1 ? ' ×' + it.n : ''), why = R.bagAdd(P, it);
    log(why ? `Túi đầy, bỏ lại ${name}.` : `Nhặt được ${name}!`, why ? 'bad' : 'gold');
    if (!why) { addFloat(m, name, RARITY[it.r || 0].col, true); renderInv(); }
  }
  gainExp(ex);
}
function gainExp(ex) {
  if (P.lv >= MAX_LV) return;
  P.exp += ex;
  while (P.lv < MAX_LV && P.exp >= expNeed(P.lv)) {
    P.exp -= expNeed(P.lv); P.lv++;
    const s = S(); P.hp = s.hp; P.st = s.st;
    log(`Lên cấp ${P.lv}! Máu ${s.hp}, Công ${s.atk}`, 'good');
    addFloat(P, 'Lên cấp!', '#9EE493', true);
    if (P.lv === MAX_LV) log('Đủ Lv20: ra Bến Tàu Lớn để lên tàu về thủ phủ phe.', 'good');
    if (P.lv === R.BRANCH_LV) log('Đủ Lv20: mở Bảng kỹ năng (K) để chọn nhánh.', 'good');
    achShow(R.achCheck(P));
  }
  save();
}
// het gong (choi mot minh): xet nguoi choi co dung trong vet do khong
function strikeOffline(m, w) {
  let inside;
  if (w.kind === 'line') {
    const rx = P.x - w.x, ry = P.y - w.y, along = rx * w.ux + ry * w.uy, side = Math.abs(-rx * w.uy + ry * w.ux);
    inside = along >= -3 && along <= w.len + 3 && side <= w.w / 2 + 2;
  } else inside = Math.hypot(P.x - w.x, P.y - w.y) <= w.r + 2;
  if (m.blindT > 0) { if (inside) addFloat(m, 'Mù · trượt', '#ddd'); return; }
  if (inside) hitPlayer(m, w.mult, m.t.dmg === 'phep');
  else if (dist(m, P) < 4 * PX) addFloat(P, 'Tránh', '#cfe8ff');
}
function splitSlime(m) {
  m.split = true;
  const half = Math.max(1, Math.round(m.hp / 2));
  const kid = makeMob(m.kind, m.x + 6, m.y + 2, { lv: m.lv, child: true });
  kid.max = m.max; kid.hp = half; kid.state = 'chase'; kid.home = m.home; m.hp = half;
  mobs.push(kid);
  log(m.t.ten + ' tách đôi!', '');
}
// bi quai danh. phep: giam bang Khang phep (Ma Troi, Nguoi Gac Den). Quai cao cap hon danh dau hon (07/10/2026)
function hitPlayer(m, mult, phep) {
  if (P.dead) return;
  if (P.dodge > 0) {
    // chot 04/10/2026: ne trong 0,2 giay cuoi truoc khi trung don thi duoc thuong
    if (DODGE.time - P.dodge <= DODGE.perfect && !P.perfectUsed) {
      P.perfectUsed = true; P.nextCrit = true; P.st = Math.min(S().st, P.st + 10); send(['pc']);
      addFloat(P, 'Né đúng lúc!', '#FFD45A', true);
      log('Né đúng lúc: +10 Thể Lực, nhát kế tiếp chắc chắn chí mạng.', 'good');
    } else addFloat(P, 'Né', '#cfe8ff');
    return;
  }
  const s = S();
  if (Math.random() < s.ne + fxv('ev')) { addFloat(P, 'Né', '#cfe8ff'); return; }     // ne tranh: giap nhe, noi tai class, Tung Hung
  const def = phep ? s.mres * (1 + (RACES[P.race].mres || 0)) : s.def * (1 + fxv('def'));
  const red = Math.min(.75, def / (def + 50 + 10 * m.lv));
  let dmg = Math.max(1, Math.round(m.atk * mult * R.mobDmgMul(m.lv, P.lv) * (1 - red)));
  if (P.block > 0) dmg = Math.max(1, Math.round(dmg * .5));
  if (P.chan > 0) { P.chan = 0; log('Thiền Định bị ngắt.', 'bad'); }
  if (P.shield > 0) {
    const ab = Math.min(P.shield, dmg); P.shield -= ab; dmg -= ab;
    if (P.shield <= 0) delete P.fx.shield;
    if (!dmg) { addFloat(P, 'Khiên −' + ab, '#9fc8ff'); P.combat = 5; return; }
  }
  P.hp -= dmg; P.combat = 5;
  if (m.id) send(['ht', m.id, dmg]);
  addFloat(P, (P.block > 0 ? 'Đỡ −' : '−') + dmg, P.block > 0 ? '#cfe8ff' : '#FF7B6B');
  if (P.hp <= 0) die();
}
function die() {
  P.hp = 0; P.dead = 3; P.path = null; P.target = null; P.sleep = 0; P.hot = null;
  $('dead').hidden = false; send(['d']);
  if (!ONLINE) { R.wear(P, 10); renderInv(); }
  log('Bạn đã gục. Mỗi món trang bị mất 10% độ bền.', 'bad');
  save();
}

// ---------------- nguoi choi ----------------
const keys = new Set();
const asleep = () => P.sleep > 0;
function nearestMob(r) {
  let best = null, bd = r;
  for (const m of mobs) if (mobVisible(m)) { const d = dist(m, P); if (d < bd) { bd = d; best = m; } }
  return best;
}
function basicAttack() {
  if (P.dead || asleep()) return;
  if (P.dodge > 0) { P.buffer = { act: 'atk' }; return; }          // nho lenh, ra ngay khi ne xong
  const R2 = Math.max(6, C().tam) * PX;
  if (!P.target || !mobVisible(P.target) || dist(P.target, P) > R2) P.target = nearestMob(R2);
  if (!P.target) log('Không có quái ở gần.', '');
}
function pickTarget(r) { return P.target && mobVisible(P.target) && dist(P.target, P) <= r ? P.target : nearestMob(r); }
function shoot(t, mult, look, opts = {}, delay = 0, s = -1) { shots.push({ x: P.x, y: P.y - 7, a: 0, t, mult, look, opts, delay, s }); P.combat = 5; }
function shotHit(b) {
  const t = b.t, o = b.opts || {};
  const dmg = hitMob(t, b.mult, { s: b.s });
  if (!dmg) return;
  skillFx(t, o, dmg);
}
// hieu ung kem don ky nang: hut mau (luon tinh o may khach), cham; choi mot minh them chay mau/doc, choang, mu (choi mang do may chu tinh)
function skillFx(t, sk, dmg) {
  if (!sk || !dmg) return;
  if (sk.drain) { const s = S(), v = Math.max(1, Math.round(dmg * sk.drain)); P.hp = Math.min(s.hp, P.hp + v); addFloat(P, '+' + v, '#9EE493'); }
  if (!t.alive) return;
  if (sk.slow && !t.t.noCC) { t.slowT = sk.slow[1]; t.slowV = sk.slow[0]; if (!ONLINE) addFloat(t, 'Chậm', '#9FE3FF'); }
  if (ONLINE) return;
  if (sk.dot) addDot(t, sk.dot[0], sk.dot[1], sk.poison ? '#9BE36A' : '#FF6B6B', sk.dotEl || sk.el || 'vatly');
  if (sk.stun) ccOff(t, 'Choáng', '#FFD45A', () => { t.rootT = Math.max(t.rootT, sk.stun); t.wind = null; t.atkCd = Math.max(t.atkCd, sk.stun); });
  if (sk.blind) ccOff(t, 'Mù', '#ddd', () => { t.blindT = sk.blind; t.wind = null; });
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const b = shots[i];
    const from = b.q || P;
    if (b.delay > 0) { b.delay -= dt; b.x = from.x; b.y = from.y - 7; continue; }
    const t = b.t;
    if (!mobVisible(t)) { shots.splice(i, 1); continue; }
    const dx = t.x - b.x, dy = t.y - 5 - b.y, d = Math.hypot(dx, dy), st = SHOT_SPEED * dt;
    b.a = Math.atan2(dy, dx);
    if (d <= st) { shots.splice(i, 1); if (!b.q) shotHit(b); } else { b.x += dx / d * st; b.y += dy / d * st; }
  }
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.t -= dt;
    if (b.t > 0) continue;
    bombs.splice(i, 1);
    effects.push({ kind: 'ring', x: b.x, y: b.y, r: b.r, col: '#FF9A4A', t: 0, total: .35 });
    for (const m of mobs) if (mobVisible(m) && Math.hypot(m.x - b.x, m.y - b.y) <= b.r + 3 + (m.t.reach || 0) * PX) skillFx(m, b.sk, hitMob(m, b.mult, { s: b.s }));
  }
  for (let i = effects.length - 1; i >= 0; i--) { effects[i].t += dt; if (effects[i].t >= effects[i].total) effects.splice(i, 1); }
}
function ring(x, y, rM, col) { effects.push({ kind: 'ring', x, y, r: rM * PX, col, t: 0, total: .4 }); }
// bo xuong cua Hon Nguc: di theo chu, danh muc tieu cua chu hoac quai dang duoi chu
function updateSummons(dt) {
  for (let i = summons.length - 1; i >= 0; i--) {
    const k = summons[i];
    k.t -= dt; k.atkCd -= dt; k.hit = Math.max(0, k.hit - dt);
    if (k.t <= 0 || P.dead) { summons.splice(i, 1); continue; }
    let t = P.target && mobVisible(P.target) ? P.target : null;
    if (!t) { let bd = 10 * PX; for (const m of mobs) if (mobVisible(m) && m.state === 'chase') { const d = dist(m, k); if (d < bd) { bd = d; t = m; } } }
    if (!t && dist(k, P) > 20 * PX) { k.x = P.x + 10; k.y = P.y + 4; }
    const goal = t || { x: P.x + 10, y: P.y + 4 }, d = dist(goal, k), want = 1.4 * PX + (t && t.t.reach ? t.t.reach * PX * .6 : 0);
    k.moving = false;
    if (d > want) { const st = Math.min(d - want, 5 * PX * dt); k.moving = moveBy(k, (goal.x - k.x) / d * st, (goal.y - k.y) / d * st); k.anim += dt; }
    if (Math.abs(goal.x - k.x) > 1) k.flip = goal.x < k.x;
    if (t && d <= want + .5 * PX && k.atkCd <= 0) { k.atkCd = 1.5; k.hit = .2; hitMob(t, .3, { noCrit: true, ally: true, color: '#E8E0D0', s: -2 }); }
  }
}
// nguoi choi khac dung ky nang: hien ten ky nang va hieu ung (chi de nhin, sat thuong do may chu tinh)
function otherCast(n, si, tid) {
  const q = net.others.get(n), c = q && CLASSES[q.cls], sk = typeof si === 'string' ? R.SKILL[si] : c && c.skills[si];
  if (!sk || q.zi !== net.zi) return;
  const t = tid ? net.byId.get(tid) : null, col = R.EL_COL[sk.el || sk.dotEl || 'vatly'];
  addFloat(q, sk.ten, sk.kind === 'heal' ? '#9EE493' : col === R.EL_COL.vatly ? '#FFD45A' : col);
  switch (sk.kind) {
    case 'shot': if (t) for (let k = 0; k < (sk.n || 1); k++) shots.push({ x: q.x, y: q.y - 7, a: 0, t, look: sk.look, q, delay: k * .14 }); break;
    case 'dice': if (t) shots.push({ x: q.x, y: q.y - 7, a: 0, t, look: 'dice', q, delay: 0 }); break;
    case 'grenade': if (t) ring(t.x, t.y, sk.aoe, '#FF9A4A'); break;
    case 'pierce': if (t) { const d = dist(t, q) || 1; effects.push({ kind: 'beam', x: q.x, y: q.y - 7, ux: (t.x - q.x) / d, uy: (t.y - q.y) / d, len: sk.r * PX, t: 0, total: .2 }); } break;
    case 'curse': case 'root': if (t) ring(t.x, t.y, 1.2, sk.kind === 'root' ? '#7FD36A' : '#B48CFF'); break;
    case 'fear': case 'taunt': ring(q.x, q.y, sk.r, sk.kind === 'fear' ? '#FFB45A' : '#B48CFF'); break;
    case 'blind': effects.push({ kind: 'smoke', x: q.x, y: q.y, r: sk.r * PX, t: 0, total: .8 }); break;
    case 'nova': ring(q.x, q.y, sk.r, col); break;
    case 'heal': case 'shield': case 'buff': case 'summon': ring(q.x, q.y, 1, col); break;
  }
}
function castSkill(i) {
  const c = C(), sk = SKS()[i];
  if (P.dead || P.dash || asleep()) return;
  if (!sk && c.skills.length) { log(`Ô ${i + 1} chưa gắn kỹ năng. Mở Bảng kỹ năng (${keyName(BIND.skills)}) để gắn.`, ''); return; }
  if (!sk) { log(`${c.ten} dùng kỹ năng nghề (cày, gieo, câu cá, hái lượm), không có kỹ năng chiến đấu. Đánh thường và né vẫn dùng được.`, ''); return; }
  if (P.dodge > 0) { P.buffer = { act: 'skill', i }; return; }
  if (P.lv < sk.lv) { log(`${sk.ten} mở ở Lv${sk.lv}.`, ''); return; }
  if (P.cds[i] > 0) return;
  const cost = skCost(sk), pool = sk.C != null ? 'mp' : 'st';
  if (P[pool] < cost) { log(pool === 'mp' ? 'Không đủ Mana.' : 'Không đủ Thể Lực.', 'bad'); return; }
  if (P.chan > 0 && sk.kind !== 'channel') P.chan = 0;
  const at = net.out.length;
  if (!doSkill(sk)) return;
  if (ONLINE) net.out.splice(at, 0, ['c', i, sk.kind === 'dice' ? lastDice : 0, P.target && P.target.id ? P.target.id : 0]);   // bao dung ky nang truoc cac don trung
  P[pool] -= cost; if (pool === 'st') P.stPause = 1;
  P.cds[i] = sk.cd;
}
let lastDice = 0;
// hieu ung khong che khi choi mot minh: Cua An Si lat ngua, Boss khang
function ccOff(m, label, col, apply) {
  if (ONLINE) return;
  if (m.evade) return;
  if (m.t.noCC) { addFloat(m, 'Kháng', '#ddd'); return; }
  if (m.t.co === 'mai') { m.flipT = 4; m.wind = null; addFloat(m, 'Lật ngửa!', '#FFD45A'); return; }
  apply(); addFloat(m, label, col);
}
function doSkill(sk) {
  const si = SKS().indexOf(sk);
  const reach = m => (m.t.reach || 0);
  const need = r => {
    const t = pickTarget(r * PX);
    if (!t) log(`${sk.ten}: cần quái trong vòng ${String(r).replace('.', ',')} m.`, ''); else { P.target = t; faceTo(t); }
    return t;
  };
  const around = (r, f) => { let n = 0; for (const m of mobs) if (mobVisible(m) && dist(m, P) <= (r + reach(m)) * PX && f(m) !== false) n++; return n; };
  let t;
  switch (sk.kind) {
    case 'dash':
      if (!(t = need(sk.r + .5))) return false;
      P.path = null; P.dash = { t, left: Math.max(0, dist(P, t) - (1.2 + reach(t)) * PX), mult: sk.mult, s: si, sk }; P.combat = 5;
      return true;
    case 'block': P.block = sk.t; addFloat(P, sk.ten, '#cfe8ff'); return true;
    case 'buff': P.fx[sk.stat] = { t: sk.t, v: sk.v }; addFloat(P, sk.ten + '!', '#FFB45A', true); return true;
    case 'shot':
      if (!(t = need(sk.r))) return false;
      for (let k = 0; k < (sk.n || 1); k++) shoot(t, sk.mult, sk.look, sk, k * .14, si);
      P.atkAnim = .27;
      return true;
    case 'strike':
      if (!(t = need(C().tam + 1 + (P.target && P.target.t ? reach(P.target) : 0)))) return false;
      P.atkAnim = .27;
      skillFx(t, sk, hitMob(t, sk.mult, { s: si }));
      return true;
    case 'curse':
      if (!(t = need(sk.r))) return false;
      addDot(t, sk.dot[0], sk.dot[1], '#C9A2FF', R.hitEl(P, si, true)); aggro(t); P.combat = 5; ring(t.x, t.y, 1.2, '#B48CFF'); send(['h', t.id, si]);
      return true;
    case 'grenade':
      if (!(t = need(sk.r))) return false;
      bombs.push({ x: t.x, y: t.y, t: sk.delay, total: sk.delay, r: sk.aoe * PX, mult: sk.mult, s: si, sk }); P.atkAnim = .27; P.combat = 5;
      return true;
    case 'pierce': {
      if (!(t = need(sk.r))) return false;
      const d = dist(t, P) || 1, ux = (t.x - P.x) / d, uy = (t.y - P.y) / d, len = sk.r * PX;
      for (const m of mobs) {
        if (!mobVisible(m)) continue;
        const rx = m.x - P.x, ry = m.y - P.y, along = rx * ux + ry * uy, side = Math.abs(-rx * uy + ry * ux);
        if (along >= 0 && along <= len && side <= (.8 + reach(m)) * PX) hitMob(m, sk.mult, { s: si });
      }
      effects.push({ kind: 'beam', x: P.x, y: P.y - 7, ux, uy, len, t: 0, total: .2 }); P.atkAnim = .27;
      return true;
    }
    case 'fear': {
      const n = around(sk.r, m => { if (sk.only && !sk.only.includes(m.t.bac)) return false; ccOff(m, 'Sợ', '#FFB45A', () => { m.fearT = sk.t; m.wind = null; }); send(['h', m.id, si]); });
      ring(P.x, P.y, sk.r, '#FFB45A');
      if (!n) log(`${sk.ten}: không có quái nào bị ảnh hưởng.`, '');
      return true;
    }
    case 'heal': {
      const s = S(), v = Math.round(s.hp * sk.v);
      if (sk.hot) { P.hot = { t: sk.hot, hp: v / sk.hot, mp: 0 }; addFloat(P, sk.ten, '#9EE493', true); }   // hoi theo thoi gian
      else { P.hp = Math.min(s.hp, P.hp + v); addFloat(P, '+' + v, '#9EE493', true); }
      if (sk.wake && net.zz) net.zz = Math.max(0, net.zz - 50);    // giam Buon Ngu (may chu tinh lai)
      return true;
    }
    case 'nova': {                                                  // don quanh minh, trung moi quai trong vong r
      around(sk.r, m => { skillFx(m, sk, hitMob(m, sk.mult, { s: si })); });
      ring(P.x, P.y, sk.r, R.EL_COL[sk.el || 'vatly'] === R.EL_COL.vatly ? '#FFD45A' : R.EL_COL[sk.el]); P.atkAnim = .27; P.combat = 5;
      return true;
    }
    case 'root':
      if (!(t = need(sk.r))) return false;
      ccOff(t, 'Trói', '#9EE493', () => { t.rootT = sk.t; }); aggro(t); ring(t.x, t.y, 1, '#7FD36A'); P.combat = 5; send(['h', t.id, si]);
      return true;
    case 'shield': P.shield = Math.round(S().hp * sk.v); P.fx.shield = { t: sk.t, v: 0 }; addFloat(P, sk.ten, '#9fc8ff'); return true;
    case 'channel': P.chan = sk.t; P.path = null; P.target = null; addFloat(P, sk.ten, '#cfe8ff'); return true;
    case 'taunt': around(sk.r, m => { if (!ONLINE && !m.evade) { aggro(m); m.state = 'chase'; } send(['h', m.id, si]); }); ring(P.x, P.y, sk.r, '#B48CFF'); P.combat = 5; return true;
    case 'stealth':
      P.fx.stealth = { t: sk.t, v: 0 }; P.target = null;
      if (!ONLINE) for (const m of mobs) if (m.state === 'chase') { m.state = 'return'; m.wind = null; }
      addFloat(P, 'Tàng hình', '#cfc8ff');
      return true;
    case 'summon':
      summons.length = 0;
      summons.push({ x: P.x + 10, y: P.y + 4, t: sk.t, atkCd: 1, hit: 0, anim: 0, flip: false });
      addFloat(P, sk.ten, '#E8E0D0'); ring(P.x + 10, P.y + 4, 1, '#E8E0D0');
      return true;
    case 'dice': {
      if (!(t = need(sk.r))) return false;
      let n = 0;
      for (let k = 0; k < (sk.dice || 1); k++) n += irnd(1, 6);
      lastDice = n;
      shoot(t, (sk.mult || .4) * n, 'dice', {}, 0, si); addFloat(P, n + ' chấm', '#FFD45A', true); P.atkAnim = .27;
      return true;
    }
    case 'blind':
      around(sk.r, m => { ccOff(m, 'Mù', '#ddd', () => { m.blindT = sk.t; m.wind = null; }); send(['h', m.id, si]); });
      effects.push({ kind: 'smoke', x: P.x, y: P.y, r: sk.r * PX, t: 0, total: .8 });
      return true;
  }
  return false;
}
function doDodge() {
  const dg = C().dodge;
  if (P.dead || P.dodge > 0 || asleep()) return;
  if (P.dodgeCd > 0) { log(`${dg.ten} còn hồi ${Math.ceil(P.dodgeCd)} giây.`, ''); return; }
  if (P.st < DODGE.cost) { log('Không đủ Thể Lực để né.', 'bad'); return; }
  P.atkAnim = 0; P.dash = null; P.chan = 0;                         // ne ngat duoc dong tac danh
  let dx = 0, dy = 0, len = dg.m;
  if (held('left')) dx--;
  if (held('right')) dx++;
  if (held('up')) dy--;
  if (held('down')) dy++;
  const fx = P.face === 'phai' ? (P.flip ? -1 : 1) : 0, fy = P.face === 'xuong' ? 1 : P.face === 'len' ? -1 : 0;
  const t = P.target && mobVisible(P.target) ? P.target : null;
  if (dg.behind && t && dist(t, P) <= dg.behind * PX) {             // Lon Sau Lung: ra sau lung muc tieu
    const d = dist(t, P) || 1, k = (1.4 + (t.t.reach || 0)) * PX, bx = t.x + (t.x - P.x) / d * k, by = t.y + (t.y - P.y) / d * k;
    if (canStand(bx, by)) { P.x = bx; P.y = by; faceTo(t); startDodge(0, 0, 0); return; }
  }
  if (dg.toTarget && t && dist(t, P) <= 8 * PX) { const d = dist(t, P) || 1; dx = t.x - P.x; dy = t.y - P.y; len = Math.min(dg.m, Math.max(0, d / PX - 1)); }
  else if (dg.back) { if (t) { dx = P.x - t.x; dy = P.y - t.y; } else { dx = -fx; dy = -fy; } }
  else if (!dx && !dy) { dx = fx; dy = fy; }
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  if (dg.tele) {                                                       // dich chuyen tuc thi toi cho xa nhat dung duoc
    const n = Math.round(len * PX / 2);
    for (let k = 0; k < n; k++) { if (!canStand(P.x + ux * 2, P.y + uy * 2)) break; P.x += ux * 2; P.y += uy * 2; }
    effects.push({ kind: 'ring', x: P.x, y: P.y, r: 1.2 * PX, col: '#B9C8FF', t: 0, total: .3 });
    startDodge(0, 0, 0);
  } else startDodge(ux, uy, len * PX);
}
function startDodge(ux, uy, len) {
  P.dodgeDir = { x: ux, y: uy, sp: len / DODGE.time }; P.dodge = DODGE.time; P.st -= DODGE.cost; P.stPause = 1; P.path = null; P.perfectUsed = false;
  if (C().dodge.cd) P.dodgeCd = C().dodge.cd;
}
function changeClass(k) {
  if (!CLASSES[k] || k === P.cls || ONLINE) return;                 // choi mang: class co dinh theo nhan vat
  P.cls = k;
  P.eq = R.starterEq(k);                                            // doi class (thu nhanh): mac bo do tan thu cua class moi
  const s = S(); P.hp = s.hp; P.st = s.st; P.mp = s.mp;
  P.cds = [0, 0, 0]; P.fx = {}; P.shield = 0; P.chan = 0; P.block = 0; P.dodgeCd = 0; P.target = null; P.dash = null; P.br = null; P.sl = null;
  summons.length = 0; shots.length = 0; bombs.length = 0;
  log(`Đổi sang ${CLASSES[k].ten}, giữ nguyên Lv${P.lv}, mặc bộ đồ tân thủ của class.`, 'good');
  save();
}
function faceTo(t) {
  const dx = t.x - P.x, dy = t.y - P.y;
  if (Math.abs(dx) > Math.abs(dy)) { P.face = 'phai'; P.flip = dx < 0; } else P.face = dy > 0 ? 'xuong' : 'len';
}

// ---------------- tuong tac: NPC, cua hang, Dungeon, loi ra ----------------
function interact() {
  if (dialogOpen) { closeDialog(); return; }
  if (P.dead || asleep()) return;
  const near = [];
  for (const n of npcs) { const d = dist(n, P); if (d < (n.shop || n.smith ? R.NPC_NEAR : 3.5) * PX) near.push([d, () => talk(n)]); }
  if (MAP.key === 'dbm' && R.nearField(P)) near.push([dist(P, { x: R.FARM_FIELD.x + 24, y: R.FARM_FIELD.y + 15 }), () => openFarm()]);
  for (const it of items) {
    if (it.cat !== 'exit' && it.cat !== 'dungeon') continue;
    const cx = clamp(P.x, it.x0, it.x1), cy = clamp(P.y, it.y0, it.y1), d = Math.hypot(P.x - cx, P.y - cy);
    if (d < (it.cat === 'exit' ? 6 * PX : 4 * PX)) near.push([d, () => useExit(it)]);
  }
  near.sort((a, b) => a[0] - b[0]);
  if (near.length) near[0][1](); else log('Không có gì để tương tác ở gần.', '');
}
const LINES = [
  'Nghe nói Rừng Sương có sói đi theo bầy, đừng vào một mình.',
  'Tàu ra đại lục miễn phí lần đầu, những lần sau mất 50 Bạc.',
  'Hội Mạo Hiểm Giả có bảng nhiệm vụ ngay trước cửa.',
  'Ma Trơi chỉ hiện ra ở nghĩa địa khi trời tối.',
  'Cẩn thận ngủ gật ngoài đồng, Lời Nguyền Mắt Ngủ đấy!',
  'Goblin ở trại ven biển hay cướp hàng ở bến.',
  'Học Viện Tân Thủ dạy đủ 11 class.',
  'Ông gác hải đăng ngủ mê trong hang dưới mũi đá. Đứng trong vùng đèn của ông ấy, kẻo ngủ theo.',
  'Bảng tìm đội ở quảng trường: đi Hang Hải Đăng Cổ thì nên rủ đủ 5 người.',
];
function talk(n) {
  if (n.seren) {
    openDialog('Thánh Nữ Seren', `Chào linh hồn từ thế giới khác. Lazaria đang chìm dần vào giấc ngủ của Thần Ngủ, Con Mắt Lười. Lời Nguyền Mắt Ngủ làm người và thú ngủ gục, quái vật từ ác mộng bò ra. Hãy luyện tập trên Đảo Bình Minh đến Lv20, rồi ra Bến Tàu Lớn lên tàu về thủ phủ phe của mình. Khi thấy vệt đỏ dưới đất, hãy bước ra khỏi vệt hoặc nhấn Space để lộn né. Bà Mira ở Chợ Cảng bán bình thuốc và đồ Thường; nhấn I để mở túi đồ. ${P.lv < 5 ? 'Slime Sương ở đồng cỏ ngoài cổng nam là nơi tốt để bắt đầu.' : P.lv < 10 ? 'Cua Đá ở bãi đá phía tây và Chuột Kho Thóc ở trại ven đồi hợp với sức ngươi lúc này.' : 'Ngươi đủ sức tới Hang Hải Đăng Cổ (Lv10) ở mũi đá phía đông, rồi Trại Goblin và Rừng Sương.'}`);
  } else if (n.shop) openShop();
  else if (n.smith) openSmith();
  else { n.line = LINES[irnd(0, LINES.length - 1)]; n.say = 4; }
}
function useExit(it) {
  if (it.cat === 'exit' && it.to === 'dbm') { send(['dx']); return; }              // loi ra cua Dungeon
  if (it.cat === 'exit') { openDialog(it.name, P.lv >= MAX_LV
    ? `Tàu sẵn sàng đi ${it.to}. Bản chơi thử mới có Đảo Bình Minh, nên chưa đi được.`
    : `${it.desc} Cần đủ Lv20 mới được lên tàu (bạn đang Lv${P.lv}). Bản chơi thử mới có Đảo Bình Minh.`); return; }
  const D = Object.values(R.DUNGEONS).find(x => x.cua === it.name);
  if (!D) { openDialog(it.name, `${it.desc} Dungeon ${it.lv}. Chưa mở trong bản chơi thử.`); return; }
  if (!ONLINE) { openDialog(D.ten, `${it.desc} Dungeon Lv${D.lv}, 1–5 người. Dungeon cần chơi qua máy chủ; bản chơi một mình chưa vào được.`); return; }
  const pt = net.party ? `Tổ đội ${net.party.m.length} người: máu quái theo số người vào hang.` : 'Đi một mình: máu quái còn 44%, nhưng sát thương của quái giữ nguyên.';
  openDialog(D.ten, `${it.desc} Dungeon Lv${D.lv}, 3 tầng, 1–5 người (tối thiểu Lv${D.minLv}). ${pt} Hạ hết quái một tầng thì cổng tầng sau mở. Boss Người Gác Đèn Ngủ Mê quét đèn quanh mình: đứng ngoài vùng sáng thì thanh Buồn Ngủ tăng, đầy thì ngủ gục 3 giây.`,
    [['Vào hang', () => { send(['dg', Object.keys(R.DUNGEONS).find(k => R.DUNGEONS[k] === D)]); closeDialog(); }]]);
}
function openDialog(name, text, btns) {
  $('d-name').textContent = name; $('d-text').textContent = text;
  const box = $('d-btns'); box.textContent = '';
  for (const [label, fn] of btns || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); box.appendChild(b); }
  const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = btns ? 'Thôi' : 'Đóng'; ok.className = btns ? 'ghost' : ''; ok.addEventListener('click', closeDialog); box.appendChild(ok);
  $('dialog').hidden = false; dialogOpen = true;
}
function closeDialog() { $('dialog').hidden = true; dialogOpen = false; }

function updatePlayer(dt) {
  const s = S();
  if (P.dead) {
    P.dead -= dt;
    if (P.dead <= 0) {
      P.dead = 0; P.x = SPAWN.x; P.y = SPAWN.y; P.hp = s.hp; P.st = s.st; $('dead').hidden = true; send(['r']);
      if (!ONLINE) for (const m of mobs) if (m.state === 'chase') { m.state = 'return'; m.wind = null; }
    }
    return;
  }
  const c = C();
  P.atkCd -= dt; P.combat = Math.max(0, P.combat - dt); P.stPause = Math.max(0, P.stPause - dt); P.dodgeCd = Math.max(0, P.dodgeCd - dt);
  for (let i = 0; i < 3; i++) P.cds[i] = Math.max(0, P.cds[i] - dt);
  P.atkAnim = Math.max(0, P.atkAnim - dt); P.block = Math.max(0, P.block - dt);
  for (const k in P.fx) { P.fx[k].t -= dt; if (P.fx[k].t <= 0) { delete P.fx[k]; if (k === 'shield') P.shield = 0; } }
  // binh thuoc: hoi dan trong 10 giay
  if (P.hot) {
    const k = Math.min(dt, P.hot.t); P.hot.t -= dt;
    if (P.hot.hp) P.hp = Math.min(s.hp, P.hp + P.hot.hp * k);
    if (P.hot.mp) P.mp = Math.min(s.mp, P.mp + P.hot.mp * k);
    if (P.hot.t <= 0) P.hot = null;
  }
  // hoi mau ngoai giao tranh 3%/giay sau 5 giay; The Luc 15%/giay ngoai, 6%/giay trong giao tranh; Mana 2%/giay ngoai, 0,5%/giay trong
  if (P.combat <= 0) P.hp = Math.min(s.hp, P.hp + s.hp * .03 * dt);
  P.hp = Math.min(P.hp, s.hp);
  if (P.stPause <= 0) P.st = Math.min(s.st, P.st + s.st * (P.combat > 0 ? .06 : .15) * dt);
  if (s.mp) P.mp = Math.min(s.mp, P.mp + s.mp * (P.combat > 0 ? .005 : .02) * dt);
  if (P.sleep > 0) { P.sleep = Math.max(0, P.sleep - dt); P.moving = false; P.path = null; return; }   // ngu gat vi den cua Nguoi Gac Den
  if (P.chan > 0) {                                                    // Thien Dinh: dung yen van, di chuyen thi ngat
    const moveKey = ['left', 'right', 'up', 'down'].some(held);
    if (moveKey || P.path) { P.chan = 0; log('Thiền Định bị ngắt.', 'bad'); }
    else {
      P.chan -= dt; P.moving = false;
      if (P.chan <= 0) { const v = Math.round(s.mp * .2); P.mp = Math.min(s.mp, P.mp + v); addFloat(P, '+' + v + ' Mana', '#9FB4FF', true); P.chan = 0; }
      return;
    }
  }
  if (P.dodge > 0) {
    P.dodge -= dt;
    const st = P.dodgeDir.sp * dt;
    moveBy(P, P.dodgeDir.x * st, P.dodgeDir.y * st);
    if (P.dodge <= 0 && P.buffer) {                                   // ne xong: ra lenh da bam trong luc ne
      const b = P.buffer; P.buffer = null;
      if (b.act === 'skill') castSkill(b.i); else basicAttack();
    }
    return;
  }
  if (P.dash) {
    // Xung Phong: lao toi muc tieu roi chem 120%
    const t = P.dash.t, ddx = t.x - P.x, ddy = t.y - P.y, d = Math.hypot(ddx, ddy) || 1;
    const st = Math.min(P.dash.left, 24 * PX * dt);
    const ok = moveBy(P, ddx / d * st, ddy / d * st);
    P.dash.left -= st;
    if (!ok || P.dash.left <= 0 || !mobVisible(t)) {
      const mult = P.dash.mult, ds = P.dash.s, dsk = P.dash.sk;
      P.dash = null;
      if (mobVisible(t) && dist(t, P) <= (c.tam + (t.t.reach || 0)) * PX + 6) { faceTo(t); P.atkAnim = .27; skillFx(t, dsk, hitMob(t, mult, { s: ds })); }
    }
    return;
  }
  let dx = 0, dy = 0;
  if (!dialogOpen) {
    if (held('left')) dx--;
    if (held('right')) dx++;
    if (held('up')) dy--;
    if (held('down')) dy++;
  }
  const manual = !!(dx || dy);
  if (manual) P.path = null;
  // tu danh muc tieu, ke ca khi dang di (giu muc tieu cho toi khi qua xa hoac bam Esc)
  const t = P.target;
  if (t && (!mobVisible(t) || dist(t, P) > 18 * PX)) P.target = null;
  if (P.target) {
    const d = dist(t, P), reach = (c.tam + (t.t.reach || 0)) * PX;
    if (d <= reach) {
      if (!manual) P.path = null;
      if (P.atkCd <= 0) {
        P.atkCd = 1 / (S().aspd * (1 + fxv('aspd'))); P.atkAnim = .27; faceTo(t);
        if (c.ban) for (let k = 0; k < (c.n || 1); k++) shoot(t, c.mult || 1, c.ban, {}, k * .08);   // Nem Bai: 3 la x 60% ATK
        else hitMob(t, 1);
      }
    } else if (!manual) {
      if (!P.path || P.pathFor !== t || P.repath <= 0) { P.path = lineFree(P, t) ? [{ x: t.x, y: t.y }] : findPath(P.x, P.y, t.x, t.y); P.pathFor = t; P.repath = .4; }
      P.repath -= dt;
    }
  }
  if (!dx && !dy && P.path && P.path.length) {
    const w = P.path[0], ddx = w.x - P.x, ddy = w.y - P.y, d = Math.hypot(ddx, ddy);
    if (d < 2) P.path.shift(); else { dx = ddx / d; dy = ddy / d; }
  }
  const len = Math.hypot(dx, dy);
  P.moving = false;
  if (len > 0) {
    const st = SPEED * (1 + (RACES[P.race].speed || 0)) * (P.atkAnim > 0 ? MOVE_ATK : 1) * dt;   // Thu Nhan: +5% toc chay
    P.moving = moveBy(P, dx / len * st, dy / len * st);
    if (!P.moving && P.path) P.path = null;
    if (P.atkAnim <= 0) { if (Math.abs(dx) > Math.abs(dy) * 1.1) { P.face = 'phai'; P.flip = dx < 0; } else P.face = dy > 0 ? 'xuong' : 'len'; }
    P.anim += dt;
  }
  // doi vung
  const z = zoneOf(P.x, P.y);
  const zk = z && z.cat !== 'exit' ? z.name : MAP.name;
  if (zk !== zone) { zone = zk; toast(zk, z && z.lv ? z.lv + (z.mon ? ' · ' + z.mon : '') : ''); }
}

function updateNpc(n, dt) {
  n.say = Math.max(0, n.say - dt);
  if (!n.home) return;
  n.wait -= dt;
  if (n.dest) {
    const dx = n.dest.x - n.x, dy = n.dest.y - n.y, d = Math.hypot(dx, dy);
    if (d < 1 || !moveBy(n, dx / d * PX * 1.2 * dt, dy / d * PX * 1.2 * dt)) { n.dest = null; n.wait = rnd(2, 7); }
    else n.flip = dx < 0;
  } else if (n.wait <= 0) n.dest = { x: n.home.x + rnd(-2, 2) * PX, y: n.home.y + rnd(-1.5, 1.5) * PX };
}

// ---------------- chu bay, nhat ky ----------------
function addFloat(e, text, color, big) { floats.push({ x: e.x + rnd(-3, 3), y: e.y - 16 - (e.t && e.t.reach ? 12 : 0), text, color, t: 0, big }); }
function log(text, cls) {
  const li = document.createElement('li'); li.textContent = text; if (cls) li.className = cls;
  const ol = $('log'); ol.appendChild(li);
  while (ol.children.length > 6) ol.removeChild(ol.firstChild);
  setTimeout(() => li.classList.add('old'), 6000);
}
function toast(title, sub) {
  const old = $('toast'), el = old.cloneNode(true);
  el.hidden = false; el.querySelector('#toast-title').textContent = title; el.querySelector('#toast-sub').textContent = sub || '';
  old.replaceWith(el);
}

// ---------------- ve ----------------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
  Z = clamp(Math.round(Math.min(cv.width / 400, cv.height / 240)), 2, 6);
  VW = cv.width / Z; VH = cv.height / Z;
  light.width = cv.width; light.height = cv.height;
}
const light = document.createElement('canvas'), lctx = light.getContext('2d');
function spr(name, x, y, flip, alpha, scale = 1, sheet = SPR, im = 'spr') {
  const f = sheet.f[name];
  if (!f) return;
  const w = fW(sheet, f) * scale, h = fH(sheet, f) * scale;
  const sx = Math.round((x - w / 2 - cam.x) * Z), sy = Math.round((y - h + 1 - cam.y) * Z);
  if (alpha != null) ctx.globalAlpha = alpha;
  if (flip) { ctx.save(); ctx.translate(sx + w * Z, sy); ctx.scale(-1, 1); ctx.drawImage(IMG[im], f[0], f[1], f[2], f[3], 0, 0, w * Z, h * Z); ctx.restore(); }
  else ctx.drawImage(IMG[im], f[0], f[1], f[2], f[3], sx, sy, w * Z, h * Z);
  if (alpha != null) ctx.globalAlpha = 1;
}
// hinh nhan vat lay tu data/class_sprites.js (15 khung moi class, cung khung voi Chien Binh)
// mau da: moi class mot mau da goc trong anh; doi sang mau da cua chung toc (lam mot lan cho moi chung toc)
function sheetFor(race) {
  const key = 'cls_' + race, r = RACES[race];
  if (IMG[key] || !r) return IMG[key] ? key : 'cls';
  const c2 = document.createElement('canvas'); c2.width = IMG.cls.width; c2.height = IMG.cls.height;
  const g = c2.getContext('2d'); g.drawImage(IMG.cls, 0, 0);
  const d = g.getImageData(0, 0, c2.width, c2.height), px = d.data, skinOf = {};
  for (const c of SPRC.classes) skinOf[c.code] = c.skin;
  for (const [name, f] of Object.entries(SPRC.f)) {
    const parts = name.split('_'), sk = skinOf[parts[0]];
    if (parts.length < 4 || !sk || (sk[0] === r.skin[0] && sk[1] === r.skin[1] && sk[2] === r.skin[2])) continue;
    for (let y = f[1]; y < f[1] + f[3]; y++) for (let x = f[0]; x < f[0] + f[2]; x++) {
      const i = (y * c2.width + x) * 4;
      if (!px[i + 3] || Math.abs(px[i] - sk[0]) + Math.abs(px[i + 1] - sk[1]) + Math.abs(px[i + 2] - sk[2]) > 60) continue;
      for (let q = 0; q < 3; q++) px[i + q] = clamp(px[i + q] + r.skin[q] - sk[q], 0, 255);
    }
  }
  g.putImageData(d, 0, 0); IMG[key] = c2;
  return key;
}
const look = (cls, gender, outfit) => `${cls}_${gender === 'f' ? 'f' : 'm'}${outfit | 0}`;
function heroFrame() {
  const k = look(P.cls, P.gender, P.outfit) + '_' + P.face;
  if (P.atkAnim > 0) return k + (P.atkAnim > .15 ? '_a1' : '_a2');
  if (P.dodge > 0 || P.dash) return k + '_1';
  if (!P.moving) return k + '_0';
  return k + '_' + [1, 0, 2, 0][Math.floor(P.anim * 8) % 4];
}
const SKEL = ['.0000.', '0#00#0', '.0000.', '..00..', '000000', '0.00.0', '..00..', '.0..0.', '.0..0.'];
function drawSkel(k) {
  const a = Math.min(1, k.t), bob = k.moving ? (Math.floor(k.anim * 8) % 2) : 0, lunge = k.hit > 0 ? (k.flip ? -1 : 1) : 0;
  ctx.globalAlpha = .95 * a;
  const x0 = k.x - 3 + lunge, y0 = k.y - SKEL.length + 1 - bob;
  for (let r = 0; r < SKEL.length; r++) for (let q = 0; q < 6; q++) {
    const ch = SKEL[r][k.flip ? 5 - q : q];
    if (ch === '.') continue;
    ctx.fillStyle = ch === '#' ? '#7A3CFF' : (r > 3 ? '#D9D2C2' : '#EFE9DC');
    ctx.fillRect(Math.round((x0 + q - cam.x) * Z), Math.round((y0 + r - cam.y) * Z), Z, Z);
  }
  ctx.globalAlpha = 1;
}
const SHOT_LOOK = {
  fire: ['#FF8A3A', '#FFE08A', 2.2], soul: ['#9C6BFF', '#E2D2FF', 2], ice: ['#7FD3FF', '#E8FBFF', 1.8], sun: ['#FFD54A', '#FFFBE0', 2],
  drain: ['#D0457E', '#FFC2DC', 2], thorn: ['#5FB84E', '#CFF5B8', 1.6], bullet: ['#FFE27A', '#FFFFFF', 1], dice: ['#FFFFFF', '#222222', 1.8],
};
function drawShot(b) {
  if (b.delay > 0) return;
  const sx = (b.x - cam.x) * Z, sy = (b.y - cam.y) * Z;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.a);
  if (b.look === 'arrow' || b.look === 'dart') {
    ctx.fillStyle = b.look === 'arrow' ? '#C9A46A' : '#C9C2D6'; ctx.fillRect(-4 * Z, -.5 * Z, 7 * Z, Z);
    ctx.fillStyle = '#EEE'; ctx.fillRect(3 * Z, -1 * Z, 1.5 * Z, 2 * Z);
  } else if (b.look === 'card') {
    ctx.fillStyle = '#FFF'; ctx.fillRect(-1.5 * Z, -2 * Z, 3 * Z, 4 * Z); ctx.fillStyle = '#E0457E'; ctx.fillRect(-.5 * Z, -.5 * Z, Z, Z);
  } else {
    const L = SHOT_LOOK[b.look] || SHOT_LOOK.fire, r = L[2] * Z;
    if (b.look === 'dice') { ctx.fillStyle = L[0]; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.fillStyle = L[1]; ctx.fillRect(-Z / 2, -Z / 2, Z, Z); }
    else {
      ctx.fillStyle = L[0]; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = L[1]; ctx.beginPath(); ctx.arc(r * .3, 0, r * .45, 0, Math.PI * 2); ctx.fill();
      if (b.look !== 'bullet') { ctx.globalAlpha = .45; ctx.fillStyle = L[0]; ctx.beginPath(); ctx.arc(-r * 1.6, 0, r * .7, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}
function drawEffect(e) {
  const p = e.t / e.total;
  ctx.save();
  if (e.kind === 'ring') {
    ctx.globalAlpha = 1 - p; ctx.strokeStyle = e.col; ctx.lineWidth = Math.max(1, Z * .8);
    ctx.beginPath(); ctx.ellipse((e.x - cam.x) * Z, (e.y - 2 - cam.y) * Z, e.r * Z * (.4 + .6 * p), e.r * Z * .55 * (.4 + .6 * p), 0, 0, Math.PI * 2); ctx.stroke();
  } else if (e.kind === 'beam') {
    ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = Math.max(1, Z * 1.4);
    ctx.beginPath(); ctx.moveTo((e.x - cam.x) * Z, (e.y - cam.y) * Z); ctx.lineTo((e.x + e.ux * e.len - cam.x) * Z, (e.y + e.uy * e.len - cam.y) * Z); ctx.stroke();
  } else if (e.kind === 'smoke') {
    ctx.globalAlpha = .7 * (1 - p);
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2, rr = e.r * (.3 + .7 * p) * (k % 2 ? .7 : 1);
      ctx.fillStyle = k % 3 ? '#D8D2DE' : ['#FF7FB0', '#FFD45A', '#7FD3FF'][k % 9 / 3 | 0];
      ctx.beginPath(); ctx.arc((e.x + Math.cos(a) * rr - cam.x) * Z, (e.y - 4 + Math.sin(a) * rr * .55 - cam.y) * Z, (2.4 - p) * Z, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function bar(x, y, w, v, col) {
  const sx = Math.round((x - w / 2 - cam.x) * Z), sy = Math.round((y - cam.y) * Z);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(sx - 1, sy - 1, w * Z + 2, Math.max(3, Z) + 2);
  ctx.fillStyle = col; ctx.fillRect(sx, sy, Math.max(0, w * Z * v), Math.max(3, Z));
}
// cong song sat giua cac tang Dungeon
function drawGate(g) {
  const x0 = (g.x0 - cam.x) * Z, y0 = (g.y0 - cam.y) * Z, w = (g.x1 - g.x0) * Z, h = (g.y1 - g.y0 + 4) * Z;
  ctx.fillStyle = 'rgba(20,18,28,.55)'; ctx.fillRect(x0, y0 - 10 * Z, w, h + 10 * Z);
  ctx.fillStyle = '#5C5A6A';
  for (let x = 0; x <= w; x += 3 * Z) ctx.fillRect(x0 + x, y0 - 10 * Z, Z, h + 10 * Z);
  ctx.fillRect(x0, y0 - 10 * Z, w, Z * 1.5); ctx.fillRect(x0, y0 + h * .45, w, Z);
  ctx.fillStyle = '#8A8898'; ctx.fillRect(x0, y0 - 10 * Z, w, Z * .6);
}
// den quet cua Nguoi Gac Den: hinh quat sang quanh Boss
function drawLamp() {
  const b = mobs.find(m => m.kind === 'keeper' && mobVisible(m));
  if (!b || !net.lamp) return null;
  const [a, r, arc] = net.lamp, cx = (b.x - cam.x) * Z, cy = (b.y - 6 - cam.y) * Z, rr = r * PX * Z;
  const a0 = (a - arc / 2) * Math.PI / 180, a1 = (a + arc / 2) * Math.PI / 180;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
  g.addColorStop(0, 'rgba(255,236,150,.42)'); g.addColorStop(1, 'rgba(255,220,120,.08)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, a0, a1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,140,.6)'; ctx.lineWidth = Math.max(1, Z / 2); ctx.stroke();
  ctx.restore();
  return { cx, cy, rr, a0, a1 };
}
// hang toi: phu mot lop toi, khoet sang quanh nguoi choi, duoc va den cua Boss
function drawDark(lamp) {
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, light.width, light.height);
  lctx.fillStyle = `rgba(4,6,16,${MAP.dark})`; lctx.fillRect(0, 0, light.width, light.height);
  lctx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => {
    const sx = (x - cam.x) * Z, sy = (y - cam.y) * Z, rr = r * Z;
    const g = lctx.createRadialGradient(sx, sy, rr * .2, sx, sy, rr);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.beginPath(); lctx.arc(sx, sy, rr, 0, Math.PI * 2); lctx.fill();
  };
  hole(P.x, P.y - 6, 7.5 * PX);
  for (const q of net.others.values()) if (q.x != null && q.zi === net.zi) hole(q.x, q.y - 6, 6 * PX, .85);
  for (const it of items) if (it.cat === 'light') hole(it.x0, it.y0 + 4, 5 * PX, .9);
  for (const e of effects) if (e.kind === 'ring') hole(e.x, e.y, 3 * PX, .5);
  for (const b of shots) hole(b.x, b.y, 2 * PX, .6);
  if (lamp) { lctx.fillStyle = 'rgba(0,0,0,.9)'; lctx.beginPath(); lctx.moveTo(lamp.cx, lamp.cy); lctx.arc(lamp.cx, lamp.cy, lamp.rr, lamp.a0, lamp.a1); lctx.closePath(); lctx.fill(); }
  ctx.drawImage(light, 0, 0);
}
function wrapText(text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    if (lines.length === 3) break;
  }
  if (cur && lines.length < 3) lines.push(cur);
  return lines;
}
function draw() {
  frameNo++;
  cam.x = clamp(P.x - VW / 2, 0, MAP.W - VW); cam.y = clamp(P.y - 8 - VH / 2, 0, MAP.H - VH);
  if (MAP.W < VW) cam.x = (MAP.W - VW) / 2;
  if (MAP.H < VH) cam.y = (MAP.H - VH) / 2;
  cam.x = Math.round(cam.x * Z) / Z; cam.y = Math.round(cam.y * Z) / Z;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = MAP.dark ? '#0B0D16' : '#0E1A26'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (IMG.nen) {
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y), sw = Math.min(MAP.W, cam.x + VW) - sx, sh = Math.min(MAP.H, cam.y + VH) - sy;
    ctx.drawImage(IMG.nen, sx, sy, sw, sh, (sx - cam.x) * Z, (sy - cam.y) * Z, sw * Z, sh * Z);
  }
  if (MAP.key === 'dbm') drawField();
  const lamp = MAP.dark ? drawLamp() : null;
  // vong muc tieu va diem den
  if (P.target && mobVisible(P.target)) {
    const t = P.target, k = t.scale * (t.t.reach ? 1.8 : 1);
    ctx.strokeStyle = '#FFD45A'; ctx.lineWidth = Math.max(1, Z / 2);
    ctx.beginPath(); ctx.ellipse((t.x - cam.x) * Z, (t.y - 1 - cam.y) * Z, 8 * Z * k, 3 * Z * k, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (P.path && P.path.length && !P.target) {
    const w = P.path[P.path.length - 1];
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, Z / 2);
    ctx.beginPath(); ctx.ellipse((w.x - cam.x) * Z, (w.y - cam.y) * Z, 4 * Z, 1.6 * Z, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const m of mobs) if (m.wind && m.state === 'chase' && mobVisible(m)) drawWind(m.wind);
  for (const b of bombs) drawWind({ kind: 'circle', t: b.t, total: b.total, x: b.x, y: b.y, r: b.r, mine: true });
  const aura = P.block > 0 ? 'rgba(180,220,255,.9)' : P.shield > 0 ? 'rgba(120,170,255,.95)' : P.chan > 0 ? 'rgba(150,180,255,.8)'
    : (P.fx.atk || P.fx.aspd || P.fx.crit) ? 'rgba(255,170,80,.75)' : (P.fx.def ? 'rgba(200,190,230,.8)' : (P.fx.ev ? 'rgba(255,127,176,.8)' : null));
  if (aura) {
    ctx.strokeStyle = aura; ctx.lineWidth = Math.max(1, Z / 2);
    ctx.beginPath(); ctx.ellipse((P.x - cam.x) * Z, (P.y - 1 - cam.y) * Z, 7 * Z, 3 * Z, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const m of mobs) if (mobVisible(m) && (m.rootT > 0 || m.slowT > 0)) {
    ctx.strokeStyle = m.rootT > 0 ? 'rgba(127,211,106,.9)' : 'rgba(127,211,255,.8)'; ctx.lineWidth = Math.max(1, Z / 2);
    ctx.beginPath(); ctx.ellipse((m.x - cam.x) * Z, (m.y - cam.y) * Z, 6 * Z * m.scale, 2.2 * Z * m.scale, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const e of effects) if (e.kind !== 'beam') drawEffect(e);
  // gom vat the + nhan vat, sap theo diem chan
  const list = [];
  const bx0 = Math.max(0, Math.floor(cam.x / BUCKET)), bx1 = Math.min(BW - 1, Math.floor((cam.x + VW) / BUCKET));
  const by0 = Math.max(0, Math.floor(cam.y / BUCKET)), by1 = Math.min(BH - 1, Math.floor((cam.y + VH + 40) / BUCKET));
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) for (const i of buckets[by * BW + bx]) {
    if (seenMark[i] === frameNo) continue; seenMark[i] = frameNo; list.push({ d: MAP.objs[i].d, o: MAP.objs[i] });
  }
  const inView = e => e.x > cam.x - 40 && e.x < cam.x + VW + 40 && e.y > cam.y - 10 && e.y < cam.y + VH + 50;
  for (const m of mobs) if ((mobVisible(m) || m.dying > 0) && inView(m)) list.push({ d: m.y, m });
  for (const n of npcs) if (inView(n)) list.push({ d: n.y, n });
  for (const k of summons) if (inView(k)) list.push({ d: k.y, k });
  for (const q of net.others.values()) if (q.x != null && q.zi === net.zi && inView(q)) list.push({ d: q.y, q });
  list.push({ d: P.y, p: true });
  const labels = [], mobLabels = [];
  list.sort((a, b) => a.d - b.d);
  for (const it of list) {
    if (it.o) {
      const o = it.o, f = MAP.frames[o.f];
      drawVat(o.f, Math.round((o.x - cam.x) * Z), Math.round((o.y - cam.y) * Z), f[2] * Z, f[3] * Z);
    } else if (it.m) {
      const m = it.m;
      if (m.hurt > 0 && Math.floor(m.hurt * 40) % 2) continue;
      const bob = m.kind === 'slime' || m.kind === 'saltslime' ? Math.sin(m.bob) * .6 : m.kind === 'wisp' ? Math.sin(m.bob * .5) * 2 - 2 : m.kind === 'bat' ? Math.sin(m.bob * 1.6) * 2 - 6 : 0;
      const lx = m.lunge ? m.face * 2 : 0;
      const a = m.alive ? (m.kind === 'wisp' ? .9 : m.evade ? .55 : null) : Math.max(0, m.dying / .4);
      if (m.flipT > 0) { ctx.save(); const f = SPR.f[m.kind]; const cx = (m.x - cam.x) * Z, cy = (m.y - fH(SPR, f) / 2 - cam.y) * Z; ctx.translate(cx, cy); ctx.scale(1, -1); ctx.translate(-cx, -cy); spr(m.kind, m.x, m.y, m.face < 0, a, m.scale); ctx.restore(); }
      else spr(m.kind, m.x + lx, m.y + bob, m.face < 0, a, m.scale);
      const f = SPR.f[m.kind], big = m.t.bac === 'Tinh Anh Dungeon' || m.t.bac === 'Boss Dungeon';
      if (m.alive && (m.hp < m.max || m === P.target || big)) bar(m.x, m.y - fH(SPR, f) * m.scale - 3 + (m.kind === 'bat' ? -6 : 0), Math.max(14, fW(SPR, f) * .8) * m.scale, m.hp / m.max, '#D9534A');
      if (m.alive && big) mobLabels.push(m);
    } else if (it.n) {
      const n = it.n;
      if (n.seren) spr('seren', n.x, n.y, n.flip);
      else { const f = MAP.frames[n.frame]; const sx = Math.round((n.x - f[2] / 2 - cam.x) * Z), sy = Math.round((n.y - f[3] + 1 - cam.y) * Z); drawVat(n.frame, sx, sy, f[2] * Z, f[3] * Z); }
      if (n.tag) labels.push(n);
    } else if (it.k) drawSkel(it.k);
    else if (it.q) {
      // nguoi choi khac: co 1 dang di, 2 dang danh, 4 dang ne, 8 dang lao, 64 da guc, 128 tang hinh, 256 dang ngu
      const q = it.q, st = q.flags, k = look(q.cls, q.gender, q.outfit) + '_' + (FACE_OF[q.face] || 'xuong');
      const fr = st & 2 ? k + '_a1' : (st & 12) ? k + '_1' : (q.moving || st & 1) ? k + '_' + [1, 0, 2, 0][Math.floor(q.anim * 8) % 4] : k + '_0';
      spr(SPRC.f[fr] ? fr : q.cls + '_xuong_0', q.x, q.y, q.face === 2 && q.flip, st & 64 ? .35 : st & 128 ? .25 : null, 1, SPRC, sheetFor(q.race));
      labels.push(q);
    } else {
      const a = P.dead ? .35 : (P.fx.stealth ? .35 : (P.dodge > 0 ? .7 : null));
      spr(heroFrame(), P.x, P.y, P.face === 'phai' && P.flip, a, 1, SPRC, sheetFor(P.race));
      if (ONLINE) labels.push(P);
    }
  }
  for (const g of (MAP.gates || []).slice(net.gates)) drawGate(g);
  for (const b of shots) drawShot(b);
  for (const e of effects) if (e.kind === 'beam') drawEffect(e);
  if (IMG.suong) { ctx.globalAlpha = .8; ctx.drawImage(IMG.suong, cam.x, cam.y, VW, VH, 0, 0, VW * Z, VH * Z); ctx.globalAlpha = 1; }
  if (MAP.dark) drawDark(lamp);
  // dem (chi o dao)
  if (!MAP.dark) {
    const tday = clock % DAY;
    let dark = 0;
    if (tday >= NIGHT_FROM) dark = Math.min(1, (tday - NIGHT_FROM) / 20, (DAY - tday) / 20);
    if (dark > 0) { ctx.fillStyle = `rgba(16,22,58,${.5 * dark})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }
  ctx.textAlign = 'center';
  const fs = Math.max(11, Math.round(Z * 3.4));
  // ten nguoi choi, NPC buon ban, Tinh Anh va Boss
  ctx.font = `600 ${Math.max(10, Math.round(fs * .82))}px 'Be Vietnam Pro', system-ui, sans-serif`;
  const mine = q => net.party && net.party.m.some(o => o.n === q.n);
  for (const q of labels) {
    const sx = (q.x - cam.x) * Z, sy = (q.y - (q.tag ? 16 : 22) - cam.y) * Z;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    const txt = q === P ? P.name : q.tag ? q.tag : `${q.name} · Lv${q.lv}`;
    ctx.strokeText(txt, sx, sy);
    ctx.fillStyle = q === P ? '#FFE8A8' : q.tag ? '#E9C46A' : mine(q) ? '#9EE493' : '#F3EFE6';
    ctx.fillText(txt, sx, sy);
    if (q !== P && !q.tag && q.hp < 100) bar(q.x, q.y - 21, 14, q.hp / 100, '#8BD17C');
    if ((q === P ? asleep() : q.flags & 256)) { ctx.fillStyle = '#CFE3FF'; ctx.fillText('Zzz', sx + 14 * Z / 3, sy - fs); }
  }
  for (const m of mobLabels) {
    const f = SPR.f[m.kind], sx = (m.x - cam.x) * Z, sy = (m.y - fH(SPR, f) * m.scale - 7 - cam.y) * Z;
    const txt = `${m.t.ten} · Lv${m.lv}`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(txt, sx, sy);
    ctx.fillStyle = m.t.bac === 'Boss Dungeon' ? '#FF9A7A' : '#FFD45A'; ctx.fillText(txt, sx, sy);
  }
  // bong thoai: NPC va nguoi choi (khung tron, co duoi, toi da 3 dong)
  ctx.font = `600 ${fs}px 'Be Vietnam Pro', system-ui, sans-serif`;
  for (const n of [...npcs, ...labels]) if (n.say > 0 && inView(n) && !n.tag) {
    const lines = wrapText(n.line, Math.min(260, 70 * Z)), lh = fs + 3;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 18, h = lines.length * lh + 10;
    const sx = (n.x - cam.x) * Z, by = (n.y - (n.cls ? 27 : 19) - cam.y) * Z - (n.cls ? fs : 0);
    const x0 = sx - w / 2, y0 = by - h - 6;
    ctx.globalAlpha = Math.min(1, n.say * 2);
    ctx.fillStyle = n.party ? 'rgba(22,46,30,.94)' : 'rgba(250,246,236,.96)';
    ctx.strokeStyle = n.party ? '#8BD17C' : 'rgba(60,50,40,.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 8); else ctx.rect(x0, y0, w, h);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 6, y0 + h - 1); ctx.lineTo(sx, y0 + h + 6); ctx.lineTo(sx + 6, y0 + h - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = n.party ? '#D8F5CF' : '#2A2230';
    lines.forEach((l, i) => ctx.fillText(l, sx, y0 + 6 + (i + 1) * lh - 4));
    ctx.globalAlpha = 1;
  }
  for (const f of floats) {
    ctx.font = `700 ${Math.round(fs * (f.big ? 1.25 : 1))}px 'Be Vietnam Pro', system-ui, sans-serif`;
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    const sx = (f.x - cam.x) * Z, sy = (f.y - f.t * 14 - cam.y) * Z;
    ctx.strokeText(f.text, sx, sy); ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;
  if (asleep()) { ctx.fillStyle = `rgba(20,24,60,${.35 + .1 * Math.sin(performance.now() / 300)})`; ctx.fillRect(0, 0, cv.width, cv.height); }
}
function drawWind(w) {
  const p = 1 - Math.max(0, w.t) / w.total;
  ctx.save();
  if (w.kind === 'circle') {
    const cx = (w.x - cam.x) * Z, cy = (w.y - cam.y) * Z, r = w.r * Z;
    const col = w.mine ? ['rgba(255,170,60,.14)', 'rgba(255,170,60,.34)', 'rgba(255,200,90,.95)'] : ['rgba(220,40,30,.16)', 'rgba(230,50,35,.38)', 'rgba(255,96,72,.95)'];
    ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(cx, cy, r * p, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col[2]; ctx.lineWidth = Math.max(1, Z / 2); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.translate((w.x - cam.x) * Z, (w.y - cam.y) * Z); ctx.rotate(Math.atan2(w.uy, w.ux));
    const L = w.len * Z, W = w.w * Z;
    ctx.fillStyle = 'rgba(220,40,30,.16)'; ctx.fillRect(0, -W / 2, L, W);
    ctx.fillStyle = 'rgba(230,50,35,.38)'; ctx.fillRect(0, -W / 2, L * p, W);
    ctx.strokeStyle = 'rgba(255,96,72,.95)'; ctx.lineWidth = Math.max(1, Z / 2); ctx.strokeRect(0, -W / 2, L, W);
  }
  ctx.restore();
}
function drawMini() {
  if (!showMini || !IMG.mini) return;
  const w = mini.width, h = mini.height;
  mctx.fillStyle = '#0B0D16'; mctx.fillRect(0, 0, w, h);
  // ban do doc (Dungeon): giu ty le, can giua
  const k = Math.min(w / MAP.W, h / MAP.H), ox = (w - MAP.W * k) / 2, oy = (h - MAP.H * k) / 2;
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(IMG.mini, ox, oy, MAP.W * k, MAP.H * k);
  mctx.strokeStyle = 'rgba(255,255,255,.8)'; mctx.lineWidth = 1;
  mctx.strokeRect(ox + cam.x * k, oy + cam.y * k, VW * k, VH * k);
  for (const q of net.others.values()) if (q.x != null && q.zi === net.zi) {
    mctx.fillStyle = net.party && net.party.m.some(o => o.n === q.n) ? '#8BD17C' : '#9FD0FF';
    mctx.beginPath(); mctx.arc(ox + q.x * k, oy + q.y * k, 2.2, 0, Math.PI * 2); mctx.fill();
  }
  mctx.fillStyle = '#FFD45A'; mctx.beginPath(); mctx.arc(ox + P.x * k, oy + P.y * k, 3, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = '#000'; mctx.stroke();
}

// ---------------- giao dien ----------------
let hudT = 0;
let hudCls = null;
const hudSig = () => [P.cls, P.lv >= R.BRANCH_LV, P.br, String(P.sl), P.lv >= 5, P.lv >= 10].join('|');
function hudClass() {
  const c = C(), sks = SKS(), br = R.branchOf(P);
  hudCls = hudSig();
  skIcon('b-skills', br ? br.pas.id : c.skills.length ? P.cls + '_s0' : P.cls + '_atk');
  $('me-name').textContent = P.name || c.ten;
  $('me-name').title = `${RACES[P.race].ten} · ${c.ten} · ${BACKGROUNDS[P.bg].ten}`;
  $('b-atk').title = `${c.chem} · tầm ${String(c.tam).replace('.', ',')} m`;
  keyLabels();
  $('b-dodge').querySelector('b').textContent = c.dodge.ten;
  $('b-dodge').title = `${c.dodge.ten}: ${c.dodge.mo} · 20 Thể Lực`;
  $('b-atk').querySelector('b').textContent = c.chem;
  skIcon('b-atk', P.cls + '_atk'); skIcon('b-dodge', P.cls + '_dodge');
  [0, 1, 2].forEach(i => {
    const sk = sks[i], b = $('b-s' + (i + 1));
    skIcon('b-s' + (i + 1), sk ? sk.ico : '');
    b.querySelector('b').textContent = sk ? sk.ten : c.skills.length ? 'Ô trống' : 'Nghề';
    b.title = sk ? `${sk.ten}: ${sk.mo} · ${costTxt(sk)} · hồi ${sk.cd} giây` : c.skills.length ? `Ô trống: mở Bảng kỹ năng (${keyName(BIND.skills)}) để gắn` : 'Nông Dân không có kỹ năng chiến đấu';
  });
}
function hud() {
  const s = S(), c = C(), sks = SKS();
  if (hudCls !== hudSig()) hudClass();
  $('mp-bar').hidden = !s.mp;
  $('me-lv').textContent = 'Lv ' + P.lv;
  $('hp-fill').style.width = (P.hp / s.hp * 100) + '%'; $('hp-txt').textContent = `Máu ${Math.ceil(P.hp)} / ${s.hp}` + (P.shield > 0 ? ` · Khiên ${Math.ceil(P.shield)}` : '');
  $('st-fill').style.width = (P.st / s.st * 100) + '%'; $('st-txt').textContent = `Thể Lực ${Math.floor(P.st)} / ${s.st}`;
  if (s.mp) { $('mp-fill').style.width = (P.mp / s.mp * 100) + '%'; $('mp-txt').textContent = `Mana ${Math.floor(P.mp)} / ${s.mp}`; }
  const zzOn = MAP.dark && net.zz != null && (net.zz > 0 || !!net.lamp);
  $('zz-bar').hidden = !zzOn;
  if (zzOn) { $('zz-fill').style.width = net.zz + '%'; $('zz-txt').textContent = asleep() ? 'Đang ngủ gục…' : `Buồn Ngủ ${net.zz} / 100`; }
  const tl = net.tl, tEl = $('dg-timer');                          // dong ho Dungeon (may chu dem)
  tEl.hidden = tl == null || !MAP.gates;
  if (!tEl.hidden) {
    tEl.classList.toggle('low', tl >= 0 && tl <= 60); tEl.classList.toggle('done', tl < 0);
    $('dg-lbl').textContent = tl < 0 ? (net.ox != null ? 'Hoàn thành · tự ra sau' : 'Hoàn thành') : 'Thời gian còn lại';
    $('dg-time').textContent = tl < 0 ? (net.ox != null ? net.ox + ' giây' : '✓') : Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
  }
  const need = expNeed(P.lv);
  $('xp-fill').style.width = (P.lv >= MAX_LV ? 100 : P.exp / need * 100) + '%';
  $('xp-fill').parentElement.title = P.lv >= MAX_LV ? 'Đã đạt Lv20' : `EXP ${P.exp} / ${need}`;
  setMoney($('money'), P.tien);
  const tday = clock % DAY, night = tday >= NIGHT_FROM;
  $('daynight').textContent = (MAP.dark ? 'Trong hang' : (night ? 'Đêm' : 'Ngày')) + (ONLINE ? ` · ${[...net.others.values()].filter(q => q.zi === net.zi).length + 1} người` : '');
  const dur = R.eqDurability(P.eq);
  $('clock').textContent = 'Độ bền đồ ' + dur + '%' + (expRate > 1 ? ' · EXP ×' + expRate : '');
  $('clock').classList.toggle('warn', dur < 30);
  const t = P.target;
  if (t && mobVisible(t)) {
    $('target').hidden = false;
    $('tg-name').textContent = t.t.ten + (t.evade ? ' · đang về chỗ' : t.flipT > 0 ? ' · lật ngửa' : '');
    $('tg-lv').textContent = `Lv ${t.lv} · ${t.t.bac}`;
    $('tg-fill').style.width = (Math.max(0, t.hp) / t.max * 100) + '%'; $('tg-txt').textContent = `${Math.max(0, Math.ceil(t.hp))} / ${t.max}`;
  } else $('target').hidden = true;
  [0, 1, 2].forEach(i => {
    const sk = sks[i], b = $('b-s' + (i + 1)), locked = !sk || P.lv < sk.lv;
    const poor = sk && !locked && P.cds[i] <= 0 && (sk.C != null ? P.mp : P.st) < skCost(sk);
    b.classList.toggle('locked', locked || poor);
    b.querySelector('.cd').style.height = (locked ? 100 : P.cds[i] / sk.cd * 100) + '%';
    b.querySelector('kbd').textContent = !sk ? '–' : locked ? 'Lv' + sk.lv : keyName(BIND['s' + (i + 1)]);
  });
  $('b-dodge').querySelector('.cd').style.height = (P.st < DODGE.cost ? 100 : (c.dodge.cd ? P.dodgeCd / c.dodge.cd * 100 : 0)) + '%';
  hudQuick();
  hudParty();
}

// ---------------- dieu khien ----------------
function screenToWorld(cx, cy) {
  const r = cv.getBoundingClientRect(), k = cv.width / r.width;
  return { x: (cx - r.left) * k / Z + cam.x, y: (cy - r.top) * k / Z + cam.y };
}
const panelOpen = () => !$('inv').hidden || !$('shop').hidden || !$('trade').hidden || !$('skills').hidden || !$('ach').hidden || !$('fr').hidden || !$('farm').hidden;
cv.addEventListener('pointerdown', e => {
  if (P.dead || !$('help').hidden) return;
  if (dialogOpen) closeDialog();
  $('pcard').hidden = true;
  const w = screenToWorld(e.clientX, e.clientY);
  // bam vao quai?
  let hit = null, bd = 12;
  for (const m of mobs) if (mobVisible(m)) { const d = Math.hypot(m.x - w.x, (m.y - 5 - (m.t.reach ? 8 : 0)) - w.y); if (d < bd + (m.t.reach ? 8 : 0)) { bd = d; hit = m; } }
  if (hit) { P.target = hit; P.path = null; return; }
  // bam vao nguoi choi khac: the thong tin, moi vao to doi
  for (const q of net.others.values()) if (q.x != null && q.zi === net.zi && Math.hypot(q.x - w.x, q.y - 8 - w.y) < 9) { openPcard(q, e.clientX, e.clientY); return; }
  for (const n of npcs) if (Math.hypot(n.x - w.x, n.y - 6 - w.y) < 9) { if (dist(n, P) < (n.shop || n.smith ? R.NPC_NEAR : 4) * PX) talk(n); else { P.target = null; P.path = findPath(P.x, P.y, n.x, n.y + 6); } return; }
  P.target = null;
  if (asleep()) return;
  P.path = findPath(P.x, P.y, w.x, w.y);
});
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (rebind) { e.preventDefault(); setBind(k); return; }                   // dang doi phim trong menu
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;   // dang go chu
  if (!$('create').hidden) return;
  if (k === 'escape') { e.preventDefault(); escape(); return; }
  if (!$('menu').hidden) return;
  if (!$('help').hidden) { if (k === 'enter') closeHelp(); return; }
  if (k === 'enter' && ONLINE) { e.preventDefault(); openChat(); return; }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k) || ACT_OF[k]) e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  const a = ACT_OF[k];
  if (!a) return;
  if (a === 'inv') toggleInv();
  else if (a === 'skills') toggleSkills();
  else if (a === 'ach') toggleAch();
  else if (a === 'fr') toggleFr();
  else if (a === 'farm') toggleFarm();
  else if (panelOpen()) return;
  else if (a === 'dodge') doDodge();
  else if (a === 's1' || a === 's2' || a === 's3') castSkill(+a[1] - 1);
  else if (a === 'atk') basicAttack();
  else if (a === 'use') interact();
  else if (a === 'pot') quickPotion();
  else if (a === 'map') { showMini = !showMini; mini.hidden = !showMini; }
  else if (a === 'help') openHelp();
  else if (a[0] === 'q') useQuick(+a.slice(1) - 1);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
$('b-atk').addEventListener('click', basicAttack);
[0, 1, 2].forEach(i => $('b-s' + (i + 1)).addEventListener('click', () => castSkill(i)));
$('b-dodge').addEventListener('click', doDodge);
$('b-skills').addEventListener('click', toggleSkills);
$('b-ach').addEventListener('click', toggleAch);
$('b-fr').addEventListener('click', toggleFr);
$('b-farm').addEventListener('click', toggleFarm);
$('b-menu').addEventListener('click', openMenu);
$('b-inv').addEventListener('click', toggleInv);
$('b-chat').addEventListener('click', () => (ONLINE ? openChat() : log('Trò chuyện cần chơi qua máy chủ.', '')));
let pickCls = 'cb';
const num = v => String(Math.round(v * 10) / 10).replace('.', ',');
// bang huong dan: chi danh dau class dang chon (huong dan phim nam o menu Esc)
function helpRows() {
  document.querySelectorAll('#cls-pick button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === pickCls ? 'true' : 'false'));
}
function buildPicker() {
  const box = $('cls-pick');
  for (const k of CLS_ORDER) {
    const b = document.createElement('button'), cv2 = document.createElement('canvas'), f = SPRC.f[k + '_xuong_0'];
    b.type = 'button'; b.dataset.k = k; cv2.width = 32; cv2.height = 40;
    const s = SPRC.s || 1, w = Math.min(f[2], 16 * s), h = Math.min(f[3], 20 * s);
    const g = cv2.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(IMG.cls, f[0] + (f[2] - w) / 2, f[1] + f[3] - h, w, h, 0, 0, 32, 40);
    const t = document.createElement('span'); t.textContent = CLASSES[k].ten;
    b.append(cv2, t);
    b.addEventListener('click', () => { pickCls = k; helpRows(); });
    box.appendChild(b);
  }
}
function openHelp() {
  $('help').hidden = false; $('opt-fast').checked = expRate > 1; pickCls = P.cls; helpRows();
  for (const el of document.querySelectorAll('.offline-only')) el.hidden = ONLINE;
  for (const el of document.querySelectorAll('.online-only')) el.hidden = !ONLINE;
  $('acc-box').hidden = !ONLINE;
  if (ONLINE) {
    const acc = loadAcc();
    $('acc-who').textContent = `${P.name} · ${RACES[P.race].ten} (${RACES[P.race].phe}) · ${C().ten} · ${BACKGROUNDS[P.bg].ten}`;
    $('acc-code').value = acc ? acc.id + '.' + acc.key : '';
    $('acc-code').type = 'password';
    $('acc-rate').textContent = (net.rate > 1 ? `Máy chủ đang để EXP ×${net.rate} cho giai đoạn thử. ` : '') + `Giá đồ ở cửa hàng ×${String(net.shop).replace('.', ',')} giá thật trong giai đoạn thử.`;
  }
}
let firstRun = false;
function closeHelp() {
  $('help').hidden = true; if (!ONLINE) expRate = $('opt-fast').checked ? 5 : 1;
  changeClass(pickCls); save(); renderInv();
  if (firstRun) { firstRun = false; const s = npcs.find(n => n.seren); if (s) talk(s); }
  closeChat();
}
$('help-ok').addEventListener('click', closeHelp);
$('opt-reset').addEventListener('click', () => {               // tao nhan vat moi, choi lai tu Lv1
  $('help').hidden = true; CR.keep = false; P.target = null; P.path = null;
  openCreate();
});
addEventListener('resize', resize);

// ---------------- may chu: nhan anh chup the gioi, gui vi tri ----------------
function setStatus(t) { const el = $('net-status'); el.textContent = t; el.hidden = !t; }
function addOther(o) {
  const q = net.others.get(o.n) || { x: null, y: null, face: 0, flip: false, flags: 0, hp: 100, anim: 0, say: 0, line: '', zi: -1, buf: [], gap: 200, mt: -1 };
  Object.assign(q, o);
  net.others.set(o.n, q);
  return q;
}
// noi suy: luu cac moc vi tri theo dong ho may chu, ve lui lai mot chut (nguoi choi 350 ms, quai 150 ms) de luon co 2 moc ke nhau
function pushSample(e, t, x, y) {
  const b = e.buf || (e.buf = []), last = b[b.length - 1];
  if (last && t <= last.t) { if (t === last.t) { last.x = x; last.y = y; } return; }
  if (last && t - last.t > e.gap * 1.5) b.push({ t: t - e.gap, x: last.x, y: last.y });   // dang dung yen roi moi di: chen moc cu
  b.push({ t, x, y });
  if (b.length > 30) b.splice(0, b.length - 30);
}
function sampleAt(e, t) {
  const b = e.buf;
  if (!b || !b.length) return;
  if (t <= b[0].t) { e.x = b[0].x; e.y = b[0].y; e.moving = false; return; }
  for (let i = b.length - 1; i >= 0; i--) {
    if (b[i].t > t) continue;
    const a = b[i], c = b[i + 1];
    if (!c) {
      // het moc moi (mang cham mot nhip): di tiep theo huong cu toi da 150 ms roi moi dung, khong khung lai giua chung
      const p = b[i - 1], over = t - a.t;
      if (p && over < 150 && a.t - p.t > 0 && Math.hypot(a.x - p.x, a.y - p.y) < 80 && (a.x !== p.x || a.y !== p.y)) {
        const k = over / (a.t - p.t); e.x = a.x + (a.x - p.x) * k; e.y = a.y + (a.y - p.y) * k; e.moving = true;
      } else { e.x = a.x; e.y = a.y; e.moving = false; }
      return;
    }
    const k = (t - a.t) / (c.t - a.t);
    if (Math.hypot(c.x - a.x, c.y - a.y) > 80) { const s = k < .5 ? a : c; e.x = s.x; e.y = s.y; }   // dich chuyen, hoi sinh: nhay thang
    else { e.x = a.x + (c.x - a.x) * k; e.y = a.y + (c.y - a.y) * k; }
    e.moving = c.x !== a.x || c.y !== a.y;
    if (Math.abs(c.x - a.x) > .5) e.walkFlip = c.x < a.x;
    return;
  }
}
const serverNow = () => performance.now() + (net.off || 0);
function netTick(dt) {
  const T = serverNow();
  for (const m of mobs) {
    if (m.buf) sampleAt(m, T - 150);
    m.bob += dt * 6; m.hurt = Math.max(0, m.hurt - dt);
    if (m.lunge) m.lunge = Math.max(0, m.lunge - dt);
    if (m.wind) m.wind.t -= dt;
    if (!m.alive && m.dying > 0) m.dying -= dt;
  }
  for (const q of net.others.values()) { if (q.buf.length) sampleAt(q, T - 350); if (q.moving || q.flags & 1) q.anim += dt; q.say = Math.max(0, q.say - dt); }
  net.sentAt += dt; net.beat += dt;
  // co su kien (danh, ky nang): gui ngay (toi da 20 tin/giay); chi di chuyen: 5 tin/giay
  if (!net.up || net.sentAt < (net.out.length ? .05 : .2)) return;
  net.sentAt = 0;
  const st = (P.moving ? 1 : 0) | (P.atkAnim > 0 ? 2 : 0) | (P.dodge > 0 ? 4 : 0) | (P.dash ? 8 : 0);
  const msg = { t: 'u', z: net.zseq, x: Math.round(P.x * 10) / 10, y: Math.round(P.y * 10) / 10, f: FACE_IDX[P.face], fl: P.flip ? 1 : 0, s: st, hp: Math.round(P.hp) };
  const key = JSON.stringify(msg);
  if (!net.out.length && key === net.last && net.beat < 10) return;
  if (net.out.length) msg.ev = net.out.splice(0, 30);
  try { net.ws.send(JSON.stringify(msg)); } catch (e) { return; }
  net.last = key; net.beat = 0;
}
function onSnap(d) {
  clock = d.c;
  // dong ho may chu: lay moc den som nhat (it tre nhat), troi cham dan de theo kip
  const off = d.T - performance.now();
  net.off = net.off == null ? off : Math.max(off, net.off - 1);
  for (const a of d.p) {
    const [n, x, y, f, fl, flags, hp, lv, zi, mt] = a, q = net.others.get(n);
    if (n === net.me || !q) continue;
    if (q.zi !== zi) { q.buf = []; q.x = x; q.y = y; }
    if (q.x == null) { q.x = x; q.y = y; }
    if (mt !== q.mt) { pushSample(q, mt, x, y); q.mt = mt; }
    else if (!q.buf.length || Math.hypot(q.buf[q.buf.length - 1].x - x, q.buf[q.buf.length - 1].y - y) > 1) pushSample(q, d.T, x, y);
    Object.assign(q, { face: f, flip: !!fl, flags, hp, lv, zi });
  }
  // doi ban do truoc: quai cua ban do moi den cung goi nay, xu ly sau thi khong bi xoa mat
  if (d.e) for (const e of d.e) if (e[0] === 'map') onEvent(e);
  for (const a of d.m) {
    const [id, ki, x, y, hp, max, lv, face, fl, w, tgt] = a;
    let m = net.byId.get(id);
    if (!m) {
      const kind = net.kinds[ki];
      if (!LOAI[kind]) continue;
      m = { id, kind, t: LOAI[kind], x, y, home: { x, y }, bob: rnd(0, 6), hurt: 0, lunge: 0, dying: 0, dots: [], alive: !!(fl & 1), lv: 0, buf: [], gap: 100 };
      net.byId.set(id, m); mobs.push(m);
    }
    if (m.lv !== lv) { const b = R.mobBase(lv), k = BAC[m.t.bac]; m.def = m.t.fix ? m.t.fix.def : b.def * k.def; m.atk = m.t.fix ? m.t.fix.atk : b.atk * k.atk; }
    const alive = !!(fl & 1);
    if (m.alive && !alive) { m.dying = .4; if (P.target === m) P.target = null; }
    if (!m.alive && alive) { m.buf = []; m.x = x; m.y = y; m.dying = 0; }       // hoi sinh: hien ngay tai cho
    pushSample(m, d.T, x, y);
    Object.assign(m, { hp, max, lv, face, tgt, alive, hidden: !!(fl & 512), slowT: fl & 2 ? 1 : 0, rootT: fl & 4 ? 1 : 0,
      fearT: fl & 16 ? 1 : 0, blindT: fl & 32 ? 1 : 0, state: fl & 128 ? 'chase' : 'idle', scale: fl & 256 ? .75 : 1, evade: !!(fl & 1024), flipT: fl & 2048 ? 1 : 0 });
    if (fl & 8 && !m.hurt) m.hurt = .12;
    if (fl & 64 && !m.lunge) m.lunge = .2;
    m.wind = !w ? null : w[0] ? { kind: 'line', t: w[1], total: w[2], x: w[3], y: w[4], ux: w[5], uy: w[6], len: w[7], w: w[8] }
      : { kind: 'circle', t: w[1], total: w[2], x: w[3], y: w[4], r: w[5] };
  }
  if (d.g) for (const id of d.g) {
    const m = net.byId.get(id);
    if (!m) continue;
    net.byId.delete(id); const i = mobs.indexOf(m); if (i >= 0) mobs.splice(i, 1);
    if (P.target === m) P.target = null;
  }
  net.zz = d.zz != null ? d.zz : null;
  net.tl = d.tl != null ? d.tl : null;
  net.ox = d.ox != null ? d.ox : null;
  if (d.e && d.e.some(e => e[0] === 'map')) $('dmeter').hidden = true;     // doi ban do: bang sat thuong cu an di
  if (d.dm) renderMeter(d.dm);
  net.lamp = d.L || null;
  if (d.e) for (const e of d.e) if (e[0] !== 'map') onEvent(e);
}
const otherName = n => (net.others.get(n) || {}).name || '?';
function onEvent(e) {
  const m = typeof e[1] === 'number' ? net.byId.get(e[1]) : null;
  switch (e[0]) {
    case 'd': {                                                      // so sat thuong tren quai
      if (!m) return;
      const mine = e[4] === net.me;
      if (e[2] < 0) { if (mine) addFloat(m, 'Trượt', '#ddd'); return; }
      m.hurt = .12;
      if (mine) addFloat(m, e[3] ? e[2] + '!' : '' + e[2], e[3] ? '#FFD45A' : (e[5] || '#FFFFFF'), !!e[3]);
      else addFloat(m, '' + e[2], 'rgba(220,220,230,.7)');
      return;
    }
    case 'k': if (m) { m.alive = false; m.dying = .4; if (P.target === m) P.target = null; } return;
    case 'xp': log(`+${e[1]} EXP · +${e[2]} Đồng`, 'exp'); return;
    case 'me': Object.assign(P, { exp: e[1].exp, tien: e[1].tien }); return;
    case 'lv': {
      P.lv = e[1]; const s = S(); P.hp = s.hp; P.st = s.st; P.mp = s.mp;
      log(`Lên cấp ${P.lv}! Máu ${s.hp}, Công ${s.atk}`, 'good'); addFloat(P, 'Lên cấp!', '#9EE493', true);
      if (P.lv === MAX_LV) log('Đủ Lv20: ra Bến Tàu Lớn để lên tàu về thủ phủ phe.', 'good');
      if (P.lv === R.BRANCH_LV) log(`Đủ Lv20: mở Bảng kỹ năng (${keyName(BIND.skills)}) để chọn nhánh.`, 'good');
      renderInv(); renderSkills();
      return;
    }
    case 'plv': { const q = net.others.get(e[1]); if (q) q.lv = e[2]; return; }
    case 'pj': addOther(e[1]); log(`${e[1].name} vừa tới Đảo Bình Minh.`, ''); return;
    case 'pl': { const q = net.others.get(e[1]); if (q) log(`${q.name} đã rời đảo.`, ''); net.others.delete(e[1]); return; }
    case 'pos': P.x = e[1]; P.y = e[2]; P.path = null; P.dash = null; return;      // may chu keo ve vi tri hop le
    case 'st': {                                                     // quai ra don: xet minh co dung trong vet do khong
      const sh = e[2];
      let inside;
      if (sh[0] === 1) {
        const rx = P.x - sh[1], ry = P.y - sh[2], along = rx * sh[3] + ry * sh[4], side = Math.abs(-rx * sh[4] + ry * sh[3]);
        inside = along >= -3 && along <= sh[5] + 3 && side <= sh[6] / 2 + 2;
      } else inside = Math.hypot(P.x - sh[1], P.y - sh[2]) <= sh[3] + 2;
      if (e[6]) { if (inside && m) addFloat(m, 'Mù · trượt', '#ddd'); return; }
      if (inside) hitPlayer({ atk: e[4], lv: e[5], id: e[1] }, e[3], !!e[7]);
      else if (m && dist(m, P) < 4 * PX) addFloat(P, 'Tránh', '#cfe8ff');
      return;
    }
    case 'fx': if (e[1] === 0) addFloat(P, e[2], e[3]); else if (m) addFloat(m, e[2], e[3]); return;
    case 'log': log(e[1], e[2]); return;
    case 'chat': {
      const self = e[1] === net.me, who = self ? P : net.others.get(e[1]);
      chatLine(self ? P.name : otherName(e[1]), e[2], e[3] === 'd' ? 'party' : self ? 'self' : '');
      if (who) { who.say = 6; who.line = e[2]; who.party = e[3] === 'd'; }
      return;
    }
    case 'inv': Object.assign(P, { bag: e[1].bag, eq: e[1].eq, tien: e[1].tien }); if (e[1].farm) { P.farm = e[1].farm; P.farmOff = e[1].now - Date.now(); } renderInv(); if (!$('shop').hidden) renderShop(); if (TR) renderTrade(); renderFarm(); return;
    case 'dmf': showDmf(e[1], e[2], e[3]); return;
    case 'fq': showFrInvite(e[1], e[2], e[3]); return;
    case 'fl': FR = e[1]; renderFr(); return;
    case 'fv': showFrView(e[1]); return;
    case 'use': applyPotion(e[1]); return;
    case 'loot': if (e[3]) toastLoot(e[1], e[2], e[3]); return;
    case 'party': net.party = e[1]; renderParty(); return;
    case 'pinv': showInvite(e[1], e[2], e[3], e[4]); return;
    case 'tri': showTradeInvite(e[1], e[2], e[3], e[4]); return;
    case 'tw': onTrade(e[1]); return;
    case 'map': {                                                    // vao / ra Dungeon
      const [, key, zi, seq, x, y, open] = e;
      setMap(key); net.zi = zi; net.zseq = seq; P.x = x; P.y = y; P.sleep = 0; net.zz = null;
      if (MAP.gates) setGates(open);
      if (key !== 'dbm') log(`Vào ${MAP.name}. Hạ hết quái một tầng để mở cổng tầng sau, hạ Boss trong ${R.DUNGEONS.hhd.limit / 60} phút. EXP, tiền, đồ rơi trong hang chỉ nhận khi hạ Boss; hết giờ thì làm lại từ đầu. Nhấn E ở vòng sáng dưới đáy hang để ra.`, 'good');
      else log('Đã ra khỏi hang.', '');
      return;
    }
    case 'gate': setGates(e[1]); return;
    case 'oc': otherCast(e[1], e[2], e[3]); return;
    case 'sk': {                                                     // may chu bao nhanh va o ky nang (sau khi doi, hoac tu choi)
      const before = hudSig();
      P.br = e[1]; P.sl = e[2];
      if (hudSig() !== before) SKS().forEach((sk, i) => { P.cds[i] = sk ? sk.cd : 0; });
      renderSkills();
      return;
    }
    case 'ach': { const A = R.ACH.find(x => x.k === e[1]); if (A) { R.achOf(P).done[A.k] = Date.now(); achShow([A]); } if (ONLINE && !$('ach').hidden) send(['achq']); return; }
    case 'achs': P.ach = e[1]; renderAch(); return;
    case 'oa': {                                                     // nguoi khac danh thuong tam xa: ve dan / phep bay toi quai
      const q = net.others.get(e[1]), c = q && CLASSES[q.cls];
      const t = net.byId.get(e[2]);
      if (q && t && c && c.ban && q.zi === net.zi) for (let k = 0; k < (c.n || 1); k++) shots.push({ x: q.x, y: q.y - 7, a: 0, t, look: c.ban, q, delay: k * .08 });
      return;
    }
    case 'rc': showReady(e[1]); return;
    case 'sl': P.sleep = e[1]; P.path = null; P.target = null; addFloat(P, 'Ngủ gục!', '#CFE3FF', true); log('Bạn ngủ gục vì đứng ngoài vùng đèn quá lâu.', 'bad'); return;
  }
}
function connect(acc) {
  net.up = false; net.stop = false;
  let ws;
  try { ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/ws?id=' + encodeURIComponent(acc.id) + '&key=' + encodeURIComponent(acc.key)); }
  catch (e) { setStatus('Địa chỉ máy chủ không hợp lệ: ' + SERVER); return; }
  net.ws = ws;
  ws.onmessage = ev => {
    let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (d.t === 's') onSnap(d); else if (d.t === 'hi') onHi(d); else if (d.t === 'err') onErr(d);
  };
  ws.onclose = () => {
    net.up = false;
    if (net.stop) return;
    net.tries++;
    const wait = Math.min(15, net.tries * 2);
    setStatus(`Mất kết nối máy chủ, thử lại sau ${wait} giây…`);
    if (!started) LZ.msg(`Chưa kết nối được máy chủ (${SERVER}). Thử lại sau ${wait} giây… Muốn chơi một mình: thêm ?offline vào cuối địa chỉ.`);
    setTimeout(() => connect(acc), wait * 1000);
  };
}
function onHi(d) {
  net.me = d.me; net.rate = d.rate; net.shop = d.shop || .05; net.kinds = d.kinds; net.tries = 0; net.up = true; clock = d.clock; net.last = ''; net.off = null;
  net.zi = d.zi || 0; net.zseq = 0; net.party = null;
  setMap(d.map || 'dbm');
  const c = d.char;
  Object.assign(P, { name: c.name, race: c.race, cls: c.cls, gender: c.gender, outfit: c.outfit, bg: c.bg, lv: c.lv, exp: c.exp, tien: c.tien,
    eq: c.eq, bag: c.bag || [], br: c.br || null, sl: c.sl || null, ach: c.ach || {}, farm: c.farm || null, farmOff: (d.now || Date.now()) - Date.now(), x: d.x, y: d.y, path: null, target: null, dash: null, dead: 0, fx: {}, cds: [0, 0, 0], sleep: 0, hot: null });
  const s = S(); P.hp = s.hp; P.st = s.st; P.mp = s.mp; expRate = d.rate;
  hudCls = null;
  net.others.clear(); for (const o of d.others) addOther(o);
  setStatus('');
  $('dead').hidden = true;
  renderParty(); renderInv();
  if (!started) { start(); if (net.fresh) { net.fresh = false; firstRun = true; openHelp(); } else log(`Chào mừng trở lại, ${P.name} (Lv${P.lv}).`, 'good'); }
  else log('Đã kết nối lại máy chủ.', 'good');
}
function onErr(d) {
  net.stop = true;
  if (d.why === 'login') { try { localStorage.removeItem(ACC_KEY); } catch (e) { /* bo qua */ } LZ.done(); openCreate('Không đăng nhập được: ' + d.text); }
  else setStatus(d.text);
}

// ---------------- tro chuyen: khung chat rieng, kenh chung va kenh to doi ----------------
let chatCh = '';
function chatLine(who, text, kind) {
  const ol = $('chat-log'), li = document.createElement('li');
  if (kind) li.className = kind;
  if (kind === 'party') { const t = document.createElement('i'); t.textContent = '[Đội] '; li.appendChild(t); }
  if (who) { const b = document.createElement('b'); b.textContent = who + ': '; li.appendChild(b); }
  li.appendChild(document.createTextNode(text));
  ol.appendChild(li);
  while (ol.children.length > 60) ol.removeChild(ol.firstChild);
  ol.scrollTop = ol.scrollHeight;
  const box = $('chatbox'); box.hidden = false; box.classList.add('fresh');
  clearTimeout(chatLine.t); chatLine.t = setTimeout(() => box.classList.remove('fresh'), 12000);
}
function openChat() {
  $('chatbox').hidden = false; $('chatbox').classList.add('typing', 'fresh');
  $('chat').hidden = false; $('chat-in').value = ''; $('chat-in').focus(); keys.clear();
  setChatCh(chatCh);
}
function closeChat() { $('chat').hidden = true; $('chat-in').blur(); $('chatbox').classList.remove('typing'); }
function setChatCh(ch) {
  chatCh = ch && net.party ? 'd' : '';
  $('chat-ch').textContent = chatCh ? 'Đội' : 'Chung';
  $('chat-ch').classList.toggle('party', !!chatCh);
  $('chat-in').placeholder = chatCh ? 'Nói với tổ đội… (Enter gửi)' : 'Nói với mọi người… (Enter gửi, /d để nói với đội)';
}
$('chat-ch').addEventListener('click', () => { if (!net.party) { log('Bạn chưa ở trong tổ đội.', ''); return; } setChatCh(chatCh ? '' : 'd'); $('chat-in').focus(); });
$('chat').addEventListener('submit', e => {
  e.preventDefault();
  let t = $('chat-in').value.trim();
  // lenh: /d noi voi doi, /moi Ten moi vao doi, /roi roi doi
  const cmd = t.match(/^\/(\S+)\s*(.*)$/);
  if (cmd) {
    const [, c, rest] = cmd;
    if (c === 'd' || c === 'doi' || c === 'đội') { if (rest) send(['m', rest.slice(0, 120), 'd']); }
    else if (c === 'moi' || c === 'mời') { if (rest) send(['pi', rest]); }
    else if (c === 'roi' || c === 'rời') send(['pq']);
    else log('Lệnh: /d <lời> nói với đội, /moi <tên> mời vào đội, /roi rời đội.', '');
    closeChat(); return;
  }
  if (t) send(['m', t.slice(0, 120), chatCh]);
  closeChat();
});
$('chat-in').addEventListener('keydown', e => { if (e.key === 'Escape') closeChat(); if (e.key === 'Tab') { e.preventDefault(); $('chat-ch').click(); } e.stopPropagation(); });

// ---------------- to doi ----------------
function renderParty() {
  const box = $('party'), pt = net.party;
  box.hidden = !pt;
  if (!pt) { if (chatCh) setChatCh(''); return; }
  const list = $('party-list'); list.textContent = '';
  for (const o of pt.m) {
    const li = document.createElement('li'); li.dataset.n = o.n;
    const nm = document.createElement('b'); nm.textContent = (o.n === pt.leader ? '★ ' : '') + o.name;
    const rcm = net.rc && net.rc.m.find(x => x[0] === o.n);
    if (rcm) { const tag = document.createElement('em'); tag.className = 'rdy' + (rcm[2] ? ' ok' : ''); tag.textContent = rcm[2] ? ' ✓ Sẵn sàng' : ' … Đang chờ'; nm.appendChild(tag); }
    const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = `Lv${o.lv} · ${CLASSES[o.cls].ten}`;
    const bar2 = document.createElement('div'); bar2.className = 'bar hp mini'; bar2.innerHTML = '<i></i>';
    li.append(nm, sub, bar2);
    if (pt.leader === net.me && o.n !== net.me) {
      const k = document.createElement('button'); k.type = 'button'; k.className = 'kick'; k.textContent = '×'; k.title = 'Mời ra khỏi đội';
      k.addEventListener('click', () => send(['pk', o.n])); li.appendChild(k);
    }
    list.appendChild(li);
  }
  $('party-title').textContent = `Tổ đội ${pt.m.length}/${R.PARTY_MAX}`;
}
function hudParty() {
  const pt = net.party;
  if (!pt) return;
  for (const li of $('party-list').children) {
    const n = +li.dataset.n, q = n === net.me ? null : net.others.get(n);
    const hp = n === net.me ? P.hp / S().hp * 100 : q ? q.hp : 0;
    li.querySelector('i').style.width = hp + '%';
    li.classList.toggle('away', !!q && q.zi !== net.zi);
    li.classList.toggle('down', !!q && !!(q.flags & 64));
  }
}
$('party-leave').addEventListener('click', () => send(['pq']));
function openPcard(q, cx, cy) {
  const box = $('pcard');
  $('pc-name').textContent = q.name;
  $('pc-sub').textContent = `Lv${q.lv} · ${RACES[q.race] ? RACES[q.race].ten : ''} · ${CLASSES[q.cls].ten}`;
  const inParty = net.party && net.party.m.some(o => o.n === q.n);
  $('pc-inv').hidden = inParty; $('pc-in').hidden = !inParty;
  $('pc-inv').onclick = () => { send(['pi', q.n]); box.hidden = true; };
  $('pc-fr').hidden = FR.some(f => f[0] === q.name);
  $('pc-fr').onclick = () => { send(['fa', q.n]); box.hidden = true; };
  box.dataset.n = q.n;
  box.hidden = false;
  box.style.left = Math.min(innerWidth - 230, cx + 8) + 'px'; box.style.top = Math.min(innerHeight - 140, cy + 8) + 'px';
}
$('pc-close').addEventListener('click', () => { $('pcard').hidden = true; });
let invTimer = 0;
function showInvite(n, name, lv, cls) {
  $('pinv-text').textContent = `${name} (Lv${lv}, ${CLASSES[cls] ? CLASSES[cls].ten : ''}) mời bạn vào tổ đội.`;
  $('pinv').hidden = false;
  clearTimeout(invTimer); invTimer = setTimeout(() => { $('pinv').hidden = true; }, 30000);
}
$('pinv-ok').addEventListener('click', () => { send(['pa']); $('pinv').hidden = true; });
// kiem tra san sang truoc khi ca to doi vao Dungeon (may chu gui danh sach; null = dong)
let rcTimer = 0, rcLeft = 0;
function showReady(d) {
  const box = $('rc');
  clearInterval(rcTimer);
  net.rc = d; renderParty();
  if (!d) { box.hidden = true; return; }
  box.hidden = false;
  $('rc-title').textContent = `Vào ${d.ten} cùng tổ đội`;
  const ul = $('rc-list'); ul.textContent = '';
  let mine = 0;
  for (const [n, name, ok] of d.m) {
    const li = document.createElement('li'); li.className = ok ? 'ok' : '';
    li.textContent = (ok ? '✓ ' : '… ') + name + (n === d.leader ? ' (đội trưởng)' : '');
    ul.appendChild(li);
    if (n === net.me) mine = ok;
  }
  $('rc-ok').hidden = $('rc-no').hidden = !!mine;
  $('rc-wait').hidden = !mine;
  rcLeft = d.left;
  const tick = () => { $('rc-time').textContent = `Còn ${Math.max(0, rcLeft)} giây`; rcLeft--; };
  tick(); rcTimer = setInterval(tick, 1000);
}
$('rc-ok').addEventListener('click', () => send(['ry', 1]));
$('rc-no').addEventListener('click', () => send(['ry', 0]));
$('pinv-no').addEventListener('click', () => { send(['pd']); $('pinv').hidden = true; });

// ---------------- tui do va trang bi ----------------
const itemName = it => ITEMS[it.k].ten + (it.up ? ' +' + it.up : '') + (it.r ? ' (' + RARITY[it.r].ten + ')' : '');
const iconKey = k => { const I = ITEMS[k]; if (!I) return null; if (I.slot === 'vk') return 'vk_' + I.cls; if (I.giap) return I.slot + '_' + I.giap; if (I.heal) return I.heal.hp ? 'hp' : 'mp'; if (I.slot === 'bong') return 'bong_' + (I.el || I.gem); if (R.ACC.includes(I.slot)) return I.slot; return k; };
function iconEl(it, size = 32) {
  const n = 16 * (ICO.s || 1), c2 = document.createElement('canvas'); c2.width = n; c2.height = n; c2.style.width = c2.style.height = size + 'px'; c2.className = 'ico';
  const key = iconKey(it.k), [im, f] = ICO.f[key] ? [IMG.ico, ICO.f[key]] : RIENG.f[key] ? [IMG.rieng, RIENG.f[key]] : [IMG.tmp, TMP.f[key]];
  if (f && im) { const g = c2.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, f[0], f[1], f[2], f[3], 0, 0, n, n); }
  return c2;
}
let sel = null;                                                       // { from: 'bag' | 'eq', i | sl }
function toggleInv() { if ($('inv').hidden) openInv(); else closeInv(); }
function openInv() { closeShop(); closeSkills(); closeAch(); closeSocial(); $('inv').hidden = false; sel = null; renderInv(); }
function closeInv() { $('inv').hidden = true; sel = null; }
$('inv-close').addEventListener('click', closeInv);
const pctTxt = v => num(Math.round(v * 1000) / 10) + '%';
const isPct = k => ['ne', 'mana', 'crit', 'cd', 'aspd'].includes(k) || k.startsWith('el_');
const statTxt = (k, v) => '+' + (isPct(k) ? num(v * 100) + '%' : num(v));
function statRows(s) {
  const c = C(), els = R.classEls(P.cls);
  const rows = [['Máu', s.hp], [c.tl === 'mana' ? 'MATK' : 'ATK', s.atk], ['Giáp', s.def], ['Kháng phép', s.mres], ['Né', Math.round(s.ne * 100) + '%'],
    s.mp ? ['Mana', s.mp] : ['Thể Lực', s.st], ['Tầm', num(c.tam) + ' m'], ['Tốc đánh', num(Math.round(s.aspd * 100) / 100) + ' đòn/giây'],
    ['Chí mạng', pctTxt(s.crit)], ['Sát thương chí mạng', pctTxt(s.cd)], ['Hệ sát thương', els.map(e => R.EL[e]).join(', ')]];
  for (const [e, v] of Object.entries(s.el || {})) if (v) rows.push(['Sát thương ' + R.EL[e], '+' + pctTxt(v)]);
  return rows;
}
function renderInv() {
  if ($('inv').hidden || !P.eq) return;
  const s = S();
  // o trang bi
  for (const sl of SLOTS) {
    const el = $('eq-' + sl), it = P.eq[sl];
    el.textContent = ''; el.className = 'slot' + (sel && sel.from === 'eq' && sel.sl === sl ? ' sel' : '');
    if (it) {
      el.appendChild(iconEl(it));
      el.style.borderColor = RARITY[it.r || 0].col;
      if (!R.itemOk(it, P.lv)) el.classList.add('broken');
      const db = document.createElement('i'); db.className = 'dur'; db.style.width = it.d + '%'; db.style.background = it.d < 30 ? '#F08A80' : '#8BD17C'; el.appendChild(db);
    } else { el.style.borderColor = ''; const t = document.createElement('span'); t.textContent = SLOT_TEN[sl]; el.appendChild(t); }
  }
  const st = $('inv-stats'); st.textContent = '';
  for (const [a, b] of statRows(s)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = a; dd.textContent = b; st.append(dt, dd); }
  $('inv-who').textContent = `${P.name || C().ten} · Lv${P.lv} ${C().ten} · giáp ${R.GIAP_LOAI[C().giap]}`;
  // tui
  const grid = $('bag'); grid.textContent = '';
  for (let i = 0; i < R.BAG_MAX; i++) {
    const it = P.bag[i], b = document.createElement('button');
    b.type = 'button'; b.className = 'cell' + (sel && sel.from === 'bag' && sel.i === i ? ' sel' : '');
    if (it) {
      b.appendChild(iconEl(it));
      b.style.borderColor = ITEMS[it.k].base ? RARITY[it.r || 0].col : '';
      if (it.n > 1) { const n = document.createElement('em'); n.textContent = it.n; b.appendChild(n); }
      if (ITEMS[it.k].base && R.canEquip(P, it)) b.classList.add('cant');
      b.title = itemName(it);
      b.addEventListener('click', () => { sel = { from: 'bag', i }; renderInv(); });
      b.addEventListener('dblclick', () => { sel = { from: 'bag', i }; primaryAction(); });
      if (quickOk(it.k)) { b.draggable = true; b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'lzq:' + it.k); e.dataTransfer.effectAllowed = 'copyMove'; }); }
    } else b.disabled = true;
    grid.appendChild(b);
  }
  setMoney($('inv-money'), P.tien, ` · Túi ${P.bag.length}/${R.BAG_MAX}`);
  renderDetail();
}
function selItem() { return !sel ? null : sel.from === 'bag' ? P.bag[sel.i] : P.eq[sel.sl]; }
function renderDetail() {
  const box = $('inv-detail'), it = selItem();
  box.textContent = '';
  if (!it) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Bấm vào một món để xem chỉ số. Bấm đúp để mặc hoặc dùng. Mua đồ và bình thuốc ở Bà Mira (Chợ Cảng), sửa đồ ở Thợ Rèn Bram.'; box.appendChild(p); return; }
  const I = ITEMS[it.k];
  const h = document.createElement('h3'); h.textContent = itemName(it); h.style.color = I.base ? RARITY[it.r || 0].col : ''; box.appendChild(h);
  const meta = document.createElement('p'); meta.className = 'meta';
  meta.textContent = I.base ? `${SLOT_TEN[I.slot]} · Lv${I.lv}${I.cls ? ' · ' + CLASSES[I.cls].ten : I.giap ? ' · giáp ' + R.GIAP_LOAI[I.giap] : ' · trang sức, class nào cũng đeo được'} · ${RARITY[it.r || 0].ten}` : (I.mo || '');
  box.appendChild(meta);
  if (I.base) {
    const ul = document.createElement('ul'); ul.className = 'lines';
    const cur = itemStats(it), other = sel.from === 'bag' ? P.eq[I.slot] : null, ost = other ? R.itemStats(other) : null;
    for (const [k, v] of Object.entries(cur)) {
      const li = document.createElement('li');
      li.textContent = `${STAT_TEN[k]} ${statTxt(k, v)}`;
      if (sel.from === 'bag') {
        const dv = v - (ost && ost[k] ? ost[k] : 0);
        if (Math.abs(dv) > (isPct(k) ? .0001 : .01)) { const sp = document.createElement('span'); sp.className = dv > 0 ? 'up' : 'down'; sp.textContent = ` (${dv > 0 ? '+' : '−'}${statTxt(k, Math.abs(dv)).slice(1)})`; li.appendChild(sp); }
      }
      ul.appendChild(li);
    }
    for (const [k, v] of it.s || []) { const li = document.createElement('li'); li.className = 'sub'; li.textContent = `${STAT_TEN[k]} +${v}% (dòng phụ)`; ul.appendChild(li); }
    box.appendChild(ul);
    const dur = document.createElement('p'); dur.className = 'meta';
    dur.textContent = `Độ bền ${Math.floor(it.d)} / ${it.dm}` + (it.dm < 50 ? ' · Cũ: −10% chỉ số chính' : '') + (it.d <= 0 ? ' · hỏng, mất tác dụng tới khi sửa' : '');
    box.appendChild(dur);
    const why = R.canEquip(P, it);
    if (why && sel.from === 'bag') { const w = document.createElement('p'); w.className = 'warn'; w.textContent = why; box.appendChild(w); }
  }
  const btns = document.createElement('div'); btns.className = 'btns';
  const btn = (t, fn, ghost) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (ghost) b.className = 'ghost'; b.addEventListener('click', fn); btns.appendChild(b); };
  if (sel.from === 'eq') btn('Tháo ra', () => invOp(['uq', sel.sl]));
  else if (I.base) btn('Mặc', primaryAction);
  else if (I.heal || I.an) { btn('Dùng', primaryAction); if (!QUICK.includes(it.k)) btn('Đặt vào ô nhanh', () => putQuick(it.k), true); }
  if (sel.from === 'bag' && nearNpc(R.SHOP_NPC) && I.gia) btn(`Bán (+${money(R.sellPrice(it, shopRate()))})`, () => invOp(['sell', sel.i, it.k]), true);
  box.appendChild(btns);
}
const itemStats = it => R.itemStats(it);
function primaryAction() {
  const it = selItem();
  if (!it || sel.from !== 'bag') return;
  const I = ITEMS[it.k];
  if (I.base) invOp(['eq', sel.i, it.k]);
  else if (I.heal || I.an) invOp(['use', sel.i, it.k]);
}
const nearNpc = N => MAP.key === 'dbm' && Math.hypot(P.x - N.x, P.y - N.y) <= R.NPC_NEAR * PX;
// thao tac tui: choi mang gui may chu (may chu kiem tra roi tra lai tui moi); choi mot minh lam ngay bang ham chung
function invOp(e) {
  if (ONLINE) { send(e); return; }
  let why = '', msg = '';
  const rate = shopRate();
  switch (e[0]) {
    case 'eq': why = R.doEquip(P, e[1]); if (!why) msg = 'Đã mặc ' + ITEMS[e[2]].ten + '.'; break;
    case 'uq': why = R.doUnequip(P, e[1]); break;
    case 'buy': why = nearNpc(R.SHOP_NPC) ? R.doBuy(P, e[1], rate, e[2] === 1 ? 1 : 0) : 'Hãy đứng gần Bà Mira.'; if (!why) msg = `Đã mua ${ITEMS[e[1]].ten}${e[2] === 1 && ITEMS[e[1]].base ? ' (Tốt)' : ''}.`; break;
    case 'sell': { const v = R.sellPrice(P.bag[e[1]], rate); why = R.doSell(P, e[1], rate); if (!why) msg = `Đã bán (+${money(v)}).`; break; }
    case 'rep': { const cost = R.repairCost(P, rate); why = nearNpc(R.SMITH_NPC) ? R.doRepair(P, rate) : 'Hãy đứng gần Thợ Rèn Bram.'; if (!why) msg = `Đã sửa trang bị (−${money(cost)}).`; break; }
    case 'use': { const it = P.bag[e[1]]; if (!it) return; const k = it.k; if (--it.n <= 0) P.bag.splice(e[1], 1); applyPotion(k); break; }
    case 'ren': { const [w, ok, cost] = nearNpc(R.SMITH_NPC) ? R.doRen(P, e[1], rate) : ['Hãy đứng gần Thợ Rèn Bram.']; why = w; if (!why) { if (ok) msg = `Rèn thành công: ${itemName(P.eq[e[1]])}! (−${money(cost)})`; else log(`Rèn thất bại (−${money(cost)}).`, 'bad'); } break; }
    case 'fp': why = P.cls === 'nd' && !(MAP.key === 'dbm' && R.nearField(P)) ? 'Hãy ra ruộng cạnh Xưởng Nghề để trồng.' : R.doPlant(P, e[1], e[2], Date.now()); if (!why) msg = `Đã trồng ${ITEMS[e[2]].ten}.`; break;
    case 'fh': { const [w, n] = P.cls === 'nd' && !(MAP.key === 'dbm' && R.nearField(P)) ? ['Hãy ra ruộng cạnh Xưởng Nghề để thu hoạch.'] : R.doHarvest(P, e[1], Date.now()); why = w; if (!why) msg = `Thu hoạch ${n} nông sản.`; break; }
    case 'ck': why = R.doCook(P, e[1]); if (!why) msg = `Đã nấu ${ITEMS[e[1]].ten}.`; break;
  }
  if (why) log(why, 'bad'); else if (msg) log(msg, 'good');
  if (sel && sel.from === 'bag' && !P.bag[sel.i]) sel = null;
  if (e[0] === 'uq' || e[0] === 'eq') sel = null;
  save(); renderInv(); if (!$('shop').hidden) renderShop(); renderFarm();
}
function applyPotion(k) {
  const I = ITEMS[k], s = S();
  if (I && I.an) { P.fx[I.an[0]] = { t: I.an[2], v: I.an[1] }; addFloat(P, I.ten, '#FFB45A'); return; }
  if (!I || !I.heal) return;
  P.hot = { t: 10, hp: I.heal.hp ? s.hp * I.heal.hp / 10 : 0, mp: I.heal.mp ? s.mp * I.heal.mp / 10 : 0 };
  addFloat(P, I.ten, I.heal.hp ? '#9EE493' : '#9FB4FF');
}
function quickPotion() {
  if (P.dead) return;
  const i = P.bag.findIndex(b => b.k === 'hp1' || b.k === 'hp2');
  if (i < 0) { log('Hết bình máu. Mua ở Bà Mira, Chợ Cảng.', 'bad'); return; }
  invOp(['use', i, P.bag[i].k]);
}
function toastLoot(k, r, name) {
  const el = $('loot'); el.textContent = '';
  el.appendChild(iconEl({ k }, 28));
  const t = document.createElement('span'); t.textContent = name; t.style.color = RARITY[r].col; el.appendChild(t);
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastLoot.t); toastLoot.t = setTimeout(() => { el.hidden = true; }, 3500);
  renderInv();
}

// ---------------- cua hang (Ba Mira) va tho ren (Bram) ----------------
let shopTab = 'buy', shopMine = true, shopGood = false;
function openShop() { closeInv(); closeSocial(); shopTab = 'buy'; $('shop').hidden = false; $('shop-title').textContent = `${R.SHOP_NPC.ten} · ${R.SHOP_NPC.vai}`; $('shop').dataset.kind = 'shop'; renderShop(); }
function openSmith() { closeInv(); closeSocial(); shopTab = 'rep'; $('shop').hidden = false; $('shop-title').textContent = `${R.SMITH_NPC.ten} · ${R.SMITH_NPC.vai}`; $('shop').dataset.kind = 'smith'; renderShop(); }
function closeShop() { $('shop').hidden = true; tipEl.hidden = true; }
$('shop-close').addEventListener('click', closeShop);
document.querySelectorAll('#shop-tabs button').forEach(b => b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); }));
$('shop-mine').addEventListener('change', e => { shopMine = e.target.checked; renderShop(); });
$('shop-good').addEventListener('change', e => { shopGood = e.target.checked; renderShop(); });
function shopRow(it, name, sub, priceTxt, btnTxt, fn, col, disabled) {
  const li = document.createElement('li');
  li.appendChild(iconEl(it, 28));
  const t = document.createElement('div'); t.className = 'nm';
  const b = document.createElement('b'); b.textContent = name; if (col) b.style.color = col;
  const s = document.createElement('span'); s.textContent = sub;
  t.append(b, s); li.appendChild(t);
  const p = document.createElement('span'); p.className = 'price'; if (typeof priceTxt === 'number') setMoney(p, priceTxt); else p.textContent = priceTxt; li.appendChild(p);
  const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = btnTxt; bt.disabled = !!disabled; bt.addEventListener('click', fn); li.appendChild(bt);
  return li;
}
// chu thich khi di chuot vao mon do (cua hang, tho ren): ten, loai, chi so, so voi mon dang mac
const tipEl = document.createElement('div'); tipEl.className = 'itip'; tipEl.hidden = true; document.body.appendChild(tipEl);
function itemTip(el, it, extra) {
  el.addEventListener('mouseenter', () => { fillTip(it, extra); tipEl.hidden = false; });
  el.addEventListener('mousemove', e => {
    tipEl.style.left = Math.max(4, Math.min(innerWidth - tipEl.offsetWidth - 8, e.clientX + 16)) + 'px';
    tipEl.style.top = Math.max(4, Math.min(innerHeight - tipEl.offsetHeight - 8, e.clientY + 16)) + 'px';
  });
  el.addEventListener('mouseleave', () => { tipEl.hidden = true; });
}
function fillTip(it, extra) {
  const I = ITEMS[it.k]; tipEl.textContent = '';
  const h = document.createElement('b'); h.textContent = itemName(it); h.style.color = I.base ? RARITY[it.r || 0].col : '';
  const m = document.createElement('p'); m.className = 'meta';
  m.textContent = I.base ? `${SLOT_TEN[I.slot]} · Lv${I.lv}` + (I.cls ? ' · ' + CLASSES[I.cls].ten : I.giap ? ' · giáp ' + R.GIAP_LOAI[I.giap] : ' · class nào cũng đeo được') : (I.mo || '');
  tipEl.append(h, m);
  const st = R.itemStats(it);
  if (st) {
    const cur = P.eq && P.eq[I.slot] !== it ? R.itemStats(P.eq[I.slot]) : null, ul = document.createElement('ul');
    for (const [k, v] of Object.entries(st)) {
      const li = document.createElement('li'); li.textContent = `${STAT_TEN[k]} ${statTxt(k, v)}`;
      const dv = v - (cur && cur[k] ? cur[k] : 0);
      if (P.eq && P.eq[I.slot] !== it && Math.abs(dv) > (isPct(k) ? .0001 : .01)) { const sp = document.createElement('span'); sp.className = dv > 0 ? 'up' : 'down'; sp.textContent = ` (${dv > 0 ? '+' : '−'}${statTxt(k, Math.abs(dv)).slice(1)})`; li.appendChild(sp); }
      ul.appendChild(li);
    }
    for (const [k, v] of it.s || []) { const li = document.createElement('li'); li.className = 'sub'; li.textContent = `${STAT_TEN[k]} +${v}% (dòng phụ)`; ul.appendChild(li); }
    tipEl.appendChild(ul);
  }
  for (const t of extra || []) { const q = document.createElement('p'); q.className = 'meta'; q.textContent = t; tipEl.appendChild(q); }
}
// the mon do dang luoi: hinh, ten, dong phu ngan, gia, nut
function card(it, name, sub, priceTxt, btnTxt, fn, col, disabled, extra) {
  const li = document.createElement('li'); li.className = 'card';
  li.appendChild(iconEl(it, 36));
  const t = document.createElement('div'); t.className = 'nm';
  const b = document.createElement('b'); b.textContent = name; if (col) b.style.color = col;
  const sp = document.createElement('span'); sp.textContent = sub;
  t.append(b, sp); li.appendChild(t);
  const foot = document.createElement('div'); foot.className = 'foot';
  const pr = document.createElement('span'); pr.className = 'price'; if (typeof priceTxt === 'number') setMoney(pr, priceTxt); else pr.textContent = priceTxt;
  const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = btnTxt; bt.disabled = !!disabled; bt.addEventListener('click', fn);
  foot.append(pr, bt); li.appendChild(foot);
  itemTip(li, it, extra);
  return li;
}
const SHOP_CATS = [['all', 'Tất cả'], ['vk', 'Vũ khí'], ['giap', 'Giáp'], ['ts', 'Trang sức'], ['tieu', 'Bình thuốc'], ['nong', 'Hạt giống']];
const catOf = I => (I.slot === 'vk' ? 'vk' : R.ARMOR.includes(I.slot) ? 'giap' : R.ACC.includes(I.slot) ? 'ts' : I.grow ? 'nong' : 'tieu');
let shopCat = 'all';
function renderShop() {
  const kind = $('shop').dataset.kind, list = $('shop-list'), rate = shopRate();
  tipEl.hidden = true;
  list.textContent = ''; list.className = 'shop-grid';
  document.querySelectorAll('#shop-tabs button').forEach(b => { b.hidden = b.dataset.k !== kind; b.setAttribute('aria-pressed', b.dataset.tab === shopTab ? 'true' : 'false'); });
  $('shop-filter').hidden = $('shop-good-l').hidden = !(kind === 'shop' && shopTab === 'buy');
  setMoney($('shop-money'), P.tien);
  const near = kind === 'shop' ? nearNpc(R.SHOP_NPC) : nearNpc(R.SMITH_NPC);
  $('shop-note').textContent = !near ? 'Bạn đã đi xa, hãy quay lại gần NPC.' : kind === 'smith' && shopTab === 'ren'
    ? `Rèn trang bị đang mặc: mỗi cấp +5% chỉ số chính, tối đa +${R.REN_MAX}. Thất bại chỉ mất tiền, không tụt cấp, không vỡ đồ.`
    : kind === 'smith' ? 'Sửa: 2% giá món cho mỗi 10% độ bền đã mất. Mỗi lần sửa, độ bền tối đa tụt 2 điểm cho mỗi 10% sửa (thấp nhất 20); dưới 50 là đồ Cũ, −10% chỉ số.'
    : shopTab === 'buy' ? 'Di chuột vào món đồ để xem chỉ số và so với đồ đang mặc.' : 'NPC mua lại 3% giá đồ.';
  const empty = t => { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t; list.appendChild(li); };
  if (kind === 'smith' && shopTab === 'ren') {
    list.className = 'ren-grid';
    for (const sl of SLOTS) {
      const it = P.eq[sl]; if (!it) continue;
      const up = it.up || 0, max = up >= R.REN_MAX, cost = max ? 0 : R.renCost(it, rate), I = ITEMS[it.k];
      const li = document.createElement('li'); li.className = 'ren' + (max ? ' max' : '');
      li.appendChild(iconEl(it, 40));
      const t = document.createElement('div'); t.className = 'nm';
      const b = document.createElement('b'); b.textContent = itemName(it); b.style.color = RARITY[it.r || 0].col;
      const pips = document.createElement('div'); pips.className = 'pips';
      for (let k = 0; k < R.REN_MAX; k++) { const d = document.createElement('i'); d.className = k < up ? 'on' : k === up ? 'next' : ''; pips.appendChild(d); }
      const st = R.itemStats(it), nx = R.itemStats(Object.assign({}, it, { up: up + 1 }));
      const pv = document.createElement('span'); pv.className = 'pv';
      pv.textContent = max ? 'Đã rèn tối đa' : Object.keys(st).map(k => `${STAT_TEN[k]} ${statTxt(k, st[k]).slice(1)} → ${statTxt(k, nx[k]).slice(1)}`).join(' · ');
      t.append(b, pips, pv); li.appendChild(t);
      const side = document.createElement('div'); side.className = 'side';
      if (!max) {
        const ch = document.createElement('div'); ch.className = 'chance'; const pc = Math.round(R.REN_RATE[up] * 100);
        ch.innerHTML = '<i></i><span></span>'; ch.querySelector('i').style.width = pc + '%'; ch.querySelector('span').textContent = `+${up + 1} · ${pc}%`;
        ch.classList.toggle('low', pc < 50);
        const pr = document.createElement('span'); pr.className = 'price'; setMoney(pr, cost);
        const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Rèn'; bt.disabled = !near || P.tien < cost; bt.addEventListener('click', () => invOp(['ren', sl]));
        side.append(ch, pr, bt);
      }
      li.appendChild(side);
      itemTip(li, it, [`${SLOT_TEN[sl]} · đang rèn +${up}`]);
      list.appendChild(li);
    }
    return;
  }
  if (kind === 'smith') {
    list.className = 'ren-grid';
    for (const sl of SLOTS) {
      const it = P.eq[sl]; if (!it) continue;
      const lost = it.dm - it.d, cost = lost > 0 ? Math.round(Math.ceil(lost / 10) * ITEMS[it.k].gia * .02 * rate) : 0;
      const li = document.createElement('li'); li.className = 'ren';
      li.appendChild(iconEl(it, 40));
      const t = document.createElement('div'); t.className = 'nm';
      const b = document.createElement('b'); b.textContent = itemName(it); b.style.color = RARITY[it.r || 0].col;
      const bar = document.createElement('div'); bar.className = 'chance dur' + (it.d < 30 ? ' low' : ''); bar.innerHTML = '<i></i><span></span>';
      bar.querySelector('i').style.width = Math.round(it.d) + '%'; bar.querySelector('span').textContent = `Độ bền ${Math.floor(it.d)} / ${it.dm}`;
      t.append(b, bar); li.appendChild(t);
      const side = document.createElement('div'); side.className = 'side';
      const pr = document.createElement('span'); pr.className = 'price'; if (cost) setMoney(pr, cost); else pr.textContent = 'Còn nguyên';
      side.appendChild(pr); li.appendChild(side);
      itemTip(li, it);
      list.appendChild(li);
    }
    const all = R.repairCost(P, rate), li = document.createElement('li'); li.className = 'total';
    const t = document.createElement('b'); t.textContent = all ? `Sửa tất cả: ${money(all)}` : 'Trang bị còn nguyên, không cần sửa.';
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Sửa tất cả'; bt.disabled = !all || !near || P.tien < all; bt.addEventListener('click', () => invOp(['rep']));
    li.append(t, bt); list.appendChild(li);
    return;
  }
  if (shopTab === 'buy') {
    const cats = document.createElement('li'); cats.className = 'cats';
    for (const [k, t] of SHOP_CATS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', shopCat === k ? 'true' : 'false'); b.addEventListener('click', () => { shopCat = k; renderShop(); }); cats.appendChild(b); }
    list.appendChild(cats);
    for (const [ck, ct] of SHOP_CATS.slice(1)) {
      if (shopCat !== 'all' && shopCat !== ck) continue;
      const ks = R.SHOP.filter(k => {
        const I = ITEMS[k];
        if (catOf(I) !== ck) return false;
        if (shopMine && I.base && ((I.cls && I.cls !== P.cls) || (I.giap && I.giap !== C().giap))) return false;
        return !(shopMine && I.grow && P.cls !== 'nd');
      });
      if (!ks.length) continue;
      if (shopCat === 'all') { const h = document.createElement('li'); h.className = 'head'; h.textContent = ct; list.appendChild(h); }
      for (const k of ks) {
        const I = ITEMS[k], r = shopGood && I.base ? 1 : 0, p = R.price(k, rate, r);
        list.appendChild(card({ k, r }, I.ten + (r ? ' (Tốt)' : ''), I.base ? `Lv${I.lv}` + (I.giap ? ' · ' + R.GIAP_LOAI[I.giap] : '') : (I.mo || ''), p, 'Mua', () => invOp(['buy', k, r]),
          r ? RARITY[1].col : '', !near || P.tien < p, r ? ['Phẩm Tốt: thêm 1 dòng phụ ngẫu nhiên'] : null));
      }
    }
  } else {
    P.bag.forEach((it, i) => {
      const I = ITEMS[it.k];
      list.appendChild(card(it, itemName(it) + (it.n > 1 ? ' ×' + it.n : ''), I.base ? `Lv${I.lv} · độ bền ${Math.floor(it.d)}/${it.dm}` : '', I.gia ? R.sellPrice(it, rate) : 'Không mua',
        'Bán', () => invOp(['sell', i, it.k]), I.base ? RARITY[it.r || 0].col : '', !near || !I.gia));
    });
    if (!P.bag.length) empty('Túi trống.');
  }
}
for (const sl of SLOTS) $('eq-' + sl).addEventListener('click', () => { if (P.eq && P.eq[sl]) { sel = { from: 'eq', sl }; renderInv(); } });

// ---------------- tao nhan vat ----------------
const CR = { race: 'human', cls: 'cb', gender: 'm', outfit: 0, bg: 'linh', face: 0, timer: 0, keep: false };
function chip(box, label, sub, on, click) {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const t = document.createElement('b'); t.textContent = label; b.appendChild(t);
  if (sub) { const sp = document.createElement('span'); sp.textContent = sub; b.appendChild(sp); }
  b.addEventListener('click', click);
  box.appendChild(b);
}
function drawLook(cv2, cls, gender, outfit, race, face, scale) {
  const g = cv2.getContext('2d'), name = look(cls, gender, outfit) + '_' + face + '_0', f = SPRC.f[name];
  g.clearRect(0, 0, cv2.width, cv2.height); g.imageSmoothingEnabled = false;
  if (!f) return;
  const flip = face === 'trai', fr = flip ? SPRC.f[look(cls, gender, outfit) + '_phai_0'] : f;
  g.save();
  if (flip) { g.translate(cv2.width, 0); g.scale(-1, 1); }
  const w = fW(SPRC, fr) * scale, h = fH(SPRC, fr) * scale;
  g.drawImage(IMG[sheetFor(race)], fr[0], fr[1], fr[2], fr[3], (cv2.width - w) / 2, cv2.height - h, w, h);
  g.restore();
}
function renderCreate() {
  const okCls = R.classesFor(CR.race);
  if (!okCls.includes(CR.cls)) CR.cls = okCls[0];
  const race = $('cr-race'); race.textContent = '';
  for (const k of RACE_ORDER) chip(race, RACES[k].ten, RACES[k].phe, k === CR.race, () => { CR.race = k; renderCreate(); });
  $('cr-race-info').textContent = `${RACES[CR.race].ten} · ${RACES[CR.race].phe}: ${RACES[CR.race].mo}.` + (RACES[CR.race].speed || RACES[CR.race].nightDmg || RACES[CR.race].durable || RACES[CR.race].mres ? ' (Đã có trong bản thử.)' : ' (Chưa dùng trong bản thử.)');
  const box = $('cr-cls'); box.textContent = '';
  for (const k of okCls) {
    const b = document.createElement('button'), c2 = document.createElement('canvas');
    b.type = 'button'; b.setAttribute('aria-pressed', k === CR.cls ? 'true' : 'false'); c2.width = 32; c2.height = 40;
    drawLook(c2, k, CR.gender, CR.outfit, CR.race, 'xuong', 2);
    const t = document.createElement('span'); t.textContent = CLASSES[k].ten;
    b.append(c2, t); b.addEventListener('click', () => { CR.cls = k; renderCreate(); });
    box.appendChild(b);
  }
  const c = CLASSES[CR.cls], s = R.hero(CR.cls, 1, R.starterEq(CR.cls));
  $('cr-cls-info').textContent = `${c.ten} · ${c.phe === 'Chung' ? 'cả 3 phe' : c.phe} · Máu ${s.hp} · ${c.tl === 'mana' ? 'MATK' : 'ATK'} ${s.atk} · Giáp ${s.def} · tầm ${String(c.tam).replace('.', ',')} m. Kỹ năng gốc: ${c.skills.map(k2 => k2.ten).join(', ') || 'kỹ năng nghề'}. Bắt đầu với ${ITEMS['vk_' + CR.cls + '_1'].ten} và bộ giáp ${R.GIAP_LOAI[c.giap]} Lv1.`;
  const gb = $('cr-gender'); gb.textContent = '';
  [['m', 'Nam'], ['f', 'Nữ']].forEach(([k, t]) => chip(gb, t, '', CR.gender === k, () => { CR.gender = k; renderCreate(); }));
  const ob = $('cr-outfit'); ob.textContent = '';
  (SPRC.outfits || ['Kiểu 1', 'Kiểu 2', 'Kiểu 3']).forEach((t, k) => chip(ob, t, '', CR.outfit === k, () => { CR.outfit = k; renderCreate(); }));
  const bg = $('cr-bg'); bg.textContent = '';
  for (const k of BG_ORDER) chip(bg, BACKGROUNDS[k].ten, BACKGROUNDS[k].huong, k === CR.bg, () => { CR.bg = k; renderCreate(); });
  $('cr-bg-info').textContent = `${BACKGROUNDS[CR.bg].ten}: ${BACKGROUNDS[CR.bg].mo}.` + (BACKGROUNDS[CR.bg].sleepy ? ' (Có tác dụng với đèn của Người Gác Đèn trong Hang Hải Đăng Cổ.)' : ' (Chưa dùng trong bản thử.)');
  drawLook($('cr-prev'), CR.cls, CR.gender, CR.outfit, CR.race, ['xuong', 'phai', 'len', 'trai'][CR.face % 4], 5);
}
function openCreate(msg) {
  $('create').hidden = false;
  $('cr-msg').hidden = !msg; $('cr-msg').textContent = msg || '';
  $('cr-login-box').hidden = !ONLINE;
  $('cr-sub').textContent = ONLINE ? `Máy chủ: ${SERVER}. Nhân vật được lưu trên máy chủ.` : 'Chơi một mình: nhân vật lưu trong trình duyệt này.';
  renderCreate();
  clearInterval(CR.timer);
  CR.timer = setInterval(() => { CR.face++; drawLook($('cr-prev'), CR.cls, CR.gender, CR.outfit, CR.race, ['xuong', 'phai', 'len', 'trai'][CR.face % 4], 5); }, 1100);
  setTimeout(() => $('cr-name').focus(), 50);
}
function closeCreate() { $('create').hidden = true; clearInterval(CR.timer); }
$('cr-ok').addEventListener('click', async () => {
  const name = $('cr-name').value.trim().replace(/\s+/g, ' ');
  const bad = t => { $('cr-msg').hidden = false; $('cr-msg').textContent = t; };
  if (!R.NAME_RE.test(name)) { bad('Tên dài 3–16 ký tự, chỉ gồm chữ, số và khoảng trắng.'); return; }
  if (!ONLINE) {
    const classChanged = P.cls !== CR.cls;
    Object.assign(P, { name, race: CR.race, gender: CR.gender, outfit: CR.outfit, bg: CR.bg });
    if (!CR.keep) Object.assign(P, { lv: 1, exp: 0, tien: 0, x: SPAWN.x, y: SPAWN.y, bag: [] });   // ban luu cu: giu cap, EXP, tien
    P.cls = CR.cls;
    if (!CR.keep || classChanged) { P.br = null; P.sl = null; }
    if (!CR.keep) P.ach = {};
    if (!CR.keep || classChanged || !P.eq) P.eq = R.starterEq(P.cls);
    if (!CR.keep) R.bagAdd(P, { k: 'hp1', n: 5 });
    CR.keep = false; if (started) log(`Chào ${name}!`, 'good');
    const s = S(); P.hp = s.hp; P.st = s.st; P.mp = s.mp; hudCls = null;
    save(); closeCreate(); start(); firstRun = true; openHelp();
    return;
  }
  $('cr-ok').disabled = true;
  try {
    const r = await fetch(SERVER + '/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, race: CR.race, cls: CR.cls, bg: CR.bg, gender: CR.gender, outfit: CR.outfit }) });
    const d = await r.json();
    if (!r.ok) { bad(d.error || 'Máy chủ từ chối tạo nhân vật.'); return; }
    saveAcc({ server: SERVER, id: d.id, key: d.key });
    closeCreate(); net.fresh = true;
    if (!started) joining();
    connect({ id: d.id, key: d.key });
  } catch (e) { bad('Không kết nối được máy chủ ' + SERVER + '. Kiểm tra mạng rồi thử lại.'); }
  finally { $('cr-ok').disabled = false; }
});
$('cr-code-ok').addEventListener('click', () => {
  const v = $('cr-code').value.trim(), k = v.indexOf('.');
  if (k < 10) { $('cr-msg').hidden = false; $('cr-msg').textContent = 'Mã đăng nhập có dạng: phần đầu, dấu chấm, phần sau. Hãy dán đủ cả mã.'; return; }
  const acc = { server: SERVER, id: v.slice(0, k), key: v.slice(k + 1) };
  saveAcc(acc); closeCreate();
  if (!started) joining();
  connect(acc);
});
$('acc-show').addEventListener('click', () => { const el = $('acc-code'); el.type = el.type === 'password' ? 'text' : 'password'; });
$('acc-copy').addEventListener('click', () => { const el = $('acc-code'); if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(() => log('Đã chép mã đăng nhập. Giữ kín, ai có mã này đều vào được nhân vật của bạn.', 'good'), () => {}); });
$('acc-new').addEventListener('click', () => {
  if (!confirm('Tạo nhân vật khác? Hãy chép mã đăng nhập trước nếu muốn quay lại nhân vật này.')) return;
  try { localStorage.removeItem(ACC_KEY); } catch (e) { /* bo qua */ }
  location.reload();
});
if (window.LAZ_DONATE_URL) for (const a of document.querySelectorAll('.donate-link')) { a.href = window.LAZ_DONATE_URL; a.hidden = false; }

// ---------------- vong lap ----------------
let last = 0, started = false;
function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  tick(dt, ts);
  requestAnimationFrame(frame);
}
function tick(dt, ts) {
  if ($('help').hidden) {
    clock += dt;
    updatePlayer(dt);
    updateShots(dt);
    updateSummons(dt);
    if (ONLINE) netTick(dt);
    else { OFF.G = GEO; for (const m of mobs) R.updateMob(m, dt, OFF); }
    for (let i = mobs.length - 1; i >= 0; i--) if (!mobs[i].origin && !mobs[i].alive && mobs[i].dying <= 0 && !ONLINE) mobs.splice(i, 1);
    for (const n of npcs) updateNpc(n, dt);
    for (const f of floats) f.t += dt;
    while (floats.length && floats[0].t > 1.1) floats.shift();
    P.say = Math.max(0, P.say - dt);
    if (ts - lastSave > 10000) { lastSave = ts; save(); }
    if (!$('shop').hidden && ($('shop').dataset.kind === 'shop' ? !nearNpc(R.SHOP_NPC) : !nearNpc(R.SMITH_NPC)) && !shopFar) { shopFar = true; renderShop(); }
    else if (!$('shop').hidden && shopFar && ($('shop').dataset.kind === 'shop' ? nearNpc(R.SHOP_NPC) : nearNpc(R.SMITH_NPC))) { shopFar = false; renderShop(); }
  } else if (ONLINE) netTick(dt);                                    // bang huong dan dang mo: van giu ket noi
  draw();
  drawMini();
  if ((hudT += dt) > .08) { hudT = 0; hud(); }
}
let shopFar = false;
function start() {
  if (started) return;
  started = true;
  LZ.done(); loadQuick();
  const J = $('joining'); if (J) J.remove();
  spawnMobs();
  if (!ONLINE) $('chatbox').hidden = true;
  requestAnimationFrame(frame);
}

// ---------------- tien: hien bang bieu tuong Dong / Bac / Vang / Kim Ngan ----------------
const UNIT_NAME = Object.fromEntries(R.MONEY_UNITS.map(u => [u[0], u[2]]));
const UNIT_VAL = Object.fromEntries(R.MONEY_UNITS.map(u => [u[0], u[1]]));
function setMoney(el, d, suffix) {
  const key = d + '|' + (suffix || '');
  if (el.dataset.m === key) return;                                    // hud goi lien tuc: chi ve lai khi doi
  el.dataset.m = key; el.textContent = '';
  const parts = R.moneyParts(d), first = parts.findIndex(x => x[1] > 0);
  for (const [k, v] of parts.slice(first < 0 ? 3 : first)) {
    const s = document.createElement('span'); s.className = 'mv'; s.textContent = v;
    const i = document.createElement('i'); i.className = 'coin c-' + k; i.title = UNIT_NAME[k];
    el.append(s, i);
  }
  if (suffix) el.append(suffix);
}

// ---------------- giao dich giua 2 nguoi choi (may chu kiem tra va doi do) ----------------
let TR = null, trTimer = 0, tinvTimer = 0;
function showTradeInvite(n, name, lv, cls) {
  $('tinv-text').textContent = `${name} (Lv${lv}, ${CLASSES[cls] ? CLASSES[cls].ten : ''}) muốn giao dịch với bạn.`;
  $('tinv').hidden = false;
  clearTimeout(tinvTimer); tinvTimer = setTimeout(() => { $('tinv').hidden = true; }, 30000);
}
$('tinv-ok').addEventListener('click', () => { send(['tra']); $('tinv').hidden = true; });
$('tinv-no').addEventListener('click', () => { send(['trd']); $('tinv').hidden = true; });
function onTrade(d) {
  const was = !!TR;
  TR = d;
  if (!d) { $('trade').hidden = true; $('tr-qty').hidden = true; return; }
  if (!was) { closeInv(); closeShop(); $('trade').hidden = false; }
  renderTrade();
}
function trItems(box, list) {
  box.textContent = '';
  if (!list.length) { const e = document.createElement('span'); e.className = 'empty'; e.textContent = 'Chưa đưa món nào'; box.appendChild(e); return; }
  for (const it of list) {
    const c = document.createElement('div'); c.className = 'cell'; c.title = itemName(it);
    c.appendChild(iconEl(it, 32));
    if (it.n > 1) { const n = document.createElement('em'); n.textContent = it.n; c.appendChild(n); }
    if (ITEMS[it.k].base) c.style.borderColor = RARITY[it.r || 0].col;
    box.appendChild(c);
  }
}
const trState = s => (s.ok ? '✓ Đã đồng ý' : s.lock ? '🔒 Đã khóa' : 'Chưa khóa');
function renderTrade() {
  const d = TR;
  if (!d) return;
  $('tr-title').textContent = `Giao dịch với ${d.name}`;
  $('tr-them-title').textContent = `${d.name} đưa`;
  trItems($('tr-my-items'), d.me.it); trItems($('tr-their-items'), d.them.it);
  setMoney($('tr-their-money'), d.them.tien);
  if (!$('trade').contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') {
    for (const [k, v] of R.moneyParts(d.me.tien)) { const inp = $('trade').querySelector(`input[data-u="${k}"]`); inp.value = v || ''; }
  }
  for (const [id, s] of [['tr-my-state', d.me], ['tr-their-state', d.them]]) { const el = $(id); el.textContent = trState(s); el.className = 'tr-state' + (s.ok ? ' ok' : s.lock ? ' lock' : ''); }
  const grid = $('tr-bag'); grid.textContent = '';
  P.bag.forEach((it, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'cell' + (d.me.idx.includes(i) ? ' sel' : '');
    b.appendChild(iconEl(it));
    if (it.n > 1) { const n = document.createElement('em'); n.textContent = it.n; b.appendChild(n); }
    if (ITEMS[it.k].base) b.style.borderColor = RARITY[it.r || 0].col;
    b.title = itemName(it);
    b.addEventListener('click', () => {
      const cur = trCur(), j = cur.findIndex(x => (Array.isArray(x) ? x[0] : x) === i);
      if (j >= 0) { cur.splice(j, 1); trSend(cur); return; }       // dang dua: bam lai de lay ra
      if (ITEMS[it.k].stack && it.n > 1) { trAsk(i); return; }      // do chong: hoi so luong
      cur.push(i); trSend(cur);
    });
    grid.appendChild(b);
  });
  $('tr-lock').textContent = d.me.lock ? 'Mở khóa' : 'Khóa';
  $('tr-ok').disabled = !(d.me.lock && d.them.lock) || !!d.me.ok;
}
function trMoney() {
  let v = 0;
  for (const inp of $('trade').querySelectorAll('.tr-money input')) v += Math.max(0, Math.floor(+inp.value || 0)) * UNIT_VAL[inp.dataset.u];
  return Math.min(v, P.tien);
}
// mon dang dua: chi so o tui, do chong thi [chi so, so luong]
const trCur = () => TR.me.idx.map((i, j) => (TR.me.it[j] && ITEMS[TR.me.it[j].k].stack ? [i, TR.me.it[j].n] : i)).filter(x => (Array.isArray(x) ? x[0] : x) >= 0);
function trSend(idx) { if (TR) send(['to', idx || trCur(), trMoney()]); }
let trQ = -1;
function trAsk(i) {
  const it = P.bag[i]; trQ = i;
  $('tr-qty-name').textContent = `Đưa bao nhiêu ${itemName(it)}?`;
  $('tr-qty-n').max = it.n; $('tr-qty-n').value = it.n; $('tr-qty-max').textContent = `(có ${it.n})`;
  $('tr-qty').hidden = false; $('tr-qty-n').focus(); $('tr-qty-n').select();
}
function trQOk() {
  const it = P.bag[trQ]; $('tr-qty').hidden = true;
  if (!TR || !it) return;
  const n = Math.max(1, Math.min(it.n, Math.floor(+$('tr-qty-n').value || 0)));
  const cur = trCur(); cur.push([trQ, n]); trSend(cur); trQ = -1;
}
$('tr-qty-ok').addEventListener('click', trQOk);
$('tr-qty-x').addEventListener('click', () => { $('tr-qty').hidden = true; trQ = -1; });
$('tr-qty-n').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); trQOk(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); $('tr-qty').hidden = true; } });
for (const inp of $('trade').querySelectorAll('.tr-money input')) inp.addEventListener('input', () => { clearTimeout(trTimer); trTimer = setTimeout(() => trSend(), 450); });
$('tr-lock').addEventListener('click', () => { if (TR) { clearTimeout(trTimer); if (!TR.me.lock && trMoney() !== TR.me.tien) trSend(); send(['tl', TR.me.lock ? 0 : 1]); } });
$('tr-ok').addEventListener('click', () => send(['tk']));
$('tr-cancel').addEventListener('click', () => send(['tc']));
$('pc-trade').addEventListener('click', () => { const n = +$('pcard').dataset.n; if (n) send(['tr', n]); $('pcard').hidden = true; });

// ---------------- bang ky nang: ky nang goc, 2 nhanh Lv20 (+ nhanh an ?), noi tai, gan ky nang vao o 1-3 ----------------
const costTxt = sk => (sk.C != null ? (sk.C ? `${skCost(sk)} Mana` : 'không tốn') : sk.cost + ' Thể Lực');
const KIND_TEN = { strike: 'Cận chiến', dash: 'Lao tới', block: 'Phòng thủ', buff: 'Bùa lợi', shot: 'Tầm xa', pierce: 'Xuyên thẳng', nova: 'Diện rộng quanh mình',
  grenade: 'Diện rộng tầm xa', curse: 'Sát thương theo thời gian', summon: 'Triệu hồi', stealth: 'Tàng hình', taunt: 'Khiêu khích', heal: 'Hồi máu',
  shield: 'Khiên', channel: 'Vận công', fear: 'Khống chế', root: 'Khống chế', blind: 'Khống chế', dice: 'May rủi' };
let skSel = null;                                                     // ma ky nang / noi tai dang xem
function toggleSkills() { if ($('skills').hidden) openSkills(); else closeSkills(); }
function openSkills() { closeInv(); closeShop(); closeAch(); closeSocial(); $('skills').hidden = false; P.path = null; renderSkills(); }
function closeSkills() { $('skills').hidden = true; }
$('sk-close').addEventListener('click', closeSkills);
// doi nhanh / o ky nang. Choi mang: may chu kiem tra roi bao lai ('sk'); choi mot minh: lam ngay
function setSkills(br, sl) {
  if (ONLINE) { send(['sk', br, sl]); return; }
  if (P.combat > 0) { log('Đang giao tranh: đợi thoát giao tranh rồi đổi kỹ năng.', 'bad'); return; }
  const brChanged = br !== P.br;
  P.br = br; P.sl = brChanged ? null : R.cleanSlots(P, sl);
  SKS().forEach((sk, i) => { P.cds[i] = sk ? sk.cd : 0; });
  achShow(R.achCheck(P)); save(); renderSkills();
}
function assignSkill(id, i) {
  const cur = SKS().map(sk => (sk ? sk.id : null)), j = cur.indexOf(id);
  if (j >= 0) cur[j] = cur[i];                                        // da o o khac: doi cho
  cur[i] = id;
  setSkills(P.br, cur);
}
function skBtn(key, cls, title, onClick) {
  const b = document.createElement('button'), c2 = document.createElement('canvas');
  b.type = 'button'; b.className = 'sk-ic ' + cls; b.title = title; c2.width = c2.height = 64;
  drawSk(c2, key); b.appendChild(c2);
  b.addEventListener('click', onClick);
  return b;
}
function renderSkills() {
  if ($('skills').hidden) return;
  const c = C(), sks = SKS(), pool = R.skillPool(P), brs = R.BRANCHES[P.cls] || [], cur = R.branchOf(P);
  $('sk-note').textContent = !c.skills.length ? 'Nông Dân dùng kỹ năng nghề (cày, gieo, câu cá, hái lượm), chưa có nhánh chiến đấu trong bản chơi thử.'
    : P.lv < R.BRANCH_LV ? `Lv${P.lv}: dùng kỹ năng gốc. Đủ Lv${R.BRANCH_LV} thì chọn 1 trong 2 nhánh, được nội tại và 3 kỹ năng nhánh.`
      : cur ? `Đang theo nhánh ${cur.ten}. Bấm một kỹ năng để xem, rồi gắn vào ô 1–3 (hoặc kéo thả vào ô). Đổi kỹ năng thì cả 3 ô hồi chiêu lại từ đầu.`
        : 'Bạn đã đủ Lv20: chọn một nhánh bên dưới. Bản thử cho đổi nhánh miễn phí khi không giao tranh.';
  // 3 o dang gan
  const slots = $('sk-slots'); slots.textContent = '';
  if (c.skills.length) sks.forEach((sk, i) => {
    const d = document.createElement('div'); d.className = 'sk-slot';
    const kb = document.createElement('kbd'); kb.textContent = keyName(BIND['s' + (i + 1)]);
    const b = skBtn(sk ? sk.ico : '', sk && skSel === sk.id ? 'on sel' : 'on', sk ? sk.ten : 'Ô trống', () => { skSel = sk ? sk.id : null; renderSkills(); });
    const t = document.createElement('span'); t.textContent = sk ? sk.ten : 'Ô trống';
    d.append(kb, b, t);
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('drop'); });
    d.addEventListener('dragleave', () => d.classList.remove('drop'));
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (R.SKILL[id]) assignSkill(id, i); });
    slots.appendChild(d);
  });
  const usable = sk => pool.includes(sk);
  const icon = sk => {
    const b = skBtn(sk.ico, (usable(sk) ? '' : 'lock') + (skSel === sk.id ? ' sel' : '') + (sks.includes(sk) ? ' on' : ''), sk.ten, () => { skSel = sk.id; renderSkills(); });
    if (usable(sk)) { b.draggable = true; b.addEventListener('dragstart', e => { skSel = sk.id; e.dataTransfer.setData('text/plain', sk.id); }); }
    return b;
  };
  const base = $('sk-base'); base.textContent = '';
  for (const sk of c.skills) base.appendChild(icon(sk));
  // cac nhanh + nhanh an
  const box = $('sk-branches'); box.textContent = '';
  for (const b of brs) {
    const card = document.createElement('div'); card.className = 'sk-br' + (cur === b ? ' cur' : '');
    const h = document.createElement('h4'); h.textContent = b.ten; h.style.color = b.col;
    const row = document.createElement('div'); row.className = 'sk-list';
    row.appendChild(skBtn(b.pas.id, 'pas' + (cur === b ? ' on' : ' lock') + (skSel === b.pas.id ? ' sel' : ''), 'Nội tại: ' + b.pas.ten, () => { skSel = b.pas.id; renderSkills(); }));
    for (const sk of b.skills) row.appendChild(icon(sk));
    const bt = document.createElement('button'); bt.type = 'button';
    bt.textContent = cur === b ? 'Đang theo nhánh này' : P.lv < R.BRANCH_LV ? `Mở ở Lv${R.BRANCH_LV}` : 'Chọn nhánh này';
    bt.disabled = cur === b || P.lv < R.BRANCH_LV;
    bt.addEventListener('click', () => setSkills(b.k, null));
    card.append(h, row, bt);
    box.appendChild(card);
  }
  if (brs.length) {
    const hid = document.createElement('div'); hid.className = 'sk-br hidden-br';
    const q = document.createElement('b'); q.textContent = '?';
    const t = document.createElement('span'); t.textContent = 'Nhánh ẩn: mở bằng Sách Ẩn rơi ở Dungeon. Chưa có trong bản chơi thử.';
    hid.append(q, t); box.appendChild(hid);
  }
  // chi tiet
  const det = $('sk-detail'); det.textContent = '';
  const pasB = brs.find(b => b.pas.id === skSel), sk = R.SKILL[skSel];
  if (pasB) {
    const t = document.createElement('b'); t.textContent = `Nội tại · ${pasB.pas.ten}`;
    det.append(t, ` (${pasB.ten}, luôn bật khi theo nhánh từ Lv${R.BRANCH_LV})`, document.createElement('br'), pasB.pas.mo);
  } else if (sk) {
    const t = document.createElement('b'); t.textContent = sk.ten;
    det.append(t, ` · ${KIND_TEN[sk.kind] || ''} · Lv${sk.lv} · hồi ${num(sk.cd)} giây · ${costTxt(sk)}`, document.createElement('br'), sk.mo);
    if (usable(sk)) {
      const bt = document.createElement('div'); bt.className = 'btns';
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = `Gắn vào ô ${i + 1} (${keyName(BIND['s' + (i + 1)])})`;
        b.disabled = sks[i] === sk; b.addEventListener('click', () => assignSkill(sk.id, i));
        bt.appendChild(b);
      }
      det.appendChild(bt);
    } else { const w = document.createElement('p'); w.className = 'note'; w.textContent = P.lv < sk.lv ? `Mở ở Lv${sk.lv}.` : 'Chọn nhánh này để dùng kỹ năng.'; det.appendChild(w); }
  } else det.textContent = 'Bấm vào một kỹ năng hoặc nội tại để xem chi tiết.';
}

// ---------------- thanh tuu ----------------
function toggleAch() { if ($('ach').hidden) openAch(); else closeAch(); }
function openAch() { closeInv(); closeShop(); closeSkills(); closeSocial(); $('ach').hidden = false; renderAch(); if (ONLINE) send(['achq']); }
function closeAch() { $('ach').hidden = true; }
$('ach-close').addEventListener('click', closeAch);
const mmss = v => Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
function renderAch() {
  if ($('ach').hidden) return;
  const a = R.achOf(P), ul = $('ach-list'); ul.textContent = '';
  let n = 0;
  for (const A of R.ACH) {
    const done = !!a.done[A.k], v = A.val(a, P); if (done) n++;
    const li = document.createElement('li'); li.className = done ? 'done' : '';
    const cup = document.createElement('span'); cup.className = 'cup'; cup.textContent = '🏆';
    const nm = document.createElement('div'); nm.className = 'nm';
    const b = document.createElement('b'); b.textContent = A.ten; const sp = document.createElement('span'); sp.textContent = A.mo;
    nm.append(b, sp);
    const pg = document.createElement('span'); pg.className = 'pg';
    pg.textContent = done ? 'Đã đạt · ' + new Date(a.done[A.k]).toLocaleDateString('vi-VN')
      : A.fast ? `Nhanh nhất ${v ? mmss(v) : '—'} / cần ${mmss(A.need)}` : `${Math.min(v, A.need).toLocaleString('vi-VN')} / ${A.need.toLocaleString('vi-VN')}`;
    li.append(cup, nm, pg); ul.appendChild(li);
  }
  $('ach-count').textContent = `${n} / ${R.ACH.length}`;
}
// bao thanh tuu vua dat: dong chu vang giua man hinh + nhat ky
function achShow(list) {
  for (const A of list || []) {
    log(`🏆 Thành tựu mới: «${A.ten}» (${A.mo}).`, 'gold');
    const d = document.createElement('div'); d.className = 'ach-toast'; d.textContent = '🏆 ' + A.ten;
    document.body.appendChild(d); setTimeout(() => d.remove(), 3500);
  }
  if (list && list.length) { save(); renderAch(); }
}

// ---------------- bang sat thuong Dungeon (may chu gui moi giay) va bang vinh danh top 1-5 khi ha Boss ----------------
function renderMeter(list) {
  const box = $('dmeter');
  box.hidden = !list || !list.length;
  if (box.hidden) return;
  const ol = $('dm-list'); ol.textContent = '';
  const tot = list.reduce((a, r) => a + r[1], 0) || 1, top = list[0][1] || 1;
  for (const [name, v] of list) {
    const li = document.createElement('li'); if (name === P.name) li.className = 'me';
    const b = document.createElement('b'); b.textContent = name;
    const s = document.createElement('span'); s.textContent = `${v.toLocaleString('vi-VN')} · ${Math.round(v / tot * 100)}%`;
    const bar = document.createElement('i'); bar.style.width = Math.round(v / top * 100) + '%';
    li.append(b, s, bar); ol.appendChild(li);
  }
}
function showDmf(ten, secs, top) {
  $('dmf-title').textContent = `${ten} · ${mmss(secs)}`;
  const ol = $('dmf-list'); ol.textContent = '';
  const tot = top.reduce((a, r) => a + r[1], 0) || 1;
  top.forEach(([name, v], i) => {
    const li = document.createElement('li'); li.className = (i === 0 ? 'top1' : '') + (name === P.name ? ' me' : '');
    const md = document.createElement('span'); md.className = 'md'; md.textContent = ['🥇', '🥈', '🥉', '4', '5'][i];
    const b = document.createElement('b'); b.textContent = name;
    const s = document.createElement('span'); s.className = 'v'; s.textContent = `${v.toLocaleString('vi-VN')} (${Math.round(v / tot * 100)}%)`;
    li.append(md, b, s); ol.appendChild(li);
  });
  if (!top.length) { const li = document.createElement('li'); li.textContent = 'Chưa có số liệu sát thương.'; ol.appendChild(li); }
  $('dmf').hidden = false;
}
$('dmf-close').addEventListener('click', () => { $('dmf').hidden = true; });

// ---------------- ban be: ket ban, xem trang bi cua ban (ca khi ban offline) ----------------
let FR = [], frq = null, finvT = 0;
function closeSocial() { $('fr').hidden = true; $('farm').hidden = true; }
function toggleFr() { if ($('fr').hidden) openFr(); else closeSocial(); }
function openFr() { closeInv(); closeShop(); closeSkills(); closeAch(); closeSocial(); $('fr').hidden = false; $('fr-view').hidden = true; renderFr(); if (ONLINE) send(['fl']); }
$('fr-close').addEventListener('click', closeSocial);
$('fr-add').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('fr-name').value.trim();
  if (!v) return;
  if (!ONLINE) { log('Bạn bè cần chơi qua máy chủ.', ''); return; }
  send(['fa', v]); $('fr-name').value = '';
});
function renderFr() {
  if ($('fr').hidden) return;
  $('fr-off').hidden = ONLINE;
  const ul = $('fr-list'); ul.textContent = '';
  for (const [name, on, lv, cls] of FR) {
    const li = document.createElement('li'); li.className = on ? 'on' : '';
    const dot = document.createElement('i'); dot.className = 'dot'; dot.title = on ? 'Đang online' : 'Offline';
    const nm = document.createElement('div'); nm.className = 'nm';
    const b = document.createElement('b'); b.textContent = name;
    const sp = document.createElement('span'); sp.textContent = (lv ? `Lv${lv} · ${CLASSES[cls] ? CLASSES[cls].ten : ''}` : '') + (on ? ' · online' : ' · offline');
    nm.append(b, sp);
    const bv = document.createElement('button'); bv.type = 'button'; bv.textContent = 'Trang bị'; bv.addEventListener('click', () => send(['fv', name]));
    const bp = document.createElement('button'); bp.type = 'button'; bp.className = 'ghost'; bp.textContent = 'Mời đội'; bp.disabled = !on; bp.addEventListener('click', () => send(['pi', name]));
    const bx = document.createElement('button'); bx.type = 'button'; bx.className = 'ghost'; bx.textContent = 'Xóa';
    bx.addEventListener('click', () => { if (bx.dataset.sure) send(['fr', name]); else { bx.dataset.sure = 1; bx.textContent = 'Chắc chắn?'; } });
    li.append(dot, nm, bv, bp, bx); ul.appendChild(li);
  }
  if (!FR.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Chưa có bạn bè. Gõ tên người chơi đang online ở trên, hoặc bấm vào nhân vật của họ rồi chọn Kết bạn.'; ul.appendChild(li); }
}
function showFrInvite(name, lv, cls) {
  frq = name;
  $('finv-text').textContent = `${name} (Lv${lv}, ${CLASSES[cls] ? CLASSES[cls].ten : ''}) muốn kết bạn với bạn.`;
  $('finv').hidden = false;
  clearTimeout(finvT); finvT = setTimeout(() => { $('finv').hidden = true; }, 60000);
}
$('finv-ok').addEventListener('click', () => { send(['fy', frq]); $('finv').hidden = true; });
$('finv-no').addEventListener('click', () => { send(['fn', frq]); $('finv').hidden = true; });
// trang bi cua ban: hinh nhan vat, chi so tong, tung mon
function showFrView(o) {
  if ($('fr').hidden) openFr();
  const box = $('fr-view'); box.hidden = false; box.textContent = '';
  const head = document.createElement('div'); head.className = 'fv-head';
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 78; cv.className = 'fv-look';
  head.appendChild(cv);
  const b = R.branchOf({ cls: o.cls, lv: o.lv, br: o.br });
  const t = document.createElement('div');
  const h = document.createElement('h3'); h.textContent = `${o.name} · Lv${o.lv}`;
  const sub = document.createElement('p'); sub.className = 'note'; sub.textContent = `${CLASSES[o.cls] ? CLASSES[o.cls].ten : ''}${b ? ' · ' + b.ten : ''} · ${o.on ? 'đang online' : 'offline'}`;
  const st = R.hero(o.cls, o.lv, o.eq, o.br), ul0 = document.createElement('p'); ul0.className = 'fv-st';
  ul0.textContent = `Máu ${st.hp} · Công ${st.atk} · Giáp ${st.def} · Kháng phép ${st.mres} · Chí mạng ${Math.round(st.crit * 100)}% · Sát thương chí mạng ${Math.round(st.cd * 100)}% · Tốc đánh ${num(st.aspd)}` + (st.may ? ` · May mắn ${Math.round(st.may * 100)}%` : '');
  t.append(h, sub, ul0); head.appendChild(t); box.appendChild(head);
  const ul = document.createElement('ul'); ul.className = 'fv-eq';
  for (const sl of SLOTS) {
    const it = o.eq[sl], li = document.createElement('li');
    if (it && ITEMS[it.k]) {
      li.appendChild(iconEl(it, 28));
      const d = document.createElement('div'); d.className = 'nm';
      const nb = document.createElement('b'); nb.textContent = itemName(it); nb.style.color = RARITY[it.r || 0].col;
      const s = R.itemStats(it) || {}, sp = document.createElement('span');
      sp.textContent = `${SLOT_TEN[sl]} · ` + Object.entries(s).map(([k, v]) => `${STAT_TEN[k]} ${statTxt(k, v)}`).join(', ') + (it.s ? ' · ' + it.s.map(([k, v]) => `${STAT_TEN[k]} +${v}%`).join(', ') : '');
      d.append(nb, sp); li.appendChild(d);
    } else { const d = document.createElement('div'); d.className = 'nm'; d.textContent = `${SLOT_TEN[sl]}: trống`; li.className = 'none'; li.appendChild(d); }
    ul.appendChild(li);
  }
  box.appendChild(ul);
  drawLook(cv, o.cls, o.gender, o.outfit, o.race, 'xuong', 3);
}

// ---------------- nong trai cua Nong Dan: 6 o ruong, trong, thu hoach, nau an ----------------
const farmNow = () => Date.now() + (ONLINE ? P.farmOff || 0 : 0);
function toggleFarm() { if ($('farm').hidden) openFarm(); else closeSocial(); }
function openFarm() {
  if (P.cls !== 'nd') { log('Chỉ Nông Dân trồng trọt và nấu ăn được.', ''); return; }
  closeInv(); closeShop(); closeSkills(); closeAch(); closeSocial(); $('farm').hidden = false; renderFarm();
}
$('farm-close').addEventListener('click', closeSocial);
let farmSig = '', farmAt = false;
// ruong canh Xuong Nghe: dat nau 3 x 2 o; Nong Dan thay cay cua minh (mam xanh khi dang lon, nong san khi chin)
function drawField() {
  const F = R.FARM_FIELD, X = v => (v - cam.x) * Z, Y = v => (v - cam.y) * Z;
  if (F.x + F.w < cam.x || F.x > cam.x + VW || F.y + F.h < cam.y || F.y > cam.y + VH) return;
  ctx.fillStyle = '#6B4A2B'; ctx.fillRect(X(F.x - 3), Y(F.y - 3), (F.w + 4) * Z, (F.h + 4) * Z);
  const f = P.cls === 'nd' ? R.farmOf(P) : [], now = farmNow();
  for (let i = 0; i < R.FARM_N; i++) {
    const q = R.fieldPlot(i);
    ctx.fillStyle = '#4A2F1A'; ctx.fillRect(X(q.x), Y(q.y), q.w * Z, q.h * Z);
    ctx.fillStyle = '#5A3A22'; for (let r = 2; r < q.h; r += 4) ctx.fillRect(X(q.x + 1), Y(q.y + r), (q.w - 2) * Z, Z);
    const p = f[i]; if (!p) continue;
    const left = R.farmLeft(p, now), k = ITEMS[p.k].crop;
    if (left > 0) {                                                       // mam: lon dan theo thoi gian
      const g = 1 + Math.round(3 * (1 - left / (ITEMS[p.k].grow * 1000)));
      ctx.fillStyle = '#6FCF5A';
      for (const dx of [3, 7, 11]) ctx.fillRect(X(q.x + dx), Y(q.y + q.h - 3 - g), Z, (g + 1) * Z), ctx.fillRect(X(q.x + dx - 1), Y(q.y + q.h - 3 - g), 3 * Z, Z);
    } else if (RIENG.f[k] && IMG.rieng) { const s = RIENG.f[k]; ctx.drawImage(IMG.rieng, s[0], s[1], s[2], s[3], X(q.x + 2), Y(q.y + 1), 10 * Z, 10 * Z); }
  }
  if (P.cls === 'nd' && R.nearField(P) && !panelOpen()) { ctx.fillStyle = '#FFE9A8'; ctx.font = `${Math.max(10, 3.2 * Z)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('Ruộng · E', X(F.x + F.w / 2), Y(F.y - 6)); ctx.textAlign = 'left'; }
}
function renderFarm() {
  if ($('farm').hidden) return;
  const f = R.farmOf(P), now = farmNow(), ul = $('farm-plots'); ul.textContent = '';
  const atField = MAP.key === 'dbm' && R.nearField(P);
  $('farm-where').hidden = atField;
  const seeds = atField ? Object.keys(ITEMS).filter(k => ITEMS[k].grow && R.bagCount(P, k) > 0) : [];
  farmSig = f.map(p => (p ? (R.farmLeft(p, now) > 0 ? 'g' : 'r') : 'e')).join('') + seeds.join();
  f.forEach((p, i) => {
    const li = document.createElement('li');
    if (!p) {
      li.className = 'empty';
      const h = document.createElement('b'); h.textContent = `Ô ${i + 1}: trống`; li.appendChild(h);
      const row = document.createElement('div'); row.className = 'seeds';
      for (const k of seeds) {
        const bt = document.createElement('button'); bt.type = 'button'; bt.title = `${ITEMS[k].ten}: ${ITEMS[k].mo}`;
        bt.append(iconEl({ k }, 22), document.createTextNode(`×${R.bagCount(P, k)}`)); bt.addEventListener('click', () => invOp(['fp', i, k]));
        row.appendChild(bt);
      }
      if (!seeds.length) { const n = document.createElement('span'); n.className = 'note'; n.textContent = atField ? 'Mua hạt giống ở Bà Mira.' : 'Ra ruộng để trồng.'; row.appendChild(n); }
      li.appendChild(row);
    } else {
      const I = ITEMS[p.k], C2 = ITEMS[I.crop], left = R.farmLeft(p, now);
      li.className = left > 0 ? 'grow' : 'ripe';
      li.appendChild(iconEl({ k: left > 0 ? p.k : I.crop }, 30));
      const d = document.createElement('div'); d.className = 'nm';
      const h = document.createElement('b'); h.textContent = C2.ten;
      const s = document.createElement('span'); s.className = 'left'; s.dataset.i = i;
      const bar = document.createElement('div'); bar.className = 'bar'; const fi = document.createElement('i'); fi.dataset.i = i; bar.appendChild(fi);
      d.append(h, s, bar); li.appendChild(d);
      if (left <= 0) { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Thu hoạch'; bt.disabled = !atField; bt.addEventListener('click', () => invOp(['fh', i])); li.appendChild(bt); }
    }
    ul.appendChild(li);
  });
  farmTimes();
  const ck = $('farm-cook'); ck.textContent = '';
  for (const [k, need] of Object.entries(R.RECIPES)) {
    const ok = Object.entries(need).every(([m, n]) => R.bagCount(P, m) >= n);
    const li = document.createElement('li'); li.appendChild(iconEl({ k }, 28));
    const d = document.createElement('div'); d.className = 'nm';
    const h = document.createElement('b'); h.textContent = ITEMS[k].ten;
    const s = document.createElement('span'); s.textContent = `${ITEMS[k].mo} · cần ` + Object.entries(need).map(([m, n]) => `${n} ${ITEMS[m].ten} (có ${R.bagCount(P, m)})`).join(', ');
    d.append(h, s); li.appendChild(d);
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Nấu'; bt.disabled = !ok; bt.addEventListener('click', () => invOp(['ck', k]));
    li.appendChild(bt); ck.appendChild(li);
  }
}
function farmTimes() {
  const f = R.farmOf(P), now = farmNow();
  document.querySelectorAll('#farm-plots .left').forEach(s => {
    const p = f[s.dataset.i], left = R.farmLeft(p, now);
    s.textContent = left > 0 ? `Chín sau ${mmss(Math.ceil(left / 1000))}` : 'Đã chín!';
  });
  document.querySelectorAll('#farm-plots .bar i').forEach(b => { const p = f[b.dataset.i]; if (p) b.style.width = Math.round(100 - R.farmLeft(p, now) / (ITEMS[p.k].grow * 10)) + '%'; });
}
setInterval(() => {
  if ($('farm').hidden) return;
  const now = farmNow(), sig = R.farmOf(P).map(p => (p ? (R.farmLeft(p, now) > 0 ? 'g' : 'r') : 'e')).join('');
  if (!farmSig.startsWith(sig) || farmAt !== (MAP.key === 'dbm' && R.nearField(P))) { farmAt = MAP.key === 'dbm' && R.nearField(P); renderFarm(); } else farmTimes();
}, 1000);

// man cho khi vua tao nhan vat / dang nhap bang ma (man tai logo da an)
function joining() { if ($('joining')) return; const L = document.createElement('div'); L.id = 'joining'; L.textContent = 'Đang vào Đảo Bình Minh…'; document.body.appendChild(L); }
// ---------------- phim dieu khien (doi duoc trong menu Esc, luu o localStorage 'lz_keys') ----------------
const QN = 10;
const ACTS = [
  ['Di chuyển', [['up', 'Đi lên', 'w'], ['down', 'Đi xuống', 's'], ['left', 'Sang trái', 'a'], ['right', 'Sang phải', 'd']]],
  ['Chiến đấu', [['atk', 'Đánh thường', 'tab'], ['s1', 'Kỹ năng 1', '1'], ['s2', 'Kỹ năng 2', '2'], ['s3', 'Kỹ năng 3', '3'], ['dodge', 'Né', ' '], ['pot', 'Uống bình máu nhanh', 'q']]],
  ['Giao diện', [['use', 'Tương tác', 'e'], ['inv', 'Mở túi đồ', 'i'], ['skills', 'Bảng kỹ năng', 'k'], ['ach', 'Thành tựu', 'j'], ['fr', 'Bạn bè', 'f'], ['farm', 'Nông trại (Nông Dân)', 'n'], ['map', 'Bật bản đồ nhỏ', 'm'], ['help', 'Hướng dẫn', 'h']]],
  ['Thanh nhanh', ['4', '5', '6', '7', '8', '9', '0', 'z', 'x', 'c'].map((k, i) => ['q' + (i + 1), 'Ô nhanh ' + (i + 1), k])],
];
const KEY_DEF = Object.fromEntries(ACTS.flatMap(g => g[1].map(a => [a[0], a[2]])));
const BIND = Object.assign({}, KEY_DEF);
try { const b = JSON.parse(localStorage.getItem('lz_keys') || 'null'); if (b) for (const k in b) if (k in BIND && typeof b[k] === 'string') BIND[k] = b[k]; } catch (e) { /* bo qua */ }
let ACT_OF = {};
const reBind = () => { ACT_OF = {}; for (const [a, k] of Object.entries(BIND)) if (k) ACT_OF[k] = a; };
reBind();
const ARROW = { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };
function held(dir) { return keys.has(BIND[dir]) || keys.has(ARROW[dir]); }
const KEY_NAMES = { ' ': 'Space', tab: 'Tab', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', shift: 'Shift', control: 'Ctrl', alt: 'Alt', backspace: '⌫', capslock: 'Caps' };
function keyName(k) { return !k ? '–' : KEY_NAMES[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)); }
let rebind = null;
function setBind(k) {
  const a = rebind; rebind = null;
  if (k !== 'escape' && k !== 'enter' && k !== 'meta') {
    const other = ACT_OF[k];
    if (other && other !== a) BIND[other] = BIND[a];               // phim da dung cho viec khac: doi cho cho nhau
    BIND[a] = k;
    try { localStorage.setItem('lz_keys', JSON.stringify(BIND)); } catch (e) { /* bo qua */ }
    reBind(); keyLabels();
  }
  renderKeys();
}
function keyLabels() {
  $('b-atk').querySelector('kbd').textContent = keyName(BIND.atk);
  $('b-dodge').querySelector('kbd').textContent = keyName(BIND.dodge);
  $('b-skills').querySelector('kbd').textContent = keyName(BIND.skills);
  $('b-ach').querySelector('kbd').textContent = keyName(BIND.ach);
  $('b-fr').querySelector('kbd').textContent = keyName(BIND.fr);
  $('b-farm').querySelector('kbd').textContent = keyName(BIND.farm);
  $('b-inv').querySelector('kbd').textContent = keyName(BIND.inv);
  $('quickbar').querySelectorAll('.q').forEach((b, i) => { b.querySelector('kbd').textContent = keyName(BIND['q' + (i + 1)]); });
}
// hinh ky nang tren nut (img/ky_nang.png, bieu_tuong_ky_nang.py)
function skIcon(id, key) {
  drawSk($(id).querySelector('canvas'), key);
}
function drawSk(c2, key) {
  const g = c2.getContext('2d'), [im, f] = SKI.f[key] ? [IMG.ski, SKI.f[key]] : [IMG.tmp, TMP.f[key]];
  g.clearRect(0, 0, c2.width, c2.height); g.imageSmoothingEnabled = false;
  if (f && im) g.drawImage(im, f[0], f[1], f[2], f[3], 0, 0, c2.width, c2.height);
}

// ---------------- thanh nhanh: 10 o, keo binh thuoc tu tui ra (luu theo nhan vat) ----------------
let QUICK = Array(QN).fill(null), quickSig = '';
const quickOk = k => !!(ITEMS[k] && ITEMS[k].heal);
const qKey = () => 'lz_quick_' + (ONLINE ? SERVER + ':' : '') + (P.name || 'solo');
function saveQuick() { try { localStorage.setItem(qKey(), JSON.stringify(QUICK)); } catch (e) { /* bo qua */ } }
function loadQuick() {
  let q = null;
  try { q = JSON.parse(localStorage.getItem(qKey()) || 'null'); } catch (e) { /* bo qua */ }
  QUICK = Array.from({ length: QN }, (_, i) => (q && quickOk(q[i]) ? q[i] : null));
  if (!q) { QUICK[0] = 'hp1'; QUICK[1] = 'hp2'; if (S().mp) { QUICK[2] = 'mp1'; QUICK[3] = 'mp2'; } }
  buildQuick();
}
function setQuick(i, k) { QUICK[i] = k; saveQuick(); buildQuick(); renderInv(); }
function putQuick(k) {
  const i = QUICK.indexOf(null);
  if (i < 0) { log('Ô nhanh đã đầy.', 'bad'); return; }
  setQuick(i, k);
}
function buildQuick() {
  const bar = $('quickbar'); bar.textContent = ''; quickSig = '';
  for (let i = 0; i < QN; i++) {
    const k = QUICK[i], b = document.createElement('button');
    b.type = 'button'; b.className = 'q' + (k ? '' : ' empty');
    if (k) {
      const c2 = document.createElement('canvas'), n = 16 * (ICO.s || 1), f = ICO.f[iconKey(k)];
      c2.width = c2.height = n;
      if (f && IMG.ico) { const g = c2.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(IMG.ico, f[0], f[1], f[2], f[3], 0, 0, n, n); }
      b.appendChild(c2);
      b.title = ITEMS[k].ten + ' · ' + ITEMS[k].mo + '. Bấm chuột phải để bỏ khỏi ô';
      b.draggable = true;
      b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'lzs:' + i); e.dataTransfer.effectAllowed = 'move'; });
      b.addEventListener('dragend', e => { if (e.dataTransfer.dropEffect === 'none') setQuick(i, null); });   // keo ra ngoai = bo
    } else b.title = 'Kéo bình thuốc từ túi đồ thả vào đây';
    const kb = document.createElement('kbd'); kb.textContent = keyName(BIND['q' + (i + 1)]); b.appendChild(kb);
    const em = document.createElement('em'); b.appendChild(em);
    b.addEventListener('click', () => useQuick(i));
    b.addEventListener('contextmenu', e => { e.preventDefault(); if (QUICK[i]) setQuick(i, null); });
    b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('over'); });
    b.addEventListener('dragleave', () => b.classList.remove('over'));
    b.addEventListener('drop', e => {
      e.preventDefault(); b.classList.remove('over');
      const d = e.dataTransfer.getData('text/plain') || '';
      if (d.startsWith('lzq:') && quickOk(d.slice(4))) { const k2 = d.slice(4), old = QUICK.indexOf(k2); if (old >= 0) QUICK[old] = null; setQuick(i, k2); }
      else if (d.startsWith('lzs:')) { const j = +d.slice(4); if (j !== i) { const t = QUICK[i]; QUICK[i] = QUICK[j]; QUICK[j] = t; saveQuick(); buildQuick(); } }
    });
    bar.appendChild(b);
  }
  hudQuick();
}
function hudQuick() {
  const cnt = QUICK.map(k => (k ? P.bag.filter(b => b.k === k).reduce((a, b) => a + b.n, 0) : -1));
  const sig = cnt.join(',');
  if (sig === quickSig) return;
  quickSig = sig;
  $('quickbar').querySelectorAll('.q').forEach((b, i) => {
    b.querySelector('em').textContent = cnt[i] > 0 ? cnt[i] : '';
    b.classList.toggle('none', cnt[i] === 0);
  });
}
function useQuick(i) {
  const k = QUICK[i];
  if (!k || P.dead) return;
  const idx = P.bag.findIndex(b => b.k === k);
  if (idx < 0) { log(`Không còn ${ITEMS[k].ten}.`, 'bad'); return; }
  invOp(['use', idx, k]);
}

// ---------------- menu Esc: phim dieu khien, gioi thieu phim, ngon ngu ----------------
let menuTab = 'keys';
function escape() {
  if (!$('menu').hidden) { closeMenu(); return; }
  if (!$('help').hidden) { closeHelp(); return; }
  if (TR) { send(['tc']); return; }
  if (panelOpen()) { closeInv(); closeShop(); closeSkills(); closeAch(); return; }
  if (dialogOpen) { closeDialog(); return; }
  if (!$('pcard').hidden) { $('pcard').hidden = true; return; }
  openMenu();
}
function openMenu() { $('menu').hidden = false; P.path = null; keys.clear(); showTab(menuTab); }
function closeMenu() { $('menu').hidden = true; rebind = null; }
function showTab(t) {
  menuTab = t;
  for (const b of $('menu-tabs').children) b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false');
  for (const sec of document.querySelectorAll('#menu .menu-pane')) sec.hidden = sec.dataset.pane !== t;
  if (t === 'keys') renderKeys();
  else if (t === 'guide') renderGuide();
  else for (const b of $('lang-pick').children) b.setAttribute('aria-pressed', b.dataset.lang === (window.LAZ_LANG || 'vi') ? 'true' : 'false');
}
function renderKeys() {
  const box = $('keys-grid'); box.textContent = '';
  for (const [grp, acts] of ACTS) {
    const h = document.createElement('h3'); h.textContent = grp; box.appendChild(h);
    for (const [id, ten] of acts) {
      const row = document.createElement('div'); row.className = 'kr';
      const sp = document.createElement('span'); sp.textContent = ten;
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = rebind === id ? 'Nhấn phím mới…' : keyName(BIND[id]);
      if (rebind === id) b.className = 'wait';
      b.addEventListener('click', () => { rebind = id; renderKeys(); });
      row.append(sp, b); box.appendChild(row);
    }
  }
}
function renderGuide() {
  const c = C(), tb = $('guide-table'); tb.textContent = '';
  const row = (ks, txt) => {
    const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
    for (const k of ks) { const kb = document.createElement('kbd'); kb.textContent = k; a.append(kb, ' '); }
    b.textContent = txt; tr.append(a, b); tb.appendChild(tr);
  };
  row([keyName(BIND.up), keyName(BIND.left), keyName(BIND.down), keyName(BIND.right)], 'Di chuyển. Mũi tên cũng dùng được, hoặc bấm (chạm) vào mặt đất.');
  row(['Chuột trái'], 'Bấm vào quái để chọn mục tiêu và tự đánh; bấm vào người chơi để mời vào đội; bấm vào NPC để nói chuyện.');
  row([keyName(BIND.atk)], `${c.chem} · tầm ${num(c.tam)} m. Chưa có mục tiêu thì chọn quái gần nhất.`);
  SKS().forEach((sk, i) => { if (sk) row([keyName(BIND['s' + (i + 1)])], `${sk.ten} (Lv${sk.lv}): ${sk.mo}`); });
  if (!c.skills.length) row(['1', '2', '3'], 'Nông Dân không có kỹ năng chiến đấu');
  row([keyName(BIND.dodge)], `${c.dodge.ten}: ${c.dodge.mo} · 20 Thể Lực`);
  row([keyName(BIND.pot)], 'Uống bình máu nhanh');
  row([keyName(BIND.q1) + '…' + keyName(BIND.q10)], 'Dùng vật phẩm ở ô nhanh. Kéo bình thuốc từ túi đồ thả vào ô, kéo ra ngoài hoặc bấm chuột phải để bỏ.');
  row([keyName(BIND.use)], 'Nói chuyện, mua bán, lên tàu, vào hang');
  row([keyName(BIND.inv)], 'Mở túi đồ');
  row([keyName(BIND.skills)], 'Bảng kỹ năng: xem chi tiết, chọn nhánh ở Lv20, gắn kỹ năng vào ô 1–3');
  row([keyName(BIND.ach)], 'Thành tựu');
  row([keyName(BIND.map)], 'Bật bản đồ nhỏ');
  if (ONLINE) row(['Enter'], 'Trò chuyện. /d để nói với đội, Tab đổi kênh');
  row([keyName(BIND.help)], 'Hướng dẫn');
  row(['Esc'], 'Đóng bảng đang mở, hoặc mở menu này');
}
for (const b of $('menu-tabs').children) b.addEventListener('click', () => showTab(b.dataset.tab));
for (const b of $('lang-pick').children) b.addEventListener('click', () => { if (b.dataset.lang !== (window.LAZ_LANG || 'vi') && window.LAZ_SET_LANG) window.LAZ_SET_LANG(b.dataset.lang); });
$('keys-reset').addEventListener('click', () => { Object.assign(BIND, KEY_DEF); try { localStorage.removeItem('lz_keys'); } catch (e) { /* bo qua */ } reBind(); keyLabels(); renderKeys(); });
$('menu-close').addEventListener('click', closeMenu);
$('menu-help').addEventListener('click', () => { closeMenu(); openHelp(); });
buildQuick();

const M2 = window.LAZ_MAPS;
Promise.all([
  ...Object.values(M2).flatMap(m => Object.entries(m.img).map(([k, src]) => load(k + '_' + m.key, src))),
  load('spr', SPR.img), load('cls', SPRC.img), load('ico', ICO.img), load('ski', SKI.img), load('tmp', TMP.img), load('rieng', RIENG.img), load('vathd', VHD.img)]).then(() => {
  resize(); buildPicker(); setMap('dbm');
  P.x = SPAWN.x; P.y = SPAWN.y;
  if (ONLINE) {
    const acc = loadAcc();
    if (acc) { LZ.set(.97); LZ.msg('Đang kết nối máy chủ…'); connect(acc); }
    else { LZ.done(); openCreate(); }
  } else {
    const had = restore();
    const s = S(); P.hp = s.hp; P.st = s.st; P.mp = s.mp;
    if (!had || !P.name) {
      // chua co nhan vat, hoac ban luu cu (truoc khi co man tao nhan vat): mo man tao nhan vat
      LZ.done();
      if (had) { CR.keep = true; CR.cls = P.cls; CR.race = P.race; }
      openCreate(had ? 'Bản lưu cũ chưa có nhân vật. Hãy đặt tên và chọn ngoại hình; cấp, EXP và tiền hiện có được giữ lại.' : '');
    }
    else { start(); log('Chào mừng trở lại' + (P.name ? ', ' + P.name : '') + ' (Lv' + P.lv + ').', 'good'); }
  }
  window.LAZ_DEBUG = { P, mobs, npcs, net, keys, shots, summons, CLASSES, changeClass, castSkill, doDodge, openCreate, invOp, openShop, openSmith, openInv, interact, useExit,
    geo: () => GEO, map: () => MAP, setClock: v => { clock = v; }, step: (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt, performance.now()); } };   // cho viec kiem thu trong trinh duyet
}).catch(src => { LZ.fail('Không tải được ' + src + '. Giữ nguyên các thư mục img và data cạnh index.html.'); });
})();
