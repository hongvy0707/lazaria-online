/* LazyEyes – Durable Object "World": Dao Binh Minh va cac Dungeon cua dao, mot dong ho chung cho moi nguoi choi.
   May chu giu: quai (vi tri, mau, AI, hoi sinh), sat thuong nguoi choi gay cho quai, EXP, tien, cap, tui do, trang bi, do ben,
   to doi, phong Dungeon rieng cho moi to doi, nhan vat (SQLite).
   May khach giu: di chuyen cua chinh minh (may chu kiem tra toc do va va cham), mau cua chinh minh khi bi quai danh
   (de ne dung luc theo dung hinh nguoi choi thay). Giai doan thu nghiem: mau nguoi choi chua do may chu tinh.
   Giao thuc: xem README trong thu muc nay. */
import './shim.js';
import '../../client/data/rules.js';
import '../../client/data/dbm.js';
import '../../client/data/hhd.js';

const R = globalThis.LAZ_RULES, MAPS = globalThis.LAZ_MAPS;
const PX = MAPS.dbm.tile;
const { CLASSES, RACES, BACKGROUNDS, LOAI, ITEMS, SLOTS, rnd, clamp, dist } = R;
const KINDS = Object.keys(LOAI);
const TOWN = (() => { const it = MAPS.dbm.items.find(i => i.spawn); return { x: it.x, y: it.y + 46 }; })();
const TICK_MS = 100, SAVE_MS = 15000;
const VIEW = 70 * PX;                       // gui quai trong vong 70 m quanh moi nguoi choi
const NEAR = 40 * PX;                       // su kien (so sat thuong...) gui cho nguoi trong vong 40 m
const DUNGEON_IDLE = 5 * 60e3;              // phong Dungeon khong con ai trong 5 phut thi dong
const EXIT_MS = 10000;                      // ha Boss xong: 10 giay sau tu ra khoi hang
const TRADE_NEAR = 8, TRADE_FAR = 12;      // giao dich: moi trong 8 m, di xa qua 12 m thi huy
const READY_MS = 20000, READY_NEAR = 12;    // to doi vao Dungeon: 20 giay de moi nguoi bam San sang; ai cung phai dung trong 12 m quanh cua hang

const r0 = v => Math.round(v), r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function randKey() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
// nhan vat cu (truoc khi co tui do): mac bo do tan thu, 5 binh mau nho
function migrate(c) {
  if (!c.eq) c.eq = R.starterEq(c.cls);
  if (!c.bag) { c.bag = []; R.bagAdd(c, { k: 'hp1', n: 5 }); }
  delete c.doBen;
  return c;
}

export class World {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS chars (
      id TEXT PRIMARY KEY, keyhash TEXT NOT NULL, lname TEXT UNIQUE NOT NULL, data TEXT NOT NULL, created INTEGER, seen INTEGER)`);
    this.rate = Math.max(1, Number(env.EXP_RATE) || 1);
    this.shopRate = clamp(Number(env.SHOP_RATE) || .05, .01, 1);   // giai doan thu: gia do = gia that x he so nay
    this.players = new Map();               // so ngan (n) -> nguoi choi dang ket noi
    this.byId = new Map();                  // id nhan vat -> nguoi choi
    this.nextN = 1;
    this.mobById = new Map(); this.nextMob = 1;
    this.zones = new Map(); this.nextZone = 1;
    this.parties = new Map(); this.nextParty = 1;
    this.solo = new Map();                  // id nhan vat -> phong Dungeon khi di mot minh
    this.clock = 60; this.timer = null; this.lastSave = Date.now(); this.t0 = Date.now();
    this.creates = new Map();               // chong tao nhan vat hang loat: dia chi IP -> moc thoi gian
    this.town = this.makeZone('dbm', 0);
    for (const p of MAPS.dbm.mobs) { const at = this.town.geo.freeSpot(p.x, p.y); this.addMob(this.town, Object.assign(R.makeMob(p.kind, at.x, at.y, PX), { origin: true })); }
  }

  // ---------------- vung ban do (dao, phong Dungeon) ----------------
  makeZone(key, zi) {
    const MAP = MAPS[key];
    const z = { key, zi, MAP, geo: R.makeGeo(MAP), mobs: [], d: null, empty: 0 };
    z.E = this.mobEnv(z);
    this.zones.set(zi, z);
    return z;
  }
  zonePlayers(z) { const out = []; for (const p of this.players.values()) if (p.z === z) out.push(p); return out; }
  addMob(z, m) { m.id = this.nextMob++; m.tgt = null; m.dmg = {}; m.z = z; z.mobs.push(m); this.mobById.set(m.id, m); return m; }

  // ---------------- HTTP ----------------
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/create' && req.method === 'POST') return this.create(req);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Cần WebSocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.join(server, url.searchParams.get('id') || '', url.searchParams.get('key') || '', url.searchParams.get('dev') === '1').catch(() => { try { server.close(1011, 'loi'); } catch (e) { /* da dong */ } });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Không có trang này', { status: 404 });
  }

  async create(req) {
    let b;
    try { b = await req.json(); } catch (e) { return json({ error: 'Dữ liệu không hợp lệ.' }, 400); }
    const ip = req.headers.get('CF-Connecting-IP'), now = Date.now();   // chay tren may (wrangler dev) thi khong co IP: bo qua gioi han
    const recent = ip ? (this.creates.get(ip) || []).filter(t => now - t < 3600e3) : [];
    if (recent.length >= 10) return json({ error: 'Tạo quá nhiều nhân vật trong 1 giờ, hãy thử lại sau.' }, 429);
    const name = String(b.name || '').trim().replace(/\s+/g, ' ');
    if (!R.NAME_RE.test(name)) return json({ error: 'Tên dài 3–16 ký tự, chỉ gồm chữ, số và khoảng trắng.' }, 400);
    if (!RACES[b.race]) return json({ error: 'Chủng tộc không hợp lệ.' }, 400);
    if (!R.classesFor(b.race).includes(b.cls)) return json({ error: 'Chủng tộc này không chọn được class đó.' }, 400);
    if (!BACKGROUNDS[b.bg]) return json({ error: 'Xuất Thân không hợp lệ.' }, 400);
    if (!R.GENDERS.includes(b.gender)) return json({ error: 'Giới tính không hợp lệ.' }, 400);
    const outfit = b.outfit | 0;
    if (outfit < 0 || outfit >= R.OUTFITS) return json({ error: 'Trang phục không hợp lệ.' }, 400);
    const lname = name.toLowerCase();
    if (this.sql.exec('SELECT 1 FROM chars WHERE lname = ?', lname).toArray().length) return json({ error: 'Tên này đã có người dùng.' }, 409);
    const id = crypto.randomUUID(), key = randKey();
    const data = migrate({ name, race: b.race, cls: b.cls, bg: b.bg, gender: b.gender, outfit, lv: 1, exp: 0, tien: 0, x: TOWN.x, y: TOWN.y });
    this.sql.exec('INSERT INTO chars (id, keyhash, lname, data, created, seen) VALUES (?, ?, ?, ?, ?, ?)', id, await sha256(key), lname, JSON.stringify(data), now, now);
    if (ip) { recent.push(now); this.creates.set(ip, recent); }
    return json({ id, key, char: data });
  }

  // ---------------- ket noi ----------------
  async join(ws, id, key, dev) {
    const row = this.sql.exec('SELECT keyhash, data FROM chars WHERE id = ?', id).toArray()[0];
    if (!row || row.keyhash !== await sha256(key)) {
      ws.send(JSON.stringify({ t: 'err', why: 'login', text: 'Không tìm thấy nhân vật hoặc mã đăng nhập sai.' }));
      ws.close(4001, 'login'); return;
    }
    const old = this.byId.get(id);
    if (old) { this.send(old, { t: 'err', why: 'dup', text: 'Nhân vật này vừa đăng nhập ở nơi khác.' }); try { old.ws.close(4002, 'dup'); } catch (e) { /* da dong */ } this.leave(old); }
    const c = migrate(JSON.parse(row.data));
    const p = {
      n: this.nextN++, id, ws, c, z: this.town, zseq: 0, x: c.x, y: c.y, face: 0, flip: 0, flags: 0, hp: 1, dead: false, S: null,
      fx: {}, stealth: 0, castAt: [0, 0, 0], cast: [], tok: 3, tokAt: Date.now(), summonUntil: 0, sumNext: 0,
      nextCrit: false, pcAt: 0, lastU: Date.now(), mt: 0, budget: 10 * PX, win: Date.now(), msgs: 0, chatAt: 0, ev: [], dirty: false,
      party: null, inv: null, seen: new Map(), zz: 0, sleep: 0, fightAt: 0, fightAcc: 0, useAt: 0, opAt: 0, dev: !!dev,
    };
    p.hp = this.stats(p).hp;
    if (!this.town.geo.canStand(p.x, p.y)) { p.x = TOWN.x; p.y = TOWN.y; }
    this.players.set(p.n, p); this.byId.set(id, p);
    ws.addEventListener('message', e => { try { this.onMsg(p, e.data); } catch (err) { /* bo qua tin hong */ } });
    ws.addEventListener('close', () => this.leave(p));
    ws.addEventListener('error', () => this.leave(p));
    this.send(p, { t: 'hi', now: Date.now(), me: p.n, char: c, x: p.x, y: p.y, rate: this.rate, shop: this.shopRate, clock: this.clock, kinds: KINDS, map: 'dbm', zi: 0,
      others: [...this.players.values()].filter(o => o !== p).map(o => this.info(o)) });
    for (const o of this.players.values()) if (o !== p) o.ev.push(['pj', this.info(p)]);
    if (!this.timer) { this.timer = setInterval(() => this.tick(), TICK_MS); }
  }

  info(p) { return { n: p.n, name: p.c.name, cls: p.c.cls, race: p.c.race, gender: p.c.gender, outfit: p.c.outfit, lv: p.c.lv }; }
  stats(p) { if (!p.S) p.S = R.hero(p.c.cls, p.c.lv, p.c.eq, p.c.br); return p.S; }
  fxv(p, k, now) { const f = p.fx[k]; return f && f.until > now ? f.v : 0; }        // bua loi dang co: atk, aspd, crit...
  // thanh tuu vua mo: bao cho nguoi choi va moi nguoi gan do
  ach(p, list) {
    for (const A of list) { p.ev.push(['ach', A.k]); this.nearBut(p, ['log', `${p.c.name} đạt thành tựu «${A.ten}».`, 'gold']); p.dirty = true; }
  }

  leave(p) {
    if (!this.players.has(p.n)) return;
    this.players.delete(p.n);
    if (this.byId.get(p.id) === p) this.byId.delete(p.id);
    this.partyLeave(p, true);
    if (p.trade) this.tradeEnd(p.trade, `${p.c.name} đã rời đảo. Hủy giao dịch.`);
    // dang trong Dungeon: lan sau vao lai o dao, truoc cua hang
    if (p.z !== this.town) { const D = R.DUNGEONS[p.z.d.key]; p.x = D.back.x; p.y = D.back.y; }
    this.save(p);
    for (const z of this.zones.values()) for (const m of z.mobs) if (m.tgt === p.n) { m.tgt = null; if (m.state === 'chase' || m.state === 'flee') m.state = 'return'; m.wind = null; }
    for (const o of this.players.values()) o.ev.push(['pl', p.n]);
    if (!this.players.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  save(p) {
    if (p.z === this.town) { p.c.x = Math.round(p.x); p.c.y = Math.round(p.y); }
    this.sql.exec('UPDATE chars SET data = ?, seen = ? WHERE id = ?', JSON.stringify(p.c), Date.now(), p.id);
    p.dirty = false;
  }

  send(p, o) { try { p.ws.send(JSON.stringify(o)); } catch (e) { /* ket noi da dong */ } }

  // ---------------- tin tu may khach ----------------
  onMsg(p, raw) {
    if (typeof raw !== 'string' || raw.length > 4000) return;
    const now = Date.now();
    if (now - p.win > 1000) { p.win = now; p.msgs = 0; }
    if (++p.msgs > 30) return;                                    // qua 30 tin moi giay: bo qua
    const d = JSON.parse(raw);
    if (d.t !== 'u') return;
    if ((d.z | 0) === p.zseq) this.move(p, d, now);                // tin vi tri gui truoc khi doi ban do: bo qua
    if (Array.isArray(d.ev)) for (const e of d.ev.slice(0, 30)) if (Array.isArray(e)) this.event(p, e, now);
  }

  move(p, d, now) {
    const dt = Math.min(2, (now - p.lastU) / 1000);
    p.lastU = now;
    if (typeof d.hp === 'number' && !p.dead) p.hp = clamp(d.hp, 0, this.stats(p).hp);
    p.face = clamp(d.f | 0, 0, 2); p.flip = d.fl ? 1 : 0; p.flags = d.s | 0;
    if (typeof d.x !== 'number' || typeof d.y !== 'number' || p.dead) return;
    if (p.sleep > now) { if (Math.hypot(d.x - p.x, d.y - p.y) > 1) p.ev.push(['pos', r1(p.x), r1(p.y)]); return; }
    const race = RACES[p.c.race] || {};
    // quy quang duong: hoi theo thoi gian that, 5 m/giay (+5% Thu Nhan) x 1,4 cho do tre mang; toi da 10 m de du mot lan
    // ne / lao / dich chuyen. Gui don nhieu tin nho cung khong di nhanh hon duoc.
    p.budget = Math.min(10 * PX, p.budget + 5 * PX * (1 + (race.speed || 0)) * 1.4 * dt);
    const dd = Math.hypot(d.x - p.x, d.y - p.y);
    if (dd > p.budget || !p.z.geo.canStand(d.x, d.y)) { p.ev.push(['pos', r1(p.x), r1(p.y)]); return; }
    p.budget -= dd;
    if (dd > 0) p.mt = now - this.t0;
    p.x = d.x; p.y = d.y;
  }

  event(p, e, now) {
    const c = CLASSES[p.c.cls];
    const asleep = p.sleep > now;
    switch (e[0]) {
      case 'c': {                                                  // dung ky nang s
        const s = e[1] | 0, sk = R.skillsOf(p.c)[s];
        if (!sk || p.c.lv < sk.lv || p.dead || asleep) return;
        if (now - p.castAt[s] < sk.cd * 1000 * .85) return;        // hoi chieu (chua 15% cho do tre mang)
        p.castAt[s] = now;
        p.cast[s] = { at: now, hits: new Map(), mobs: 0, sk, n: sk.kind === 'dice' ? clamp(e[2] | 0, sk.dice || 1, 6 * (sk.dice || 1)) : 0 };
        if (sk.kind === 'buff') p.fx[sk.stat] = { until: now + sk.t * 1000, v: sk.v };
        if (sk.kind === 'summon') p.summonUntil = now + sk.t * 1000;
        if (sk.wake) p.zz = Math.max(0, p.zz - 50);               // Thanh Tay, Trang Cuoi: giam Buon Ngu
        this.nearBut(p, ['oc', p.n, sk.id, e[3] | 0]);            // nguoi choi khac thay ky nang
        if (sk.kind === 'stealth') {
          p.stealth = now + sk.t * 1000;
          for (const m of p.z.mobs) if (m.tgt === p.n && m.state === 'chase') { m.state = 'return'; m.wind = null; m.tgt = null; }
        }
        return;
      }
      case 'h': if (!asleep) this.hitReq(p, c, e[1] | 0, e[2] | 0, now); return;
      case 'ht': {                                                 // may khach bao vua mat mau vi quai: Doi Suong hut mau
        const m = this.mobById.get(e[1] | 0), dmg = clamp(+e[2] || 0, 0, 2000);
        if (m && m.alive && m.z === p.z && m.t.drain && dist(m, p) < 6 * PX) m.hp = Math.min(m.max, m.hp + Math.min(dmg, m.atk * 3) * m.t.drain);
        return;
      }
      case 'sk': {                                                 // chon nhanh (Lv20) va gan ky nang vao o 1-3
        const br = e[1] == null ? null : String(e[1]);
        if (br && (p.c.lv < R.BRANCH_LV || !(R.BRANCHES[p.c.cls] || []).some(b => b.k === br))) p.ev.push(['log', 'Không chọn được nhánh này.', 'bad']);
        else if (now - p.fightAt < 5000) p.ev.push(['log', 'Đang giao tranh: đợi 5 giây sau đòn cuối rồi đổi kỹ năng.', 'bad']);
        else {
          const brChanged = br !== (p.c.br || null);
          p.c.br = br;
          p.c.sl = brChanged ? null : R.cleanSlots(p.c, e[2]);    // doi nhanh: o ky nang ve mac dinh cua nhanh moi
          p.S = null; p.dirty = true; p.cast = [];
          p.castAt = [now, now, now];                              // doi ky nang: ca 3 o hoi chieu lai tu dau
          this.ach(p, R.achCheck(p.c));
        }
        p.ev.push(['sk', p.c.br || null, p.c.sl || null]);
        return;
      }
      case 'achq': p.ev.push(['achs', R.achOf(p.c)]); return;
      case 'pc': if (now - p.pcAt > 1500) { p.nextCrit = true; p.pcAt = now; } return;   // ne dung luc: nhat ke tiep chi mang
      case 'd':                                                    // nguoi choi guc: moi mon do mat 10% do ben
        if (p.dead) return;
        p.dead = true; p.hp = 0; R.wear(p.c, 10); p.S = null; p.dirty = true; p.zz = 0;
        for (const m of p.z.mobs) if (m.tgt === p.n) { m.state = 'return'; m.wind = null; m.tgt = null; }
        this.sendInv(p);
        return;
      case 'r': {                                                  // hoi sinh: o dao thi o quang truong, trong Dungeon thi o dau hang
        if (!p.dead) return;
        const st = p.z === this.town ? TOWN : p.z.MAP.start;
        p.dead = false; p.x = st.x; p.y = st.y; p.hp = this.stats(p).hp; p.budget = 10 * PX; p.sleep = 0; p.zz = 0;
        p.ev.push(['pos', r1(p.x), r1(p.y)]);
        return;
      }
      case 'm': {                                                  // tro chuyen: kenh chung hoac kenh to doi ('d')
        const text = String(e[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!text || now - p.chatAt < 1200) return;
        p.chatAt = now;
        if (e[2] === 'd') { if (!p.party) { p.ev.push(['log', 'Bạn chưa ở trong tổ đội.', '']); return; } for (const o of p.party.members) o.ev.push(['chat', p.n, text, 'd']); }
        else for (const o of this.players.values()) o.ev.push(['chat', p.n, text, '']);
        return;
      }
      // tui do va trang bi
      case 'eq': case 'uq': case 'buy': case 'sell': case 'rep': case 'use': case 'ren': case 'fp': case 'fh': case 'ck': this.itemOp(p, e, now); return;
      case 'fa': case 'fy': case 'fn': case 'fr': case 'fl': case 'fv': this.friendOp(p, e); return;
      // to doi
      case 'pi': this.partyInvite(p, this.players.get(e[1] | 0) || this.findByName(e[1])); return;
      case 'pa': this.partyAccept(p, now); return;
      case 'pd': if (p.inv) { const f = this.players.get(p.inv.from); if (f) f.ev.push(['log', `${p.c.name} từ chối lời mời.`, '']); p.inv = null; } return;
      case 'pq': this.partyLeave(p); return;
      case 'pk': { const t = this.players.get(e[1] | 0); if (p.party && p.party.leader === p && t && t !== p && t.party === p.party) { t.ev.push(['log', 'Bạn bị mời ra khỏi tổ đội.', 'bad']); this.partyLeave(t); } return; }
      // Dungeon
      case 'tr': this.tradeAsk(p, this.players.get(e[1] | 0), now); return;      // giao dich giua 2 nguoi choi
      case 'tra': this.tradeOpen(p, now); return;
      case 'trd': { const f = p.tinv && this.players.get(p.tinv.from); if (f) f.ev.push(['log', `${p.c.name} từ chối giao dịch.`, '']); p.tinv = null; return; }
      case 'to': this.tradeOffer(p, e[1], e[2]); return;
      case 'tl': this.tradeLock(p, !!e[1]); return;
      case 'tk': this.tradeOk(p); return;
      case 'tc': if (p.trade) this.tradeEnd(p.trade, `${p.c.name} đã hủy giao dịch.`); return;
      case 'dg': this.enterDungeon(p, String(e[1] || ''), now); return;
      case 'ry': this.readyReply(p, !!e[1], now); return;
      case 'dx': this.exitDungeon(p); return;
      // chi khi chay thu tren may (wrangler.dev.toml co DEV = "1", Worker gan tham so dev=1): doi cap, tien, dich chuyen, ha quai de kiem tra tu dong
      case 'dev': {
        if (!p.dev) return;
        if (e[1] === 'lv') { p.c.lv = clamp(e[2] | 0, 1, R.MAX_LV); p.S = null; p.ev.push(['lv', p.c.lv]); this.ach(p, R.achCheck(p.c)); }
        if (e[1] === 'tien') { p.c.tien = e[2] | 0; p.ev.push(['me', this.me(p)]); }
        if (e[1] === 'tp') { p.x = +e[2]; p.y = +e[3]; p.ev.push(['pos', p.x, p.y]); }
        if (e[1] === 'dclock' && p.z.d) p.z.d.at -= (+e[2] || 0) * 1000;   // tua dong ho Dungeon
        if (e[1] === 'kill') for (const m of p.z.mobs) if (m.alive && (e[2] == null || m.f === e[2] || m.kind === e[2])) { m.dmg[p.n] = 1; this.killMob(m); }
        return;
      }
    }
  }
  findByName(name) { const l = String(name || '').trim().toLowerCase(); for (const o of this.players.values()) if (o.c.name.toLowerCase() === l) return o; return null; }

  // ---------------- tui do, trang bi, cua hang ----------------
  itemOp(p, e, now) {
    if (now - p.opAt < 120) return;                                // chong bam lien tuc
    p.opAt = now;
    if (p.trade) { p.ev.push(['log', 'Đang giao dịch: xong hoặc hủy giao dịch trước.', 'bad']); this.sendInv(p); return; }
    const c = p.c, rate = this.shopRate;
    const nearNpc = N => p.z === this.town && Math.hypot(p.x - N.x, p.y - N.y) <= R.NPC_NEAR * PX;
    const idx = (i, k) => (c.bag[i] && c.bag[i].k === k ? i : -1);
    let why = '', msg = '';
    switch (e[0]) {
      case 'eq': { const i = idx(e[1] | 0, e[2]); why = i < 0 ? 'Món đồ đã đổi chỗ, hãy thử lại.' : R.doEquip(c, i); if (!why) msg = 'Đã mặc ' + ITEMS[e[2]].ten + '.'; break; }
      case 'uq': why = SLOTS.includes(e[1]) ? R.doUnequip(c, e[1]) : 'Ô không hợp lệ.'; break;
      case 'buy':
        if (!nearNpc(R.SHOP_NPC)) { why = 'Hãy đứng gần ' + R.SHOP_NPC.ten + ' ở Chợ Cảng.'; break; }
        const r = e[2] === 1 ? 1 : 0;
        why = ITEMS[e[1]] ? R.doBuy(c, e[1], rate, r) : 'Không có món này.';
        if (!why) msg = `Đã mua ${ITEMS[e[1]].ten}${r && ITEMS[e[1]].base ? ' (Tốt)' : ''} (−${R.money(R.price(e[1], rate, r))}).`;
        break;
      case 'sell': {
        if (!nearNpc(R.SHOP_NPC)) { why = 'Hãy đứng gần ' + R.SHOP_NPC.ten + ' ở Chợ Cảng.'; break; }
        const i = idx(e[1] | 0, e[2]);
        if (i < 0) { why = 'Món đồ đã đổi chỗ, hãy thử lại.'; break; }
        const v = R.sellPrice(c.bag[i], rate);
        why = R.doSell(c, i, rate);
        if (!why) msg = `Đã bán ${ITEMS[e[2]].ten} (+${R.money(v)}).`;
        break;
      }
      case 'rep': {
        if (!nearNpc(R.SMITH_NPC)) { why = 'Hãy đứng gần ' + R.SMITH_NPC.ten + ' ở Chợ Cảng.'; break; }
        const cost = R.repairCost(c, rate);
        why = R.doRepair(c, rate);
        if (!why) msg = `Đã sửa trang bị (−${R.money(cost)}). Độ bền tối đa giảm theo số điểm đã sửa.`;
        break;
      }
      case 'ren': {
        if (!nearNpc(R.SMITH_NPC)) { why = 'Hãy đứng gần ' + R.SMITH_NPC.ten + ' ở Chợ Cảng.'; break; }
        const [w, ok, cost] = R.doRen(c, String(e[1]), rate);
        why = w;
        if (!why) { const it = c.eq[e[1]]; msg = ok ? `Rèn thành công: ${ITEMS[it.k].ten} +${it.up}! (−${R.money(cost)})` : `Rèn thất bại, ${ITEMS[it.k].ten} vẫn +${it.up || 0} (−${R.money(cost)}).`; if (!ok) { p.ev.push(['log', msg, 'bad']); msg = ''; } }
        break;
      }
      case 'fp': if (p.c.cls === 'nd' && (p.z !== this.town || !R.nearField(p))) { why = 'Hãy ra ruộng cạnh Xưởng Nghề để trồng.'; break; }
        why = R.doPlant(c, e[1] | 0, String(e[2]), now); if (!why) msg = `Đã trồng ${ITEMS[e[2]].ten}.`; break;
      case 'fh': { if (p.c.cls === 'nd' && (p.z !== this.town || !R.nearField(p))) { why = 'Hãy ra ruộng cạnh Xưởng Nghề để thu hoạch.'; break; }
        const [w, n] = R.doHarvest(c, e[1] | 0, now); why = w; if (!why) msg = `Thu hoạch ${n} nông sản.`; break; }
      case 'ck': why = R.doCook(c, String(e[1])); if (!why) msg = `Đã nấu ${ITEMS[e[1]].ten}.`; break;
      case 'use': {
        const i = idx(e[1] | 0, e[2]), I = ITEMS[e[2]];
        if (i < 0 || !I || !(I.heal || I.an)) { why = 'Không dùng được.'; break; }
        if (p.dead || now - p.useAt < 1000) return;
        p.useAt = now;
        if (I.an) p.fx[I.an[0]] = { until: now + I.an[2] * 1000, v: I.an[1] };             // mon an: bua loi
        if (--c.bag[i].n <= 0) c.bag.splice(i, 1);
        p.ev.push(['use', e[2]]);
        break;
      }
    }
    if (why) p.ev.push(['log', why, 'bad']);
    else { p.S = null; p.dirty = true; if (msg) p.ev.push(['log', msg, 'good']); }
    this.sendInv(p);
  }
  sendInv(p) { p.ev.push(['inv', { bag: p.c.bag, eq: p.c.eq, tien: p.c.tien, farm: R.farmOf(p.c), now: Date.now() }]); }

  // ---------------- ban be (de xuat 14/10/2026): ket ban hai chieu, xem trang bi cua ban (ca khi ban offline) ----------------
  // c.fr = danh sach ten ban. Loi moi chi giu khi ca hai dang online (p.frq = ten nguoi moi -> het han).
  charByName(name) {
    const on = this.findByName(name);
    if (on) return { c: on.c, on };
    const row = this.sql.exec('SELECT id, data FROM chars WHERE lname = ?', String(name).toLowerCase()).toArray()[0];
    return row ? { c: JSON.parse(row.data), id: row.id } : null;
  }
  editChar(name, fn) {                                             // sua du lieu nhan vat ke ca khi offline
    const r = this.charByName(name);
    if (!r) return;
    fn(r.c);
    if (r.on) r.on.dirty = true; else this.sql.exec('UPDATE chars SET data = ? WHERE id = ?', JSON.stringify(r.c), r.id);
  }
  friendList(p) {
    const fr = p.c.fr || [];
    p.ev.push(['fl', fr.map(n => { const o = this.findByName(n), r = o ? null : this.charByName(n); const c = o ? o.c : r && r.c; return c ? [c.name, !!o, c.lv, c.cls] : [n, false, 0, '']; })]);
  }
  friendOp(p, e) {
    const c = p.c, fr = c.fr || (c.fr = []), has = n => fr.some(x => x.toLowerCase() === String(n).toLowerCase());
    const now = Date.now();
    switch (e[0]) {
      case 'fa': {                                                  // moi ket ban (ten hoac so nguoi choi)
        const t = this.players.get(e[1] | 0) || this.findByName(e[1]);
        if (!t || t === p) { p.ev.push(['log', 'Người này không online.', '']); return; }
        if (has(t.c.name)) { p.ev.push(['log', `${t.c.name} đã là bạn bè.`, '']); return; }
        if (fr.length >= 50) { p.ev.push(['log', 'Danh sách bạn bè đã đủ 50 người.', 'bad']); return; }
        if (!t.frq) t.frq = new Map();
        if (t.frq.size > 20) t.frq.clear();
        t.frq.set(c.name, now + 60000);
        t.ev.push(['fq', c.name, c.lv, c.cls]);
        p.ev.push(['log', `Đã gửi lời mời kết bạn tới ${t.c.name}.`, '']);
        return;
      }
      case 'fy': case 'fn': {                                       // dong y / tu choi
        const until = p.frq && p.frq.get(String(e[1]));
        if (p.frq) p.frq.delete(String(e[1]));
        const f = this.findByName(e[1]);
        if (!until || until < now || !f) { p.ev.push(['log', 'Lời mời đã hết hạn.', '']); return; }
        if (e[0] === 'fn') { f.ev.push(['log', `${c.name} từ chối kết bạn.`, '']); return; }
        if (fr.length >= 50 || (f.c.fr || []).length >= 50) { p.ev.push(['log', 'Danh sách bạn bè đã đủ 50 người.', 'bad']); return; }
        if (!has(f.c.name)) fr.push(f.c.name);
        if (!(f.c.fr || (f.c.fr = [])).includes(c.name)) f.c.fr.push(c.name);
        p.dirty = f.dirty = true;
        for (const o of [p, f]) { o.ev.push(['log', `${o === p ? f.c.name : c.name} và bạn đã là bạn bè.`, 'good']); this.friendList(o); }
        return;
      }
      case 'fr': {                                                  // xoa ban: xoa ca hai phia
        const n = String(e[1]);
        c.fr = fr.filter(x => x.toLowerCase() !== n.toLowerCase()); p.dirty = true;
        this.editChar(n, o => { o.fr = (o.fr || []).filter(x => x !== c.name); });
        this.friendList(p);
        return;
      }
      case 'fl': this.friendList(p); return;
      case 'fv': {                                                  // xem trang bi cua ban
        if (!has(e[1])) { p.ev.push(['log', 'Chỉ xem được trang bị của bạn bè.', '']); return; }
        const r = this.charByName(e[1]);
        if (!r) return;
        const o = r.c;
        p.ev.push(['fv', { name: o.name, cls: o.cls, race: o.race, gender: o.gender, outfit: o.outfit, lv: o.lv, br: o.br || null, eq: o.eq || {}, on: !!r.on }]);
        return;
      }
    }
  }

  // ---------------- giao dich giua 2 nguoi choi (dung gan nhau, ca hai khoa roi cung dong y) ----------------
  // moi ben dua do trong tui (ca chong) va tien. Doi offer thi ca hai mo khoa. Du 2 dong y: may chu kiem tra lai
  // (do con trong tui, du tien, du cho trong tui) roi doi cung mot luc va luu ngay.
  tradeNear(a, b, m) { return a.z === b.z && !a.dead && !b.dead && Math.hypot(a.x - b.x, a.y - b.y) <= m * PX; }
  tradeAsk(p, t, now) {
    if (!t || t === p) { p.ev.push(['log', 'Không tìm thấy người chơi này.', '']); return; }
    if (p.trade || t.trade) { p.ev.push(['log', (p.trade ? 'Bạn' : t.c.name) + ' đang giao dịch với người khác.', 'bad']); return; }
    if (!this.tradeNear(p, t, TRADE_NEAR)) { p.ev.push(['log', `Hãy đứng gần ${t.c.name} (trong ${TRADE_NEAR} m) để giao dịch.`, 'bad']); return; }
    if (now - (p.trAskAt || 0) < 3000) return;
    p.trAskAt = now;
    t.tinv = { from: p.n, until: now + 30000 };
    t.ev.push(['tri', p.n, p.c.name, p.c.lv, p.c.cls]);
    p.ev.push(['log', `Đã mời ${t.c.name} giao dịch.`, '']);
  }
  tradeOpen(p, now) {
    const inv = p.tinv; p.tinv = null;
    const f = inv && inv.until >= now && this.players.get(inv.from);
    if (!f || f.trade || p.trade) { p.ev.push(['log', 'Lời mời giao dịch đã hết hạn.', '']); return; }
    if (!this.tradeNear(p, f, TRADE_NEAR)) { p.ev.push(['log', `Hãy đứng gần ${f.c.name} (trong ${TRADE_NEAR} m) để giao dịch.`, 'bad']); return; }
    const t = { a: f, b: p, off: new Map([[f, { it: [], tien: 0 }], [p, { it: [], tien: 0 }]]), lock: new Set(), ok: new Set() };
    f.trade = p.trade = t;
    this.tradeSync(t);
  }
  // moi mon dua: { ref: mon trong tui, n: so luong (do chong; 0 = do khong chong) }
  tradeSide(t, p) {
    const o = t.off.get(p), c = p.c;
    return { idx: o.it.map(x => c.bag.indexOf(x.ref)), it: o.it.map(x => (x.n ? Object.assign({}, x.ref, { n: x.n }) : x.ref)), tien: o.tien, lock: t.lock.has(p) ? 1 : 0, ok: t.ok.has(p) ? 1 : 0 };
  }
  tradeSync(t) {
    for (const [me, them] of [[t.a, t.b], [t.b, t.a]]) me.ev.push(['tw', { n: them.n, name: them.c.name, me: this.tradeSide(t, me), them: this.tradeSide(t, them) }]);
  }
  tradeOffer(p, idx, tien) {
    const t = p.trade;
    if (!t || !Array.isArray(idx) || idx.length > R.BAG_MAX) return;
    const c = p.c, seen = new Set(), it = [];
    // moi phan tu: chi so o tui (dua ca chong) hoac [chi so, so luong] (dua mot phan chong)
    for (const v of idx) {
      const k = (Array.isArray(v) ? v[0] : v) | 0, ref = c.bag[k];
      if (!ref || seen.has(k)) continue;
      seen.add(k);
      it.push({ ref, n: ITEMS[ref.k].stack ? clamp((Array.isArray(v) ? v[1] : ref.n) | 0, 1, ref.n) : 0 });
    }
    t.off.set(p, { it, tien: Math.max(0, Math.min(Math.floor(+tien || 0), c.tien)) });
    t.lock.clear(); t.ok.clear();                                     // doi offer: ca hai phai khoa lai
    this.tradeSync(t);
  }
  tradeLock(p, on) {
    const t = p.trade;
    if (!t) return;
    if (on) t.lock.add(p); else { t.lock.delete(p); t.ok.clear(); }
    this.tradeSync(t);
  }
  tradeOk(p) {
    const t = p.trade;
    if (!t || t.lock.size < 2) return;
    t.ok.add(p);
    if (t.ok.size < 2) { this.tradeSync(t); return; }
    const why = this.tradeDo(t);
    if (why) { t.lock.clear(); t.ok.clear(); for (const o of [t.a, t.b]) o.ev.push(['log', why, 'bad']); this.tradeSync(t); return; }
    const sum = o => { const f = t.off.get(o); return [f.it.map(x => ITEMS[x.ref.k].ten + (x.n > 1 ? ' ×' + x.n : '')).join(', '), f.tien ? R.money(f.tien) : ''].filter(Boolean).join(' + ') || 'không có gì'; };
    t.a.ev.push(['log', `Giao dịch xong với ${t.b.c.name}: nhận ${sum(t.b)}.`, 'good']);
    t.b.ev.push(['log', `Giao dịch xong với ${t.a.c.name}: nhận ${sum(t.a)}.`, 'good']);
    this.tradeEnd(t, '');
  }
  // doi do: lam tren ban sao tui cua ca hai, du cho moi ghi that (khong bao gio mat do giua chung)
  tradeDo(t) {
    const { a, b } = t, oa = t.off.get(a), ob = t.off.get(b);
    for (const [p, o] of [[a, oa], [b, ob]]) {
      if (o.it.some(x => p.c.bag.indexOf(x.ref) < 0 || (x.n && x.ref.n < x.n))) return `Đồ của ${p.c.name} đã đổi chỗ. Hãy chọn lại rồi khóa.`;
      if (o.tien > p.c.tien) return `${p.c.name} không đủ tiền.`;
    }
    const copy = x => JSON.parse(JSON.stringify(x));
    const after = (p, give, get) => {
      const bag = p.c.bag.map(copy);
      for (const x of give) { const i = p.c.bag.indexOf(x.ref); if (x.n && x.n < x.ref.n) bag[i].n -= x.n; else bag[i] = null; }   // dua mot phan chong: tru so luong
      const c2 = { bag: bag.filter(Boolean) };
      for (const x of get) if (R.bagAdd(c2, x.n ? Object.assign(copy(x.ref), { n: x.n }) : copy(x.ref))) return null;
      return c2.bag;
    };
    const bagA = after(a, oa.it, ob.it), bagB = after(b, ob.it, oa.it);
    if (!bagA) return `Túi của ${a.c.name} không đủ chỗ.`;
    if (!bagB) return `Túi của ${b.c.name} không đủ chỗ.`;
    a.c.bag = bagA; b.c.bag = bagB;
    a.c.tien += ob.tien - oa.tien; b.c.tien += oa.tien - ob.tien;
    for (const p of [a, b]) { R.achOf(p.c).trade++; this.ach(p, R.achCheck(p.c)); }
    for (const p of [a, b]) { p.S = null; this.save(p); this.sendInv(p); }
    return '';
  }
  tradeEnd(t, why) {
    for (const p of [t.a, t.b]) { if (p.trade === t) p.trade = null; p.ev.push(['tw', null]); if (why) p.ev.push(['log', why, 'bad']); }
  }
  tradeTick(now) {
    void now;
    for (const p of this.players.values()) {
      const t = p.trade;
      if (t && t.a === p && !this.tradeNear(t.a, t.b, TRADE_FAR)) this.tradeEnd(t, 'Hai người đã đi xa nhau. Hủy giao dịch.');
    }
  }

  // ---------------- to doi (toi da 5 nguoi) ----------------
  partyInvite(p, t) {
    if (!t || t === p) { p.ev.push(['log', 'Không tìm thấy người chơi này.', '']); return; }
    if (t.party) { p.ev.push(['log', `${t.c.name} đã ở trong một tổ đội khác.`, '']); return; }
    if (p.party && p.party.members.size >= R.PARTY_MAX) { p.ev.push(['log', 'Tổ đội đã đủ 5 người.', 'bad']); return; }
    if (p.party && p.party.leader !== p) { p.ev.push(['log', 'Chỉ đội trưởng mới mời được.', '']); return; }
    t.inv = { from: p.n, until: Date.now() + 30000 };
    t.ev.push(['pinv', p.n, p.c.name, p.c.lv, p.c.cls]);
    p.ev.push(['log', `Đã mời ${t.c.name} vào tổ đội.`, '']);
  }
  partyAccept(p, now) {
    const inv = p.inv; p.inv = null;
    if (!inv || inv.until < now || p.party) return;
    const f = this.players.get(inv.from);
    if (!f) { p.ev.push(['log', 'Người mời đã rời đảo.', '']); return; }
    let pt = f.party;
    if (!pt) { pt = { id: this.nextParty++, leader: f, members: new Set([f]), dz: null }; f.party = pt; this.parties.set(pt.id, pt); }
    if (pt.members.size >= R.PARTY_MAX) { p.ev.push(['log', 'Tổ đội đã đủ 5 người.', 'bad']); return; }
    pt.members.add(p); p.party = pt;
    for (const o of pt.members) o.ev.push(['log', `${p.c.name} đã vào tổ đội.`, 'good']);
    this.partySync(pt);
  }
  partyLeave(p, quiet) {
    const pt = p.party;
    if (!pt) return;
    pt.members.delete(p); p.party = null;
    if (!quiet) p.ev.push(['party', null]);
    if (pt.leader === p) pt.leader = pt.members.values().next().value || null;
    for (const o of pt.members) o.ev.push(['log', `${p.c.name} đã rời tổ đội.`, '']);
    if (pt.members.size <= 1) {
      for (const o of pt.members) { o.party = null; o.ev.push(['party', null]); if (pt.dz && this.zones.has(pt.dz)) this.solo.set(o.id, pt.dz); }
      this.parties.delete(pt.id);
    } else this.partySync(pt);
  }
  partySync(pt) {
    const data = { id: pt.id, leader: pt.leader.n, m: [...pt.members].map(o => this.info(o)) };
    for (const o of pt.members) o.ev.push(['party', data]);
  }

  // ---------------- Dungeon ----------------
  // dung gan cua hang (m)
  nearDoor(p, D, r) {
    const door = MAPS.dbm.items.find(i => i.cat === 'dungeon' && i.name === D.cua);
    const cx = clamp(p.x, door.x0, door.x1), cy = clamp(p.y, door.y0, door.y1);
    return p.z === this.town && Math.hypot(p.x - cx, p.y - cy) <= r * PX;
  }
  // ly do mot thanh vien chua vao duoc ('' = duoc)
  notReady(o, D) {
    if (o.dead) return 'đang gục';
    if (o.z !== this.town) return 'chưa ra khỏi hang';
    if (o.c.lv < D.minLv) return `chưa đủ Lv${D.minLv}`;
    if (!this.nearDoor(o, D, READY_NEAR)) return 'chưa tới cửa hang';
    return '';
  }
  enterDungeon(p, key, now) {
    const D = R.DUNGEONS[key];
    if (!D || p.z !== this.town || p.dead) return;
    if (!this.nearDoor(p, D, 8)) { p.ev.push(['log', 'Hãy tới gần cửa hang.', '']); return; }
    if (p.c.lv < D.minLv) { p.ev.push(['log', `${D.ten} cần tối thiểu Lv${D.minLv} (khuyên Lv${D.lv}).`, 'bad']); return; }
    const pt = p.party && p.party.members.size > 1 ? p.party : null;
    if (!pt) {                                                     // mot minh: vao ngay (phong cu con dang choi thi vao lai)
      let z = this.solo.has(p.id) && this.zones.get(this.solo.get(p.id));
      if (!z || z.d.done) { z = this.makeDungeon(key, 1, null); this.solo.set(p.id, z.zi); }
      this.moveTo(p, z, z.MAP.start.x, z.MAP.start.y);
      return;
    }
    // to doi dang trong hang: chi nguoi da vao cung luc dau moi vao lai duoc
    const cur = pt.dz != null && this.zones.get(pt.dz);
    if (cur && !cur.d.done && this.zonePlayers(cur).length) {
      if (cur.d.roster.has(p.id)) this.moveTo(p, cur, cur.MAP.start.x, cur.MAP.start.y);
      else p.ev.push(['log', 'Tổ đội đang ở trong hang. Đợi lượt sau để vào cùng nhau.', '']);
      return;
    }
    if (pt.leader !== p) { p.ev.push(['log', 'Đội trưởng mở hang cho cả tổ đội.', '']); return; }
    if (pt.rc) return;
    const bad = [...pt.members].map(o => [o, this.notReady(o, D)]).filter(x => x[1]);
    if (bad.length) { p.ev.push(['log', 'Chưa vào được: ' + bad.map(([o, why]) => `${o.c.name} ${why}`).join(', ') + '. Cả tổ đội cần đứng ở cửa hang.', 'bad']); return; }
    pt.rc = { key, until: now + READY_MS, ok: new Set([p]), n: pt.members.size };
    this.readySync(pt);
  }
  // kiem tra san sang: gui danh sach cho ca to doi; null = dong bang
  readySync(pt) {
    const rc = pt.rc, D = rc && R.DUNGEONS[rc.key];
    const data = rc ? { ten: D.ten, leader: pt.leader.n, left: Math.max(0, Math.ceil((rc.until - Date.now()) / 1000)), m: [...pt.members].map(o => [o.n, o.c.name, rc.ok.has(o) ? 1 : 0]) } : null;
    for (const o of pt.members) o.ev.push(['rc', data]);
  }
  readyCancel(pt, why) {
    pt.rc = null;
    for (const o of pt.members) o.ev.push(['rc', null], ['log', why, 'bad']);
  }
  readyReply(p, yes, now) {
    const pt = p.party, rc = pt && pt.rc;
    if (!rc || !pt.members.has(p)) return;
    if (!yes) { this.readyCancel(pt, `${p.c.name} chưa sẵn sàng. Hủy vào hang.`); return; }
    rc.ok.add(p);
    if (rc.ok.size < pt.members.size) { this.readySync(pt); return; }
    this.readyGo(pt, now);
  }
  readyTick(now) {
    for (const pt of this.parties.values()) {
      const rc = pt.rc;
      if (!rc) continue;
      if (pt.members.size !== rc.n) { this.readyCancel(pt, 'Tổ đội thay đổi người. Hủy vào hang.'); continue; }
      if (now > rc.until) { this.readyCancel(pt, 'Hết giờ chờ: ' + [...pt.members].filter(o => !rc.ok.has(o)).map(o => o.c.name).join(', ') + ' chưa sẵn sàng.'); continue; }
    }
  }
  // ca to doi san sang: kiem tra lai roi dua moi nguoi vao cung mot luc
  readyGo(pt, now) {
    const rc = pt.rc, D = R.DUNGEONS[rc.key];
    pt.rc = null;
    for (const o of pt.members) o.ev.push(['rc', null]);
    const bad = [...pt.members].map(o => [o, this.notReady(o, D)]).filter(x => x[1]);
    if (bad.length) { for (const o of pt.members) o.ev.push(['log', 'Chưa vào được: ' + bad.map(([o2, why]) => `${o2.c.name} ${why}`).join(', ') + '.', 'bad']); return; }
    const z = this.makeDungeon(rc.key, pt.members.size, pt);
    pt.dz = z.zi;
    for (const o of pt.members) { z.d.roster.add(o.id); this.moveTo(o, z, z.MAP.start.x, z.MAP.start.y); }
    void now;
  }
  makeDungeon(key, n, pt) {
    const z = this.makeZone(R.DUNGEONS[key].map, this.nextZone++);
    z.d = { key, n, party: pt ? pt.id : null, roster: new Set() };
    this.fillDungeon(z);
    return z;
  }
  // dat phong ve luc dau: dong cong, sinh lai toan bo quai, dong ho 5 phut chay lai, bo quy thuong
  fillDungeon(z) {
    const d = z.d;
    for (const m of z.mobs) this.mobById.delete(m.id);
    z.mobs.length = 0;
    Object.assign(d, { open: 0, at: Date.now(), boss: null, engagedAt: 0, enraged: false, done: false, lampOn: false, lampA: -90, lampDir: 1, lampFlip: 10, bank: new Map(), warned: 0, meter: {}, meterV: 0 });
    for (const g of z.MAP.gates) z.geo.setBlock(g, true);
    for (const s of z.MAP.mobs) {
      const at = z.geo.freeSpot(s.x, s.y);
      const m = this.addMob(z, R.makeMob(s.kind, at.x, at.y, PX, { hpMul: R.dungeonHp(d.n) }));
      m.f = s.f;
      if (s.kind === 'keeper') d.boss = m;
    }
  }
  bankOf(bank, p) {
    let b = bank.get(p.n);
    if (!b) bank.set(p.n, b = { exp: 0, tien: 0, items: [] });
    return b;
  }
  // het gio ma chua ha Boss: moi nguoi ve dau hang, phong lam lai tu dau, thuong da tich mat het
  dungeonTimer(z, now) {
    const d = z.d, lim = R.DUNGEONS[d.key].limit * 1000, left = lim - (now - d.at);
    if (d.done) {                                                    // da ha Boss: het 10 giay thi dua moi nguoi ra truoc cua hang
      if (d.exitAt && now >= d.exitAt) {
        d.exitAt = 0;
        const D = R.DUNGEONS[d.key];
        for (const o of this.zonePlayers(z)) { if (o.dead) { o.dead = false; o.hp = this.stats(o).hp; } this.moveTo(o, this.town, D.back.x, D.back.y); }
      }
      return;
    }
    if (left <= 60e3 && d.warned < 1) { d.warned = 1; for (const o of this.zonePlayers(z)) o.ev.push(['log', 'Còn 1 phút! Chưa hạ Boss thì hang sẽ làm lại từ đầu.', 'bad']); }
    if (left > 0) return;
    this.fillDungeon(z);
    for (const o of this.zonePlayers(z)) {
      if (o.dead) { o.dead = false; o.hp = this.stats(o).hp; }
      this.moveTo(o, z, z.MAP.start.x, z.MAP.start.y);
      o.ev.push(['log', `Hết ${R.DUNGEONS[d.key].limit / 60} phút! ${R.DUNGEONS[d.key].ten} làm lại từ đầu, thưởng đã tích bị mất.`, 'bad']);
    }
  }
  exitDungeon(p) {
    if (p.z === this.town || p.dead) return;
    const ex = p.z.MAP.items.find(i => i.cat === 'exit');
    const cx = clamp(p.x, ex.x0, ex.x1), cy = clamp(p.y, ex.y0, ex.y1);
    if (Math.hypot(p.x - cx, p.y - cy) > 6 * PX) return;
    const D = R.DUNGEONS[p.z.d.key];
    this.moveTo(p, this.town, D.back.x, D.back.y);
  }
  moveTo(p, z, x, y) {
    for (const m of p.z.mobs) if (m.tgt === p.n) { m.tgt = null; if (m.state === 'chase') m.state = 'return'; m.wind = null; }
    p.z = z; p.x = x; p.y = y; p.zseq++; p.budget = 10 * PX; p.seen.clear(); p.zz = 0; p.sleep = 0;
    p.ev.push(['map', z.key, z.zi, p.zseq, x, y, z.d ? z.d.open : 0]);
  }
  // mo cong khi tang truoc het quai
  checkGates(z) {
    const d = z.d;
    while (d.open < z.MAP.gates.length) {
      const f = z.MAP.gates[d.open].f;
      if (z.mobs.some(m => m.f === f && m.alive)) break;
      z.geo.setBlock(z.MAP.gates[d.open], false);
      d.open++;
      for (const o of this.zonePlayers(z)) o.ev.push(['log', `Cổng tầng ${d.open + 1} đã mở.`, 'good'], ['gate', d.open]);
    }
  }
  // den quet cua Nguoi Gac Den: dung ngoai vung sang +10 Buon Ngu moi giay, trong vung sang giam dan; day 100 thi ngu 3 giay
  lampTick(z, dt, now) {
    const d = z.d, b = d.boss, L = R.DUNGEONS[d.key].lamp;
    if (!b || !b.alive || b.state !== 'chase') { d.lampOn = false; return; }
    if (!d.engagedAt) d.engagedAt = now;
    d.lampOn = true;
    d.lampFlip -= dt;
    if (d.lampFlip <= 0) { d.lampFlip = rnd(7, 13); d.lampDir = Math.random() < .5 ? -1 : 1; }
    d.lampA = (d.lampA + d.lampDir * L.speed * dt + 360) % 360;
    for (const p of this.zonePlayers(z)) {
      if (p.dead || p.y > 33 * PX) continue;
      const dx = p.x - b.x, dy = p.y - b.y, inR = Math.hypot(dx, dy) <= L.r * PX;
      let da = Math.abs(((Math.atan2(dy, dx) * 180 / Math.PI) - d.lampA + 540) % 360 - 180);
      const lit = inR && da <= L.arc / 2;
      if (p.sleep > now) continue;
      if (lit) p.zz = Math.max(0, p.zz - L.back * dt);
      else p.zz += L.zz * dt * (1 - ((BACKGROUNDS[p.c.bg] || {}).sleepy || 0));    // Dua Tre Bi Nguyen: Buon Ngu tang cham 15%
      if (p.zz >= 100) { p.zz = 35; p.sleep = now + L.sleep * 1000; p.ev.push(['sl', L.sleep]); }
    }
    const enr = (now - d.engagedAt) / 1000 > R.DUNGEONS[d.key].enrage;
    if (enr && !d.enraged) { d.enraged = true; for (const o of this.zonePlayers(z)) o.ev.push(['log', 'Người Gác Đèn nổi điên: sát thương ×3!', 'bad']); }
  }
  dungeonDone(z) {
    const d = z.d, D = R.DUNGEONS[d.key];
    d.done = true;
    d.exitAt = Date.now() + EXIT_MS;
    const secs = Math.round((Date.now() - d.at) / 1000), top = this.meterList(d).slice(0, 5);
    for (const o of this.zonePlayers(z)) {
      o.ev.push(['dmf', D.ten, secs, top]);                        // bang vinh danh top 1-5 sat thuong
      const first = !R.cleared(o.c, d.key);
      this.ach(o, R.achClear(o.c, d.key, secs));
      if (first) o.ev.push(['log', `Lần đầu clear ${D.ten}! Từ lần sau, quái trong hang chỉ còn ${R.REPEAT_EXP * 100}% EXP với bạn.`, 'good']);
      o.ev.push(['log', `Hoàn thành ${D.ten} sau ${Math.floor(secs / 60)} phút ${secs % 60} giây! Tự ra khỏi hang sau ${EXIT_MS / 1000} giây.`, 'good']);
      const b = d.bank.get(o.n);
      if (b) {
        o.c.tien += b.tien;
        o.ev.push(['xp', b.exp, b.tien]);
        this.gainExp(o, b.exp);
        for (const it of b.items) {
          const name = ITEMS[it.k].ten + (it.r ? ' (' + R.RARITY[it.r].ten + ')' : '');
          const why = R.bagAdd(o.c, it);
          o.ev.push(['loot', it.k, it.r || 0, why ? '' : name], ['log', why ? `Túi đầy, mất ${name}.` : `Nhận ${name}.`, why ? 'bad' : 'gold']);
        }
      }
      for (const it of R.bossLoot(o.c.cls)) {
        const name = ITEMS[it.k].ten + (it.r ? ' (' + R.RARITY[it.r].ten + ')' : '');
        const why = R.bagAdd(o.c, it);
        o.ev.push(['loot', it.k, it.r || 0, why ? '' : name]);
        o.ev.push(['log', why ? `Túi đầy, mất ${name}.` : `Nhận ${name}.`, why ? 'bad' : 'gold']);
      }
      o.dirty = true; this.sendInv(o);
    }
  }

  // yeu cau gay sat thuong / hieu ung len quai. s = -1 danh thuong, -2 bo xuong trieu hoi, 0..2 ky nang
  hitReq(p, c, mid, s, now) {
    const m = this.mobById.get(mid);
    if (!m || m.z !== p.z || !this.visible(m) || p.dead) return;
    const d = dist(p, m);
    if (s === -1) {
      if (d > c.tam * PX + 4 * PX + (m.t.reach || 0) * PX) return;
      const per = c.n || 1, aspd = this.stats(p).aspd * (1 + this.fxv(p, 'aspd', now));
      p.tok = Math.min(per * 2.5, p.tok + (now - p.tokAt) / 1000 * aspd * per * 1.25); p.tokAt = now;
      if (p.tok < 1) return;
      p.tok -= 1;
      if (c.ban && now - (p.oaAt || 0) > 150) { p.oaAt = now; this.nearBut(p, ['oa', p.n, mid]); }   // dan / phep danh thuong cho nguoi khac thay
      this.hitMob(p, m, c.mult || 1, { el: R.hitEl(p.c, -1) });
      return;
    }
    if (s === -2) {
      if (now > p.summonUntil || now < p.sumNext || d > 24 * PX) return;
      p.sumNext = now + 1300;
      this.hitMob(p, m, .3, { noCrit: true, color: '#E8E0D0' });
      return;
    }
    const cs = p.cast[s], sk = cs && cs.sk;
    if (!sk || now - cs.at > 3000) return;
    const multi = ['grenade', 'pierce', 'fear', 'blind', 'taunt', 'nova'].includes(sk.kind);
    const got = cs.hits.get(mid) || 0;
    if (got >= (sk.n || 1)) return;
    if (!got && cs.mobs >= (multi ? 15 : 1)) return;
    const reach = (sk.kind === 'grenade' ? sk.r + sk.aoe : ['fear', 'blind', 'taunt', 'nova'].includes(sk.kind) ? sk.r : (sk.r || c.tam + 1)) + (m.t.reach || 0);
    if (d > reach * PX + 4 * PX) return;
    cs.hits.set(mid, got + 1); if (!got) cs.mobs++;
    const cc = (label, col, apply) => {
      if (!R.mobHurt(m)) return;
      if (m.t.noCC) { this.near(m.z, m, ['fx', m.id, 'Kháng', '#ddd']); return; }
      if (m.t.co === 'mai') { m.flipT = 4; m.wind = null; this.near(m.z, m, ['fx', m.id, 'Lật ngửa!', '#FFD45A']); this.aggro(m, p); return; }   // Cua An Si: trung khong che thi lat ngua
      apply(); this.near(m.z, m, ['fx', m.id, label, col]);
    };
    switch (sk.kind) {
      case 'dash': case 'shot': case 'strike': case 'grenade': case 'pierce': case 'dice': case 'nova': {
        const el = sk.el || 'vatly', dotEl = sk.dotEl || el;
        const dmg = this.hitMob(p, m, sk.kind === 'dice' ? (sk.mult || .4) * cs.n : sk.mult, { el });
        if (dmg && m.alive && sk.slow && !m.t.noCC) { m.slowT = sk.slow[1]; m.slowV = sk.slow[0]; this.near(m.z, m, ['fx', m.id, 'Chậm', '#9FE3FF']); }
        if (dmg && m.alive && sk.dot) this.addDot(p, m, sk.dot[0], sk.dot[1], sk.poison ? '#9BE36A' : '#FF6B6B', dotEl);
        if (dmg && m.alive && sk.stun) cc('Choáng', '#FFD45A', () => { m.rootT = Math.max(m.rootT, sk.stun); m.wind = null; m.atkCd = Math.max(m.atkCd, sk.stun); });
        if (dmg && m.alive && sk.blind) cc('Mù', '#ddd', () => { m.blindT = sk.blind; m.wind = null; });
        return;
      }
      case 'curse': if (R.mobHurt(m)) { this.addDot(p, m, sk.dot[0], sk.dot[1], '#C9A2FF', sk.dotEl || sk.el || 'vatly'); this.aggro(m, p); } return;
      case 'fear': if (!sk.only || sk.only.includes(m.t.bac)) cc('Sợ', '#FFB45A', () => { m.fearT = sk.t; m.wind = null; }); return;
      case 'root': cc('Trói', '#9EE493', () => { m.rootT = sk.t; this.aggro(m, p); }); return;
      case 'blind': cc('Mù', '#ddd', () => { m.blindT = sk.t; m.wind = null; }); return;
      case 'taunt': if (R.mobHurt(m)) { this.aggro(m, p, true); m.tauntN = p.n; m.tauntUntil = now + sk.t * 1000; } return;
    }
  }

  // ---------------- quai ----------------
  isNight() { return this.clock % R.DAY >= R.NIGHT_FROM; }
  visible(m) { return m.alive && (!m.t.dem || this.isNight()); }
  near(z, at, ev, r = NEAR) { for (const o of this.players.values()) if (o.z === z && dist(o, at) <= r) o.ev.push(ev); }
  nearBut(p, ev, r = NEAR) { for (const o of this.players.values()) if (o !== p && o.z === p.z && dist(o, p) <= r) o.ev.push(ev); }
  target(m) {
    const p = m.tgt != null ? this.players.get(m.tgt) : null;
    return p && p.z === m.z && !p.dead && !(p.stealth > Date.now()) ? p : null;
  }
  nearestPlayer(m, r) {
    let best = null, bd = r;
    const now = Date.now();
    for (const p of this.players.values()) if (p.z === m.z && !p.dead && !(p.stealth > now)) { const d = dist(p, m); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  aggro(m, p, force) {
    if (m.evade) return;
    if (!force && (m.state === 'chase' || m.state === 'flee')) { if (m.tgt == null) m.tgt = p.n; return; }
    m.state = 'chase'; m.engaged = 0; m.tgt = p.n; m.best = 1e9; m.noReach = 0;
    if (m.t.co === 'bay') for (const o of m.z.mobs) if (o !== m && o.kind === m.kind && o.alive && dist(o, m) < 10 * PX && o.state !== 'chase' && !o.evade) { o.state = 'chase'; o.engaged = 0; o.tgt = p.n; o.best = 1e9; o.noReach = 0; }
  }
  // thu han (de xuat 09/10/2026): moi giay quai xet lai muc tieu. Thu han = sat thuong da gay cho quai.
  // Nguoi khac vuot 10% thu han cua muc tieu hien tai thi quai doi sang; Khieu Khich giu muc tieu trong thoi gian hieu luc.
  threat(m, now) {
    if (now < (m.threatAt || 0)) return;
    m.threatAt = now + 1000;
    const ok = o => o && o.z === m.z && !o.dead && !(o.stealth > now) && dist(o, m) <= 30 * PX;
    if (m.tauntN && now < m.tauntUntil && ok(this.players.get(m.tauntN))) { m.tgt = m.tauntN; return; }
    const cur = this.players.get(m.tgt), curT = ok(cur) ? (m.dmg[m.tgt] || 0) : -1;
    let best = null, bestT = -1;
    for (const [n, v] of Object.entries(m.dmg)) { const o = this.players.get(+n); if (ok(o) && v > bestT) { bestT = v; best = o; } }
    if (best && best.n !== m.tgt && (curT < 0 || bestT > curT * 1.1)) { m.tgt = best.n; m.best = 1e9; m.noReach = 0; }
  }
  mobEnv(z) {
    return {
      G: z.geo, PX,
      target: m => this.target(m),
      nearest: (m, r) => this.nearestPlayer(m, r),
      hurtBy: (m, p) => !!m.dmg[p.n],
      retarget: (m, p) => { m.tgt = p.n; },
      aggro: (m, p) => this.aggro(m, p),
      strike: (m, P, w) => this.strike(m, w),
      split: m => this.splitSlime(m),
      respawn: m => this.respawn(m),
      visible: m => this.visible(m),
      tickDots: (m, dt) => this.tickDots(m, dt),
      evaded: m => { m.dmg = {}; this.near(m.z, m, ['fx', m.id, 'Về chỗ', '#cfe8ff']); },
      home: m => { m.dmg = {}; },
    };
  }

  hitMob(p, m, mult, opts) {
    const now = Date.now();
    if (p.stealth > now) { p.stealth = 0; p.ev.push(['fx', 0, 'Hiện hình', '#cfc8ff']); }   // ra don thi hien hinh
    p.fightAt = now;
    if (!R.mobHurt(m)) { if (!m.immAt || now - m.immAt > 600) { m.immAt = now; this.near(m.z, m, ['fx', m.id, 'Miễn nhiễm', '#cfe8ff']); } return 0; }
    const diff = Math.max(0, m.lv - p.c.lv);
    if (Math.random() < .02 * Math.min(15, diff)) { this.near(m.z, m, ['d', m.id, -1, 0, p.n]); return 0; }
    const s = this.stats(p), race = RACES[p.c.race] || {}, el = opts.el || 'vatly', ek = R.elMul(m, el);
    if (!ek) { if (!m.immAt || now - m.immAt > 600) { m.immAt = now; this.near(m.z, m, ['fx', m.id, 'Miễn ' + R.EL[el], '#ddd']); } if (m.state === 'idle') this.aggro(m, p); return 0; }
    const crit = !opts.noCrit && (p.nextCrit || Math.random() < Math.min(R.CAP.crit, s.crit + this.fxv(p, 'crit', now)));
    if (!opts.noCrit) p.nextCrit = false;
    const atk = s.atk * (1 + this.fxv(p, 'atk', now)) * (1 + (race.nightDmg && this.isNight() ? race.nightDmg : 0));
    const shell = R.shellMul(m, p);
    const dmg = R.dmgToMob(s, atk, m, p.c.lv, mult * shell, el, crit);
    m.hp -= dmg; m.hurt = .12; m.dmg[p.n] = (m.dmg[p.n] || 0) + dmg; this.meter(m.z, p, dmg);
    this.near(m.z, m, ['d', m.id, dmg, crit ? 1 : 0, p.n, opts.color || (shell < 1 ? '#B9B2A4' : shell > 1 ? '#FFB45A' : ek > 1 ? R.EL_COL[el] : '')]);
    if (ek > 1 && (!m.weakAt || now - m.weakAt > 4000)) { m.weakAt = now; this.near(m.z, m, ['fx', m.id, 'Yếu ' + R.EL[el] + '!', R.EL_COL[el]]); }
    if (shell < 1 && (!m.shellAt || now - m.shellAt > 2500)) { m.shellAt = now; p.ev.push(['fx', m.id, 'Mai Giáp: đánh từ sau lưng!', '#B9B2A4']); }
    if (m.state === 'idle' || m.state === 'return') this.aggro(m, p);
    if (m.hp <= 0) this.killMob(m);
    else if (m.t.co === 'chay' && m.hp < m.max * .3 && !m.fledOnce) { m.fledOnce = true; m.state = 'flee'; m.flee = 4; this.near(m.z, m, ['log', m.t.ten + ' bỏ chạy!', '']); }
    return dmg;
  }
  // bang sat thuong trong Dungeon: cong theo ten (vao lai van giu), gui cho moi nguoi trong phong toi da 1 lan/giay
  meter(z, p, dmg) {
    if (!z.d || z.d.done || !(dmg > 0)) return;
    z.d.meter[p.c.name] = (z.d.meter[p.c.name] || 0) + dmg; z.d.meterV++;
  }
  meterList(d) { return Object.entries(d.meter).map(([n, v]) => [n, Math.round(v)]).sort((a, b) => b[1] - a[1]); }
  addDot(p, m, pct, secs, col, el = 'vatly') {
    const now = Date.now(), s = this.stats(p);
    const dmg = R.dmgToMob(s, s.atk * (1 + this.fxv(p, 'atk', now)), m, p.c.lv, pct, el, false);
    if (!dmg) { this.near(m.z, m, ['fx', m.id, 'Miễn ' + R.EL[el], '#ddd']); return; }
    m.dots.push({ dmg, left: secs, tick: 1, col, by: p.n });
  }
  tickDots(m, dt) {
    for (let i = m.dots.length - 1; i >= 0; i--) {
      const d = m.dots[i];
      d.tick -= dt;
      if (d.tick > 0) continue;
      d.tick += 1; d.left--;
      m.hp -= d.dmg; m.dmg[d.by] = (m.dmg[d.by] || 0) + d.dmg;
      this.near(m.z, m, ['d', m.id, d.dmg, 0, d.by, d.col]);
      const p = this.players.get(d.by);
      if (p) this.meter(m.z, p, d.dmg);
      if (p && p.z === m.z && (m.state === 'idle' || m.state === 'return')) this.aggro(m, p);
      if (d.left <= 0) m.dots.splice(i, 1);
      if (m.hp <= 0) { this.killMob(m); return; }
    }
  }
  killMob(m) {
    const z = m.z;
    m.alive = false; m.dying = .4; m.respawn = m.origin ? rnd(20, 32) : 0; m.wind = null; m.dash = null; m.dots.length = 0;
    this.near(z, m, ['k', m.id]);
    // GDD: EXP chia theo dong gop (phan sat thuong). To doi (de xuat 07/10/2026): 70% phan cua thanh vien theo dong gop,
    // 30% chia deu cho moi thanh vien con song trong vong 40 m, ke ca nguoi khong gay sat thuong (healer, nguoi giu quai)
    const total = Object.values(m.dmg).reduce((a, b) => a + b, 0) || 1;
    const share = new Map(), pools = new Map();
    let top = null, topV = 0;
    for (const [n, v] of Object.entries(m.dmg)) {
      const p = this.players.get(+n);
      if (!p || p.z !== z) continue;
      if (v > topV) { topV = v; top = p; }
      const s = v / total;
      if (p.party) { share.set(p, (share.get(p) || 0) + s * .7); pools.set(p.party, (pools.get(p.party) || 0) + s * .3); }
      else share.set(p, (share.get(p) || 0) + s);
    }
    for (const [pt, s] of pools) {
      const near = [...pt.members].filter(o => o.z === z && !o.dead && dist(o, m) <= NEAR);
      for (const o of near) share.set(o, (share.get(o) || 0) + s / near.length);
    }
    const bank = z.d && !z.d.done ? z.d.bank : null;       // trong Dungeon: thuong giu lai, ha Boss moi tra; het gio thi mat
    for (const n of Object.keys(m.dmg)) { const p = this.players.get(+n); if (p && p.z === z) this.ach(p, R.achKill(p.c, m.kind)); }
    for (const [p, s] of share) {
      const again = z.d && R.cleared(p.c, z.d.key) ? R.REPEAT_EXP : 1;     // Dungeon da clear: quai con 50% EXP
      const ex = Math.max(1, Math.round(R.killExp(m.exp, m.lv, p.c.lv) * s * this.rate * again));
      const tien = Math.round(m.tien * s);
      if (bank) { const b = this.bankOf(bank, p); b.exp += ex; b.tien += tien; continue; }
      p.c.tien += tien;
      p.ev.push(['xp', ex, tien]);
      this.gainExp(p, ex);
    }
    // do roi cho nguoi gay nhieu sat thuong nhat
    if (top) {
      const luck = Math.random() < this.stats(top).may ? R.dropFor(m, top.c.cls, (f => () => (f ? Math.random() : (f = 1, 0)))(0)) : null;     // Bong Tai Co Bon La: them 1 lan rot do
      for (const it of [R.dropFor(m, top.c.cls), R.potionDrop(m, top.c.cls), luck]) {
      if (!it) continue;
      if (bank) this.bankOf(bank, top).items.push(it);
      else {
        const name = ITEMS[it.k].ten + (it.r ? ' (' + R.RARITY[it.r].ten + ')' : '');
        const why = R.bagAdd(top.c, it);
        top.ev.push(['loot', it.k, it.r || 0, why ? '' : name], ['log', why ? `Túi đầy, bỏ lại ${name}.` : `Nhặt được ${name}!`, why ? 'bad' : 'gold']);
        if (!why) { top.dirty = true; this.sendInv(top); }
      }
      }
    }
    m.dmg = {};
    if (z.d) { if (m === z.d.boss) this.dungeonDone(z); else this.checkGates(z); }
  }
  gainExp(p, ex) {
    const c = p.c;
    if (c.lv >= R.MAX_LV) { p.ev.push(['me', this.me(p)]); return; }
    c.exp += ex;
    let up = false;
    while (c.lv < R.MAX_LV && c.exp >= R.expNeed(c.lv)) { c.exp -= R.expNeed(c.lv); c.lv++; up = true; }
    p.dirty = true;
    p.ev.push(['me', this.me(p)]);
    if (up) {
      p.S = null;
      p.hp = this.stats(p).hp;
      p.ev.push(['lv', c.lv]);
      this.ach(p, R.achCheck(c));
      for (const o of this.players.values()) if (o !== p) o.ev.push(['plv', p.n, c.lv]);
      if (p.party) this.partySync(p.party);
      this.save(p);
    }
  }
  me(p) { return { lv: p.c.lv, exp: p.c.exp, tien: p.c.tien }; }

  respawn(m) {
    const fresh = R.makeMob(m.kind, m.home.x, m.home.y, PX);
    const { id, z } = m;
    Object.assign(m, fresh, { origin: true, id, z, tgt: null, dmg: {} });
  }
  splitSlime(m) {
    m.split = true;
    const half = Math.max(1, Math.round(m.hp / 2));
    const kid = this.addMob(m.z, R.makeMob(m.kind, m.x + 6, m.y + 2, PX, { lv: m.lv, child: true }));
    kid.max = m.max; kid.hp = half; kid.state = 'chase'; kid.home = m.home; kid.tgt = m.tgt; kid.f = m.f; m.hp = half;
    this.near(m.z, m, ['log', m.t.ten + ' tách đôi!', '']);
  }
  // het gong: bao cho nguoi choi gan do; may khach tu xet minh co dung trong vet khong (ne, do don, khien)
  strike(m, w) {
    const shape = w.kind === 'line' ? [1, r1(w.x), r1(w.y), r2(w.ux), r2(w.uy), r1(w.len), r1(w.w)] : [0, r1(w.x), r1(w.y), r1(w.r)];
    const enr = m.z.d && m.z.d.enraged && m === m.z.d.boss ? 3 : 1;
    this.near(m.z, w, ['st', m.id, shape, w.mult * enr, r2(m.atk), m.lv, m.blindT > 0 ? 1 : 0, m.t.dmg === 'phep' ? 1 : 0], 16 * PX);
    if (w.ten) this.near(m.z, m, ['fx', m.id, w.ten + '!', '#FF9A4A']);
  }

  // ---------------- vong lap 10 lan/giay ----------------
  tick() {
    const dt = TICK_MS / 1000, now = Date.now();
    this.clock += dt;
    for (const z of this.zones.values()) {
      const zp = z === this.town ? null : this.zonePlayers(z);
      if (zp && !zp.length) {                                       // phong Dungeon trong: dung lai, qua 5 phut thi dong
        z.empty += TICK_MS;
        if (z.empty > DUNGEON_IDLE) this.closeZone(z);
        continue;
      }
      z.empty = 0;
      for (const m of z.mobs) {
        if (m.alive && m.state === 'chase' && !m.evade) this.threat(m, now);
        if (m.tgt) { const t = this.players.get(m.tgt); if (t) m.tgtPos = { x: t.x, y: t.y }; }
        R.updateMob(m, dt, z.E);
      }
      for (let i = z.mobs.length - 1; i >= 0; i--) {
        const m = z.mobs[i];
        if (!m.origin && !m.alive && m.dying <= 0) { z.mobs.splice(i, 1); this.mobById.delete(m.id); }
      }
      if (z.d) { this.lampTick(z, dt, now); this.dungeonTimer(z, now); }
    }
    this.readyTick(now);
    this.tradeTick(now);
    // mon do theo thoi gian danh quai: 5% moi gio (0,1% moi 72 giay giao tranh)
    for (const p of this.players.values()) {
      if (now - p.fightAt < 5000) { p.fightAcc += dt; if (p.fightAcc >= 72) { p.fightAcc -= 72; R.wear(p.c, .1); p.S = null; p.dirty = true; this.sendInv(p); } }
      if (p.inv && p.inv.until < now) p.inv = null;
      if (p.tinv && p.tinv.until < now) p.tinv = null;
    }
    const T = now - this.t0;
    const plist = [...this.players.values()].map(p => [p.n, r1(p.x), r1(p.y), p.face, p.flip, p.flags | (p.dead ? 64 : 0) | (p.stealth > now ? 128 : 0) | (p.sleep > now ? 256 : 0),
      Math.round(p.hp / this.stats(p).hp * 100), p.c.lv, p.z.zi, p.mt]);
    for (const p of this.players.values()) {
      // chi gui quai co thay doi so voi lan truoc (moi nguoi mot bang nho rieng); quai ra khoi tam nhin thi bao xoa
      const ms = [], gone = [], keep = new Set();
      for (const m of p.z.mobs) {
        if (Math.abs(m.x - p.x) > VIEW || Math.abs(m.y - p.y) > VIEW) continue;
        if (!m.alive && !(m.dying > 0)) continue;
        keep.add(m.id);
        const fl = (m.alive ? 1 : 0) | (m.slowT > 0 ? 2 : 0) | (m.rootT > 0 ? 4 : 0) | (m.hurt > 0 ? 8 : 0) | (m.fearT > 0 ? 16 : 0) |
          (m.blindT > 0 ? 32 : 0) | (m.lunge > 0 ? 64 : 0) | (m.state === 'chase' ? 128 : 0) | (m.scale < 1 ? 256 : 0) | (this.visible(m) ? 0 : 512) |
          (m.evade ? 1024 : 0) | (m.flipT > 0 ? 2048 : 0);
        let w = 0;
        if (m.wind) w = m.wind.kind === 'line' ? [1, r2(m.wind.t), m.wind.total, r0(m.wind.x), r0(m.wind.y), r2(m.wind.ux), r2(m.wind.uy), r0(m.wind.len), r0(m.wind.w)]
          : [0, r2(m.wind.t), m.wind.total, r0(m.wind.x), r0(m.wind.y), r0(m.wind.r)];
        const row = [m.id, KINDS.indexOf(m.kind), r0(m.x), r0(m.y), Math.max(0, Math.ceil(m.hp)), m.max, m.lv, m.face, fl, w, m.tgt || 0];
        const key = row.join(',') + (w ? '|' + w.join(',') : '');
        if (p.seen.get(m.id) !== key) { p.seen.set(m.id, key); ms.push(row); }
      }
      for (const id of p.seen.keys()) if (!keep.has(id)) { gone.push(id); p.seen.delete(id); }
      const msg = { t: 's', c: r1(this.clock), T, p: plist, m: ms };
      if (gone.length) msg.g = gone;
      if (p.z.d) {
        const d = p.z.d;
        msg.zz = Math.round(p.zz);
        msg.tl = d.done ? -1 : Math.max(0, Math.ceil((R.DUNGEONS[d.key].limit * 1000 - (now - d.at)) / 1000));
        if (d.done && d.exitAt) msg.ox = Math.max(0, Math.ceil((d.exitAt - now) / 1000));
        if (d.lampOn) msg.L = [Math.round(d.lampA), R.DUNGEONS[d.key].lamp.r, R.DUNGEONS[d.key].lamp.arc];
        if (p.dmV !== d.meterV && now - (p.dmAt || 0) >= 1000) { p.dmV = d.meterV; p.dmAt = now; msg.dm = this.meterList(d); }
      }
      if (p.ev.length) { msg.e = p.ev; p.ev = []; }
      this.send(p, msg);
    }
    if (now - this.lastSave > SAVE_MS) {
      this.lastSave = now;
      for (const p of this.players.values()) this.save(p);           // luu vi tri, tien, EXP, tui do moi 15 giay
    }
  }
  closeZone(z) {
    for (const m of z.mobs) this.mobById.delete(m.id);
    this.zones.delete(z.zi);
    for (const pt of this.parties.values()) if (pt.dz === z.zi) pt.dz = null;
    for (const [k, v] of this.solo) if (v === z.zi) this.solo.delete(k);
  }
}
