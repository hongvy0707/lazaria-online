/* LazyEyes – so lieu va luat dung chung cho ban choi thu (trinh duyet) va may chu (Cloudflare Worker).
   Sua so lieu o day thi ca hai ben cung doi. Nguon: Bang Chi So Nen, Bang Can Bang, Vat Pham & Che Tao, tai lieu Nhanh, Ky Nang, GDD. */
(function (root) {
'use strict';

const CRIT = .05, CRIT_X = 1.5;                       // Bang Can Bang: chi mang nen 5%, sat thuong chi mang nen 150%
// Bang Chi So Nen: duong chi so quai (Lv <= 20) va bac quai
const BAC = {
  'Yếu': { hp: .5, atk: .6, def: .6, exp: .5, tien: .5 },
  'Bầy': { hp: .6, atk: .7, def: .8, exp: .6, tien: .6 },
  'Thường': { hp: 1, atk: 1, def: 1, exp: 1, tien: 1 },
  'Quái Dungeon': { hp: 1.5, atk: 1.3, def: 1.2, exp: 4, tien: 1 },
  'Tinh Anh Dungeon': { hp: 12, atk: 2.2, def: 1.5, exp: 20, tien: 5 },
  'Boss Dungeon': { hp: 60, atk: 4, def: 1.8, exp: 150, tien: 20 },
};
// co: cach danh rieng (tach = Slime tach doi, huc = Tho Sung, chay = bo chay khi yeu, bay = keo ca bay, mai = mai giap phia truoc, den = den quet)
// yeu / khang / mien: he sat thuong ma quai yeu (x1,5), khang (x0,5), mien (0), theo cot Yeu · Khang cua Bang Chi So Nen. don: he don danh cua quai
// fix: chi so ghi san trong bang Dungeon cua Bang Chi So Nen (Mau, Cong, Giap, Khang). dmg 'phep': giam bang Khang phep thay vi Giap.
const LOAI = {
  slime: { ten: 'Slime Sương', lv: [1, 4], bac: 'Yếu', co: 'tach', yeu: ['lua'] },
  rabbit: { ten: 'Thỏ Sừng', lv: [2, 5], bac: 'Yếu', co: 'huc' },
  crab: { ten: 'Cua Đá', lv: [2, 6], bac: 'Yếu', yeu: ['set'] },
  rat: { ten: 'Chuột Kho Thóc', lv: [3, 8], bac: 'Yếu' },
  goblin: { ten: 'Goblin Cướp Bến', lv: [12, 18], bac: 'Thường', co: 'chay' },
  wolf: { ten: 'Sói Sương', lv: [12, 18], bac: 'Bầy', toc: 6, co: 'bay', yeu: ['lua'] },
  wisp: { ten: 'Ma Trơi', lv: [16, 20], bac: 'Thường', dem: true, dmg: 'phep', don: 'toi', yeu: ['thanh'], mien: ['doc'] },
  // Hang Hai Dang Co (Dungeon Thuong Lv10, 3 tang)
  bat: { ten: 'Dơi Sương', lv: [10, 10], bac: 'Quái Dungeon', toc: 6, co: 'bay', drain: .1, yeu: ['set'], fix: { hp: 855, atk: 33, def: 43, mdef: 34 }, leash: 18 },
  saltslime: { ten: 'Slime Muối', lv: [10, 10], bac: 'Quái Dungeon', co: 'tach', yeu: ['lua'], fix: { hp: 1420, atk: 33, def: 54, mdef: 42 }, leash: 18 },
  hermit: { ten: 'Cua Ẩn Sĩ Khổng Lồ', lv: [11, 11], bac: 'Tinh Anh Dungeon', co: 'mai', yeu: ['set'], toc: 3.5, reach: 2.4, leash: 16,
    fix: { hp: 12400, atk: 76, def: 110, mdef: 57 },
    moves: [{ kind: 'circle', r: 2.2, off: 1.4, wind: .8, mult: 1 }, { kind: 'circle', r: 2.2, off: 1.4, wind: .8, mult: 1 }, { kind: 'circle', r: 4, off: 0, wind: 1.1, mult: 1.4, ten: 'Đập Mai' }] },
  keeper: { ten: 'Người Gác Đèn Ngủ Mê', lv: [12, 12], bac: 'Boss Dungeon', co: 'den', dmg: 'phep', don: 'toi', yeu: ['thanh'], toc: 3.5, reach: 2.6, leash: 20, aggro: 10, noCC: true,
    fix: { hp: 67200, atk: 147, def: 95, mdef: 74 },
    moves: [{ kind: 'circle', r: 2.6, off: 1.4, wind: .9, mult: 1 }, { kind: 'circle', r: 2.6, off: 1.4, wind: .9, mult: 1 }, { kind: 'line', len: 8, w: 2.4, wind: 1.1, mult: 1.5, ten: 'Đèn Quật' }] },
};
const mobBase = L => ({ hp: 85 * L + 100, atk: 2.4 * L + 8, def: 4 * L + 5, mdef: 3 * L + 5, exp: 10 * L, tien: L < 20 ? 15 : 50 });
// Bang Chi So Nen, phan Class goc (Lv1-19): moi class dung mot khuon vai tro (Mau, Cong, Giap nen; Khang nen trong khoang 4-22)
const KHUON = {
  can: { hp: 140, hpL: 24, atk: 20, atkL: 58 / 18, def: 18, mres: 8 },      // Can chien: 140 -> 572 mau, 20 -> 78 cong
  xa: { hp: 110, hpL: 18, atk: 20, atkL: 58 / 18, def: 10, mres: 6 },       // Tam xa / sat thu
  phep: { hp: 100, hpL: 15, atk: 22, atkL: 61 / 18, def: 6, mres: 12 },     // Phep: cong la MATK
  he: { hp: 105, hpL: 16, atk: 18, atkL: 50 / 18, def: 8, mres: 8 },       // Chu He
  nd: { hp: 120, hpL: 12, atk: 12, atkL: 29 / 18, def: 10, mres: 6 },      // Nong Dan
};
// bo giap Thuong theo loai, tong 5 mon o cap L: Mau, Giap, Khang moi cap; Ne, Mana co dinh (Bang Chi So Nen, Trang bi chuan theo cap)
const GIAP = {
  nang: { hp: 12, def: 10, mres: 3, ne: 0, mana: 0 },
  trung: { hp: 8, def: 5, mres: 3.5, ne: 0, mana: 0 },
  nhe: { hp: 5, def: 2.5, mres: 3, ne: .05, mana: 0 },
  vai: { hp: 4, def: 1.2, mres: 5, ne: 0, mana: .1 },
};
// el: he sat thuong cua don danh thuong / ky nang (de xuat 08/10/2026 theo ten ky nang; khong ghi = Vat ly). 'phep' = phep khong nguyen to.
// Moi don khong phai Vat ly bi giam bang Khang phep cua quai thay vi Giap (Bang Chi So Nen: Khang phep giam sat thuong phep va nguyen to).
// 11 class: toc danh, tam (m), thanh tai nguyen, kieu ne, 3 ky nang goc (tai lieu 03, muc Ky nang goc: so lieu).
// cost = The Luc; C = he so Mana (Mana thuc te = C x (1 + 0,04 x cap)).
const CLASSES = {
  cb: { ten: 'Chiến Binh', phe: 'Phe 1', khuon: 'can', giap: 'trung', aspd: 1.0, tam: 2.5, tl: 'st', chem: 'Chém Ngang',
    dodge: { ten: 'Lộn Né', m: 3, mo: 'lộn 3 m' },
    skills: [
      { ten: 'Xung Phong', lv: 1, cd: 8, cost: 15, kind: 'dash', mult: 1.2, r: 6, mo: 'Lao tới quái trong 6 m, 120% ATK' },
      { ten: 'Đỡ Đòn', lv: 5, cd: 10, cost: 20, kind: 'block', t: 1, mo: 'Giảm 50% sát thương nhận trong 1 giây' },
      { ten: 'Gầm Chiến', lv: 10, cd: 20, cost: 25, kind: 'buff', stat: 'atk', v: .1, t: 8, mo: '+10% ATK trong 8 giây' }] },
  ps: { ten: 'Pháp Sư', phe: 'Phe 1', khuon: 'phep', giap: 'vai', aspd: .8, tam: 12, tl: 'mana', chem: 'Cầu Lửa', ban: 'fire', el: 'lua',
    dodge: { ten: 'Dịch Chuyển Ngắn', m: 6, tele: true, mo: 'dịch chuyển tức thì 6 m' },
    skills: [
      { ten: 'Băng Tiễn', lv: 1, cd: 5, C: 7, kind: 'shot', el: 'bang', look: 'ice', mult: 1.3, r: 12, slow: [.2, 2], mo: '130% MATK, tầm 12 m, chậm 20% trong 2 giây' },
      { ten: 'Khiên Mana', lv: 5, cd: 15, C: 14, kind: 'shield', v: .1, t: 6, mo: 'Hấp thụ sát thương bằng 10% máu tối đa, tối đa 6 giây' },
      { ten: 'Thiền Định', lv: 10, cd: 30, C: 0, kind: 'channel', t: 3, v: .2, mo: 'Đứng yên vận 3 giây, hồi 20% Mana; bị đánh trúng hoặc di chuyển thì ngắt' }] },
  xt: { ten: 'Xạ Thủ Hỏa Khí', phe: 'Phe 1', khuon: 'xa', giap: 'nhe', aspd: .9, tam: 15, tl: 'st', chem: 'Bắn Súng Ngắn', ban: 'bullet',
    dodge: { ten: 'Nhảy Lùi', m: 4, back: true, mo: 'nhảy lùi 4 m về sau lưng' },
    skills: [
      { ten: 'Lựu Đạn', lv: 1, cd: 8, cost: 15, kind: 'grenade', el: 'lua', mult: 1.5, r: 10, aoe: 3, delay: .5, mo: 'Ném xa đến 10 m, nổ sau 0,5 giây, 150% ATK trong vòng 3 m' },
      { ten: 'Phát Bắn Xuyên', lv: 5, cd: 10, cost: 20, kind: 'pierce', mult: 1.8, r: 15, mo: '180% ATK, xuyên mọi quái trên đường thẳng 15 m' },
      { ten: 'Nạp Đạn Nhanh', lv: 10, cd: 20, cost: 25, kind: 'buff', stat: 'aspd', v: .2, t: 5, mo: '+20% tốc bắn trong 5 giây' }] },
  ds: { ten: 'Đấu Sĩ Dã Tính', phe: 'Phe 2', khuon: 'can', giap: 'trung', aspd: 1.2, tam: 1.5, tl: 'st', chem: 'Quyền Liên Hoàn',
    dodge: { ten: 'Vồ Tới', m: 4, toTarget: true, mo: 'vồ tới 4 m, có mục tiêu thì vồ về phía mục tiêu' },
    skills: [
      { ten: 'Móng Vuốt Xé', lv: 1, cd: 6, cost: 12, kind: 'strike', mult: 1.3, dot: [.2, 4], mo: '130% ATK, chảy máu 20% ATK mỗi giây trong 4 giây' },
      { ten: 'Gầm Dã Thú', lv: 5, cd: 15, cost: 25, kind: 'fear', r: 4, t: 1, only: ['Yếu', 'Bầy'], mo: 'Quái hạng Yếu và Bầy trong 4 m sợ hãi 1 giây' },
      { ten: 'Da Thú', lv: 10, cd: 18, cost: 25, kind: 'buff', stat: 'def', v: .15, t: 6, mo: '+15% giáp trong 6 giây' }] },
  ct: { ten: 'Cung Thủ Tinh Linh', phe: 'Phe 2', khuon: 'xa', giap: 'nhe', aspd: 1.0, tam: 16, tl: 'st', chem: 'Bắn Tên', ban: 'arrow',
    dodge: { ten: 'Nhảy Gió', m: 4, mo: 'lướt 4 m' },
    skills: [
      { ten: 'Tên Đôi', lv: 1, cd: 5, cost: 12, kind: 'shot', look: 'arrow', n: 2, mult: .8, r: 16, mo: '2 phát, mỗi phát 80% ATK' },
      { ten: 'Tên Làm Chậm', lv: 5, cd: 8, cost: 15, kind: 'shot', el: 'bang', look: 'ice', mult: 1, r: 16, slow: [.3, 3], mo: '100% ATK, chậm 30% trong 3 giây' },
      { ten: 'Mắt Tinh Linh', lv: 10, cd: 20, cost: 25, kind: 'buff', stat: 'crit', v: .15, t: 6, mo: '+15% chí mạng trong 6 giây' }] },
  vs: { ten: 'Tự Nhiên Vu Sư', phe: 'Phe 2', khuon: 'phep', giap: 'vai', aspd: .8, tam: 12, tl: 'mana', chem: 'Gai Gỗ', ban: 'thorn', el: 'phep',
    dodge: { ten: 'Bước Lá', m: 4, mo: 'lướt 4 m' },
    skills: [
      { ten: 'Hồi Phục Nhỏ', lv: 1, cd: 8, C: 7, kind: 'heal', v: .1, mo: 'Hồi 10% máu tối đa' },
      { ten: 'Tia Nắng', lv: 5, cd: 4, C: 7, kind: 'shot', el: 'thanh', look: 'sun', mult: 1, r: 12, mo: '100% MATK, tầm 12 m' },
      { ten: 'Rễ Cây', lv: 10, cd: 12, C: 12, kind: 'root', r: 12, t: 1, mo: 'Trói 1 quái 1 giây (đứng yên nhưng vẫn đánh được)' }] },
  ks: { ten: 'Kỵ Sĩ Tử Vong', phe: 'Phe 3', khuon: 'can', giap: 'trung', aspd: 1.0, tam: 2.5, tl: 'st', chem: 'Chém Xương',
    dodge: { ten: 'Bước Bóng', m: 4, mo: 'lướt 4 m' },
    skills: [
      { ten: 'Ấn Tử Vong', lv: 1, cd: 8, cost: 15, kind: 'curse', el: 'toi', dotEl: 'toi', r: 6, dot: [.3, 5], mo: '30% ATK mỗi giây trong 5 giây, tầm 6 m' },
      { ten: 'Giáp Âm Hồn', lv: 5, cd: 18, cost: 25, kind: 'buff', stat: 'def', v: .15, t: 6, mo: '+15% giáp trong 6 giây' },
      { ten: 'Tiếng Gọi Mồ', lv: 10, cd: 15, cost: 25, kind: 'taunt', r: 6, t: 3, mo: 'Khiêu khích quái trong 6 m, 3 giây' }] },
  tk: { ten: 'Thích Khách Hư Vô', phe: 'Phe 3', khuon: 'xa', giap: 'nhe', aspd: 1.3, tam: 2, tl: 'st', ne: .1, chem: 'Dao Găm',
    dodge: { ten: 'Lộn Sau Lưng', m: 3, behind: 4, mo: 'lộn ra sau lưng mục tiêu trong 4 m; không có mục tiêu thì lộn 3 m' },
    skills: [
      { ten: 'Ném Phi Tiêu', lv: 1, cd: 4, cost: 12, kind: 'shot', look: 'dart', mult: 1.1, r: 12, mo: '110% ATK, tầm 12 m' },
      { ten: 'Đâm Độc', lv: 5, cd: 8, cost: 15, kind: 'strike', dotEl: 'doc', mult: .8, dot: [.2, 5], poison: true, mo: '80% ATK, độc 20% ATK mỗi giây trong 5 giây' },
      { ten: 'Tàng Hình Ngắn', lv: 10, cd: 18, cost: 25, kind: 'stealth', t: 2, mo: 'Tàng hình 2 giây, quái mất mục tiêu; ra đòn thì hiện hình' }] },
  hn: { ten: 'Hồn Ngục Pháp Sư', phe: 'Phe 3', khuon: 'phep', giap: 'vai', aspd: .8, tam: 12, tl: 'mana', chem: 'Cầu Linh Hồn', ban: 'soul', el: 'toi',
    dodge: { ten: 'Bước Âm', m: 5, tele: true, mo: 'dịch chuyển 5 m' },
    skills: [
      { ten: 'Hút Sinh Lực', lv: 1, cd: 6, C: 7, kind: 'shot', el: 'toi', look: 'drain', mult: 1, r: 12, drain: .3, mo: '100% MATK, hồi máu bằng 30% sát thương gây ra' },
      { ten: 'Triệu Xương Nhỏ', lv: 5, cd: 20, C: 12, kind: 'summon', t: 15, mo: '1 bộ xương trong 15 giây, mỗi 1,5 giây đánh 30% MATK' },
      { ten: 'Ấn Sợ Hãi', lv: 10, cd: 15, C: 14, kind: 'fear', r: 4, t: 1.5, mo: 'Quái trong 4 m bỏ chạy 1,5 giây' }] },
  ch: { ten: 'Chú Hề', phe: 'Chung', khuon: 'he', giap: 'nhe', aspd: 1.0, tam: 10, tl: 'mana', ne: .1, chem: 'Ném Bài', ban: 'card', el: 'phep', n: 3, mult: .6,
    dodge: { ten: 'Lộn Nhào', m: 5, cd: 6, mo: 'lướt 5 m, hồi 6 giây' },
    skills: [
      { ten: 'Xúc Xắc Nhỏ', lv: 1, cd: 6, C: 7, kind: 'dice', el: 'phep', r: 10, mo: 'Ra 1–6 chấm, 40% ATK mỗi chấm' },
      { ten: 'Bom Khói', lv: 5, cd: 12, C: 12, kind: 'blind', r: 3, t: 2, mo: 'Bom Khói Pháo Giấy: làm mù quái trong 3 m, 2 giây (đòn của quái trượt)' },
      { ten: 'Tung Hứng', lv: 10, cd: 15, C: 14, kind: 'buff', stat: 'ev', v: .2, t: 5, mo: '+20% né tránh trong 5 giây' }] },
  nd: { ten: 'Nông Dân', phe: 'Chung', khuon: 'nd', giap: 'nhe', aspd: .9, tam: 2, tl: 'st', chem: 'Tự Vệ',
    dodge: { ten: 'Né', m: 3, mo: 'lộn 3 m' }, skills: [] },
};
const CLS_ORDER = ['cb', 'ps', 'xt', 'ds', 'ct', 'vs', 'ks', 'tk', 'hn', 'ch', 'nd'];

// ---------------- nhanh ky nang Lv20 (tai lieu Nhanh, Ky Nang: 2 nhanh dau cua moi class, 3 ky nang so cap + noi tai) ----------------
// Ban thu (13/10/2026): ky nang quy ve cac kieu chieu da co (shot, strike, dash, nova...), noi tai la chi so cong them.
// Co che rieng cua nhanh (tang Song, Nhiet, Xac, Mat Na...) chua co; ghi o 'mo'. Nhanh an (Sach An Dungeon) hien dau ?.
// pas.st: atk, hp, def, mres = % chi so; crit, cd, ne = cong thang; aspd = % toc danh; el_<he> = % sat thuong he do.
const BRANCH_LV = 20;
const BRANCHES = {
  cb: [
    { k: 'thuy', ten: 'Thủy Kiếm Sư', col: '#5FB7FF', pas: { ten: 'Dòng Chảy', st: { aspd: .1, crit: .05 }, mo: '+10% tốc đánh, +5% chí mạng. Tài liệu: mỗi đòn trúng +1 tầng Sóng (tối đa 10); bản thử tính sẵn như 5 tầng.' },
      skills: [
        { ten: 'Lưu Thủy Liên Trảm', lv: 20, cd: 5, cost: 15, kind: 'strike', mult: 2.25, mo: '5 nhát liền, mỗi nhát 45% ATK (bản thử gộp thành một đòn 225%)' },
        { ten: 'Lướt Sóng', lv: 20, cd: 8, cost: 15, kind: 'dash', mult: .9, r: 6, mo: 'Lướt tới quái trong 6 m, 90% ATK' },
        { ten: 'Thủy Kính Phản Chiếu', lv: 20, cd: 12, cost: 20, kind: 'block', t: .8, mo: 'Tư thế 0,8 giây, giảm 50% sát thương nhận (phản đòn 200% chưa có)' }] },
    { k: 'bac', ten: 'Bắc Kiếm Sư', col: '#C8D4E8', pas: { ten: 'Trọng Kiếm', st: { atk: .08, cd: .15 }, mo: '+8% ATK, +15% sát thương chí mạng. Tài liệu: đòn lớn xuyên khiên, kháng đẩy lùi.' },
      skills: [
        { ten: 'Trảm Sơn Phá Thạch', lv: 20, cd: 8, cost: 20, kind: 'strike', mult: 2.8, mo: 'Bổ dọc 280% ATK' },
        { ten: 'Hoành Tảo Thiên Quân', lv: 20, cd: 10, cost: 25, kind: 'nova', mult: 2, r: 5, mo: 'Quét quanh mình 5 m, 200% ATK' },
        { ten: 'Tụ Lực', lv: 20, cd: 12, cost: 20, kind: 'buff', stat: 'atk', v: .25, t: 5, mo: '+25% ATK trong 5 giây (tài liệu: đòn kế tiếp +80%)' }] },
  ],
  ps: [
    { k: 'trieu_hoi', ten: 'Triệu Hồi Sư', col: '#9FD8C8', pas: { ten: 'Liên Kết Tinh Thể', st: { def: .1, hp: .05 }, mo: '+10% giáp, +5% máu. Tài liệu: 30% sát thương chủ nhận chuyển sang pet.' },
      skills: [
        { ten: 'Golem Đá Hơi Nước', lv: 20, cd: 20, C: 14, kind: 'summon', t: 30, mo: 'Gọi Golem 30 giây, mỗi 1,5 giây đánh 30% MATK (bản thử dùng hình bộ xương)' },
        { ten: 'Tinh Thể Xung Kích', lv: 20, cd: 10, C: 12, kind: 'curse', el: 'phep', dotEl: 'phep', r: 12, dot: [.5, 8], mo: 'Tia tinh thể 50% MATK mỗi giây trong 8 giây, tầm 12 m' },
        { ten: 'Mệnh Lệnh Tấn Công', lv: 20, cd: 12, C: 7, kind: 'buff', stat: 'atk', v: .2, t: 5, mo: '+20% sát thương trong 5 giây' }] },
    { k: 'hac_thuat', ten: 'Hắc Thuật Sư', col: '#B48CFF', pas: { ten: 'Khế Ước Máu', st: { el_toi: .15, hp: .05 }, mo: '+15% sát thương Bóng tối, +5% máu. Tài liệu: DoT hút 15% thành máu.' },
      skills: [
        { ten: 'Ấn Chú Hoại Tử', lv: 20, cd: 4, C: 7, kind: 'curse', el: 'toi', dotEl: 'toi', r: 12, dot: [.4, 8], mo: '40% MATK Bóng tối mỗi giây trong 8 giây' },
        { ten: 'Hút Hồn', lv: 20, cd: 8, C: 12, kind: 'shot', el: 'toi', look: 'drain', mult: 1.8, r: 12, drain: .5, mo: '180% MATK, hồi máu bằng 50% sát thương gây ra' },
        { ten: 'Lời Nguyền Chậm Chạp', lv: 20, cd: 12, C: 14, kind: 'nova', el: 'toi', mult: .5, r: 5, slow: [.3, 6], mo: 'Vùng 5 m quanh mình: 50% MATK, chậm 30% trong 6 giây' }] },
  ],
  xt: [
    { k: 'sung_truong', ten: 'Xạ Thủ Súng Trường', col: '#E8C27A', pas: { ten: 'Ống Ngắm', st: { crit: .08, cd: .2 }, mo: '+8% chí mạng, +20% sát thương chí mạng. Tài liệu: đứng yên 1 giây vào trạng thái Ngắm.' },
      skills: [
        { ten: 'Phát Bắn Xuyên Tâm', lv: 20, cd: 6, cost: 20, kind: 'pierce', mult: 3, r: 18, mo: '300% ATK, xuyên mọi quái trên đường thẳng 18 m' },
        { ten: 'Đạn Đánh Dấu', lv: 20, cd: 12, cost: 20, kind: 'buff', stat: 'crit', v: .15, t: 8, mo: 'Đánh dấu điểm yếu: +15% chí mạng trong 8 giây' },
        { ten: 'Lăn Lùi Nạp Đạn', lv: 20, cd: 10, cost: 15, kind: 'buff', stat: 'atk', v: .3, t: 3, mo: 'Nạp viên cường hóa: +30% ATK trong 3 giây' }] },
    { k: 'phao_thu', ten: 'Pháo Thủ Hơi Nước', col: '#FF9A4A', pas: { ten: 'Nhiệt Kế', st: { atk: .1 }, mo: '+10% ATK. Tài liệu: trên 70% Nhiệt +20% sát thương, 100% thì khóa kỹ năng 3 giây.' },
      skills: [
        { ten: 'Đạn Pháo Nổ', lv: 20, cd: 5, cost: 15, kind: 'grenade', el: 'lua', mult: 1.8, r: 12, aoe: 3, delay: .3, mo: 'Pháo nổ 180% ATK Lửa trong 3 m, tầm 12 m' },
        { ten: 'Xả Hơi Làm Mát', lv: 20, cd: 15, cost: 20, kind: 'nova', mult: .6, r: 4, slow: [.4, 2], mo: 'Phun hơi 4 m quanh mình: 60% ATK, chậm 40% trong 2 giây' },
        { ten: 'Pháo Chùm', lv: 20, cd: 8, cost: 20, kind: 'shot', look: 'bullet', n: 3, mult: .9, r: 12, mo: '3 viên, mỗi viên 90% ATK' }] },
  ],
  ds: [
    { k: 'cuong_no', ten: 'Cuồng Nộ Sư Vương', col: '#FF6B6B', pas: { ten: 'Huyết Nộ', st: { aspd: .12, atk: .04 }, mo: '+12% tốc đánh, +4% ATK. Tài liệu: thanh Nộ thay Thể Lực, mất máu thì đánh nhanh hơn.' },
      skills: [
        { ten: 'Liên Hoàn Sư Quyền', lv: 20, cd: 4, cost: 15, kind: 'strike', mult: 2.4, mo: '6 cú, mỗi cú 40% ATK (bản thử gộp thành 240%)' },
        { ten: 'Vồ Mồi', lv: 20, cd: 10, cost: 20, kind: 'dash', mult: 1.5, r: 8, slow: [.3, 2], mo: 'Vồ tới quái trong 8 m, 150% ATK, chậm 30% trong 2 giây' },
        { ten: 'Móng Sư Tử Xé Toạc', lv: 20, cd: 6, cost: 25, kind: 'strike', mult: 2.8, dot: [.2, 5], mo: '280% ATK, chảy máu 20% ATK mỗi giây trong 5 giây' }] },
    { k: 'nhu_dao', ten: 'Nhu Đạo Thú Tộc', col: '#D9A066', pas: { ten: 'Thế Khóa', st: { hp: .08, def: .08 }, mo: '+8% máu, +8% giáp. Tài liệu: đòn Vật không thể bị né, +30% sát thương lên mục tiêu bị khống chế.' },
      skills: [
        { ten: 'Túm Cổ', lv: 20, cd: 8, cost: 15, kind: 'strike', mult: 1, stun: 1, mo: '100% ATK, choáng 1 giây' },
        { ten: 'Quật Ngã', lv: 20, cd: 10, cost: 20, kind: 'strike', mult: 2.2, stun: 2.5, mo: '220% ATK, choáng 2,5 giây' },
        { ten: 'Quăng Mồi', lv: 20, cd: 12, cost: 25, kind: 'grenade', mult: 1.8, r: 3, aoe: 3, delay: 0, stun: 1, mo: 'Quăng quái vào đám đông: 180% ATK trong 3 m quanh nó, choáng 1 giây' }] },
  ],
  ct: [
    { k: 'phong_linh', ten: 'Phong Linh Thần Tiễn', col: '#9EE4C8', pas: { ten: 'Theo Gió', st: { aspd: .1, ne: .03 }, mo: '+10% tốc bắn, +3% né. Tài liệu: chạy liên tục thì cộng tầng Gió, mỗi tầng +4% sát thương.' },
      skills: [
        { ten: 'Tiễn Lốc Xoáy', lv: 20, cd: 8, cost: 15, kind: 'shot', look: 'arrow', mult: 1.4, r: 16, stun: .8, mo: '140% ATK, lốc hất tung (choáng) 0,8 giây' },
        { ten: 'Tam Liên Phong Tiễn', lv: 20, cd: 5, cost: 15, kind: 'shot', look: 'arrow', n: 3, mult: .7, r: 16, mo: '3 mũi, mỗi mũi 70% ATK' },
        { ten: 'Bước Gió', lv: 20, cd: 7, cost: 15, kind: 'buff', stat: 'ev', v: .25, t: 4, mo: '+25% né tránh trong 4 giây (tài liệu: lướt 6 m 2 lần)' }] },
    { k: 'ngan_dao', ten: 'Ngân Đao Thợ Săn', col: '#C0C8D8', pas: { ten: 'Bóng Rừng', st: { crit: .05, atk: .05 }, mo: '+5% chí mạng, +5% ATK. Tài liệu: đứng trong bụi rậm 1 giây thì tàng hình.' },
      skills: [
        { ten: 'Song Đao Cắt Mạch', lv: 20, cd: 5, cost: 15, kind: 'strike', mult: 2.4, dot: [.2, 4], mo: '4 nhát gộp 240% ATK, chảy máu 20% ATK mỗi giây trong 4 giây' },
        { ten: 'Lẩn Vào Bóng', lv: 20, cd: 14, cost: 20, kind: 'stealth', t: 4, mo: 'Tàng hình 4 giây, quái mất mục tiêu; ra đòn thì hiện hình' },
        { ten: 'Ném Dao Bạc', lv: 20, cd: 6, cost: 15, kind: 'shot', look: 'dart', mult: 1.3, r: 12, dot: [.2, 3], mo: '130% ATK tầm 12 m, chảy máu 20% ATK mỗi giây trong 3 giây' }] },
  ],
  vs: [
    { k: 'tri_lieu', ten: 'Tinh Linh Trị Liệu Sư', col: '#9EE493', pas: { ten: 'Mầm Sống', st: { hp: .1, mres: .1 }, mo: '+10% máu, +10% kháng phép. Tài liệu: mọi hồi máu là hồi theo thời gian, cộng 3 tầng.' },
      skills: [
        { ten: 'Mầm Sống', lv: 20, cd: 8, C: 7, kind: 'heal', v: .24, hot: 8, mo: 'Hồi 3% máu mỗi giây trong 8 giây (bản thử: chỉ cho mình)' },
        { ten: 'Mưa Xuân', lv: 20, cd: 12, C: 12, kind: 'heal', v: .12, hot: 8, mo: 'Hồi 1,5% máu mỗi giây trong 8 giây (bản thử: chỉ cho mình)' },
        { ten: 'Thanh Tẩy Diệp Lục', lv: 20, cd: 10, C: 12, kind: 'heal', v: .05, wake: true, mo: 'Giảm 50 Buồn Ngủ, hồi 5% máu (bản thử: chỉ cho mình)' }] },
    { k: 'bao_to', ten: 'Bão Tố Linh Sư', col: '#9FE3FF', pas: { ten: 'Mắt Bão', st: { el_bang: .1, el_set: .1 }, mo: '+10% sát thương Băng và Sét. Tài liệu: vận sức càng lâu sát thương càng cao (tối đa +30%).' },
      skills: [
        { ten: 'Mưa Đá', lv: 20, cd: 6, C: 12, kind: 'grenade', el: 'bang', mult: 2.5, r: 12, aoe: 5, delay: 1.5, slow: [.2, 2], mo: 'Vùng 5 m, rơi sau 1,5 giây: 250% MATK Băng, chậm 20%' },
        { ten: 'Tia Sét Rừng', lv: 20, cd: 3, C: 7, kind: 'shot', el: 'set', look: 'sun', mult: 1.3, r: 12, mo: '130% MATK Sét tức thì, tầm 12 m' },
        { ten: 'Gió Xoáy Nhỏ', lv: 20, cd: 10, C: 12, kind: 'nova', mult: .5, r: 3, stun: .8, mo: 'Lốc 3 m quanh mình: 50% MATK, hất tung (choáng) 0,8 giây' }] },
  ],
  ks: [
    { k: 'huyet_ma', ten: 'Huyết Ma Kiếm Sĩ', col: '#D9534A', pas: { ten: 'Khát Máu', st: { hp: .1, atk: .05 }, mo: '+10% máu, +5% ATK. Tài liệu: mọi nhát chém hút 20% sát thương.' },
      skills: [
        { ten: 'Huyết Trảm', lv: 20, cd: 5, cost: 15, kind: 'strike', mult: 2, drain: .1, mo: '200% ATK, hồi máu bằng 10% sát thương' },
        { ten: 'Vũng Máu', lv: 20, cd: 12, cost: 25, kind: 'nova', mult: .5, r: 5, dot: [.4, 5], slow: [.25, 5], mo: 'Vũng 5 m quanh mình: 50% ATK, chảy máu 40% ATK mỗi giây 5 giây, chậm 25%' },
        { ten: 'Lao Huyết Ảnh', lv: 20, cd: 10, cost: 20, kind: 'dash', mult: 1.2, r: 8, mo: 'Lao tới quái trong 8 m, 120% ATK' }] },
    { k: 'cot_giap', ten: 'Cốt Giáp Hộ Vệ', col: '#E8E0D0', pas: { ten: 'Giáp Xương', st: { def: .15, mres: .05 }, mo: '+15% giáp, +5% kháng phép. Tài liệu: tích tầng Xương, từ 5 tầng phản 35% sát thương cận chiến.' },
      skills: [
        { ten: 'Nện Xương', lv: 20, cd: 6, cost: 15, kind: 'strike', mult: 1.6, mo: '160% ATK' },
        { ten: 'Gai Xương Mọc', lv: 20, cd: 12, cost: 25, kind: 'nova', mult: 1.5, r: 5, stun: 1, mo: 'Gai trong 5 m quanh mình: 150% ATK, choáng 1 giây' },
        { ten: 'Khiêu Khích Tử Thần', lv: 20, cd: 10, cost: 20, kind: 'taunt', r: 6, t: 4, mo: 'Khiêu khích quái trong 6 m, 4 giây' }] },
  ],
  tk: [
    { k: 'doat_menh', ten: 'Đoạt Mệnh Ám Ảnh', col: '#B48CFF', pas: { ten: 'Sát Ý', st: { crit: .1, cd: .2 }, mo: '+10% chí mạng, +20% sát thương chí mạng. Tài liệu: đòn từ sau lưng chắc chắn chí mạng.' },
      skills: [
        { ten: 'Đâm Sau Lưng', lv: 20, cd: 6, cost: 20, kind: 'strike', mult: 3, mo: '300% ATK' },
        { ten: 'Ẩn Thân Hư Vô', lv: 20, cd: 16, cost: 25, kind: 'stealth', t: 6, mo: 'Tàng hình 6 giây; ra đòn thì hiện hình' },
        { ten: 'Bóng Chớp', lv: 20, cd: 10, cost: 15, kind: 'dash', mult: .6, r: 10, mo: 'Chớp tới quái trong 10 m, 60% ATK' }] },
    { k: 'huyen_anh', ten: 'Huyễn Ảnh Tà Quỷ', col: '#8A7BD9', pas: { ten: 'Tà Ảnh', st: { ne: .05, aspd: .05 }, mo: '+5% né, +5% tốc đánh. Tài liệu: tối đa 2 ảo ảnh, mỗi ảo ảnh gây 30% sát thương của chủ.' },
      skills: [
        { ten: 'Phân Thân', lv: 20, cd: 10, cost: 20, kind: 'summon', t: 12, mo: 'Tạo 1 ảo ảnh 12 giây, mỗi 1,5 giây đánh 30% ATK (bản thử dùng hình bộ xương)' },
        { ten: 'Đổi Chỗ Hư Ảnh', lv: 20, cd: 8, cost: 15, kind: 'buff', stat: 'ev', v: .5, t: 1.5, mo: '+50% né tránh trong 1,5 giây (tài liệu: đổi chỗ với ảo ảnh)' },
        { ten: 'Tam Ảnh Đồng Kích', lv: 20, cd: 6, cost: 20, kind: 'strike', mult: 2.4, mo: 'Cùng ảo ảnh đâm 1 mục tiêu, tổng 240% ATK' }] },
  ],
  hn: [
    { k: 'cot_binh', ten: 'Cốt Binh Triệu Hồi Sư', col: '#E8E0D0', pas: { ten: 'Chúa Tể Xác', st: { mres: .1, hp: .05 }, mo: '+10% kháng phép, +5% máu. Tài liệu: quái chết để lại Xác, tối đa 8 Cốt Binh.' },
      skills: [
        { ten: 'Dựng Cốt Binh', lv: 20, cd: 20, C: 12, kind: 'summon', t: 30, mo: '1 Cốt Binh 30 giây, mỗi 1,5 giây đánh 30% MATK' },
        { ten: 'Nổ Xác', lv: 20, cd: 8, C: 12, kind: 'grenade', el: 'toi', mult: 2.5, r: 12, aoe: 4, delay: .3, mo: '250% MATK Bóng tối trong 4 m (bản thử: không cần Xác)' },
        { ten: 'Tia Tử Khí', lv: 20, cd: 4, C: 7, kind: 'shot', el: 'toi', look: 'soul', mult: 1.3, r: 12, mo: '130% MATK Bóng tối, tầm 12 m' }] },
    { k: 'ma_hoa', ten: 'Hắc Ám Ma Hỏa Sư', col: '#FF7B3A', pas: { ten: 'Ma Hỏa', st: { atk: .1, el_lua: .1 }, mo: '+10% MATK, +10% sát thương Lửa. Tài liệu: mỗi đòn đốt 3% mana mục tiêu; quái không có mana nhận +20%.' },
      skills: [
        { ten: 'Cầu Ma Hỏa', lv: 20, cd: 4, C: 7, kind: 'shot', el: 'lua', look: 'fire', mult: 1.6, r: 12, mo: '160% MATK Lửa' },
        { ten: 'Hỏa Ngục Nuốt Mana', lv: 20, cd: 12, C: 12, kind: 'curse', el: 'lua', dotEl: 'lua', r: 12, dot: [.5, 4], mo: 'Thiêu 50% MATK mỗi giây trong 4 giây' },
        { ten: 'Vòng Lửa Hỗn Mang', lv: 20, cd: 10, C: 14, kind: 'nova', el: 'lua', mult: 2, r: 5, mo: 'Vòng lửa 5 m quanh mình, 200% MATK' }] },
  ],
  ch: [
    { k: 'than_bai', ten: 'Thần Bài', col: '#FFD45A', pas: { ten: 'Vận May', st: { crit: .05, cd: .2 }, mo: '+5% chí mạng, +20% sát thương chí mạng. Tài liệu: Luck +30%, hào quang Luck tổ đội; Vận Đen chưa có.' },
      skills: [
        { ten: 'Xúc Xắc Định Mệnh', lv: 20, cd: 6, C: 7, kind: 'dice', dice: 2, mult: .5, el: 'phep', r: 10, mo: 'Tung 2 xúc xắc: 50% ATK × tổng điểm (2–12)' },
        { ten: 'Bộ Bài Tứ Quý', lv: 20, cd: 8, C: 12, kind: 'shot', el: 'phep', look: 'card', n: 4, mult: .55, r: 10, mo: 'Ném 4 lá, mỗi lá 55% ATK' },
        { ten: 'Đồng Xu Sấp Ngửa', lv: 20, cd: 15, C: 14, kind: 'buff', stat: 'atk', v: .15, t: 8, mo: '+15% ATK trong 8 giây (bản thử luôn ra Ngửa)' }] },
    { k: 'ao_thuat', ten: 'Ảo Thuật Sân Khấu', col: '#FF8AD8', pas: { ten: 'Tràng Pháo Tay', st: { ne: .05, mres: .1 }, mo: '+5% né, +10% kháng phép. Tài liệu: thanh Tràng Pháo Tay 0–100 cho các Tiết Mục.' },
      skills: [
        { ten: 'Pháo Giấy Ảo Ảnh', lv: 20, cd: 8, C: 12, kind: 'nova', el: 'phep', mult: 1, r: 4, blind: 2, mo: 'Nổ 4 m quanh mình: 100% ATK, làm mù 2 giây' },
        { ten: 'Mũ Phép Thỏ Trắng', lv: 20, cd: 12, C: 12, kind: 'grenade', el: 'phep', mult: 1.8, r: 10, aoe: 3, delay: 1.5, mo: 'Thả thỏ ảo ở chỗ quái, 1,5 giây sau nổ 180% ATK trong 3 m' },
        { ten: 'Tràng Cười Đánh Thức', lv: 20, cd: 15, C: 14, kind: 'heal', v: .08, wake: true, mo: 'Giảm 50 Buồn Ngủ, hồi 8% máu (bản thử: chỉ cho mình)' }] },
  ],
  nd: [],
};
// moi ky nang co ma rieng: '<class>.g<i>' ky nang goc, '<class>.<nhanh>.<i>' ky nang nhanh
const SKILL = {};
for (const cls of CLS_ORDER) {
  CLASSES[cls].skills.forEach((sk, i) => { sk.id = `${cls}.g${i}`; sk.ico = `${cls}_s${i}`; SKILL[sk.id] = sk; });
  for (const b of BRANCHES[cls]) {
    b.pas.id = `${cls}.${b.k}.p`;
    b.skills.forEach((sk, i) => { sk.id = `${cls}.${b.k}.${i}`; sk.ico = sk.id; SKILL[sk.id] = sk; });
  }
}
const branchOf = ch => (ch && ch.lv >= BRANCH_LV && (BRANCHES[ch.cls] || []).find(b => b.k === ch.br)) || null;
// cac ky nang nhan vat co the gan vao o 1-3: ky nang goc da mo + 3 ky nang cua nhanh dang theo
function skillPool(ch) {
  const b = branchOf(ch);
  return CLASSES[ch.cls].skills.concat(b ? b.skills : []).filter(sk => ch.lv >= sk.lv);
}
// 3 o ky nang dang gan. Chua chon gi: ky nang goc (ca ky nang chua mo, de hien o khoa), co nhanh thi 3 ky nang nhanh
function skillsOf(ch) {
  if (!Array.isArray(ch.sl)) { const b = branchOf(ch); return (b ? b.skills : CLASSES[ch.cls].skills).slice(0, 3); }
  const pool = skillPool(ch), out = [];
  for (let i = 0; i < 3; i++) { const sk = SKILL[ch.sl[i]]; out.push(sk && pool.includes(sk) && !out.includes(sk) ? sk : null); }
  return out;
}
// gan o ky nang: chi nhan ma ky nang hop le, khong trung; tra ve mang 3 o (null = o trong)
function cleanSlots(ch, sl) {
  const pool = skillPool(ch), out = [];
  for (let i = 0; i < 3; i++) { const sk = SKILL[Array.isArray(sl) ? sl[i] : null]; out.push(sk && pool.includes(sk) && !out.includes(sk.id) ? sk.id : null); }
  return out;
}

// GDD, Tao nhan vat: chung toc quyet dinh phe; chon duoc moi class cua phe minh + Chu He + Nong Dan
const RACES = {
  human: { ten: 'Human', phe: 'Phe 1', skin: [240, 200, 160], mo: '+10% danh vọng với NPC, nhận nhiệm vụ nhanh hơn' },
  dwarf: { ten: 'Dwarf', phe: 'Phe 1', skin: [222, 172, 132], mo: '+10% độ bền trang bị, +5% tỉ lệ chế tác thành công', durable: .1 },
  elf: { ten: 'Elf', phe: 'Phe 2', skin: [246, 214, 182], mo: 'Nhìn rõ hơn ban đêm, +5% kháng phép', mres: .05 },
  thu: { ten: 'Thú Nhân', phe: 'Phe 2', skin: [200, 150, 104], mo: '+5% tốc chạy, đánh hơi thấy nguyên liệu gần đó', speed: .05 },
  quy: { ten: 'Ác Ma', phe: 'Phe 3', skin: [176, 140, 196], mo: '+5% sát thương ban đêm, kháng lửa', nightDmg: .05 },
  undead: { ten: 'Undead', phe: 'Phe 3', skin: [178, 188, 204], mo: 'Kháng độc, không cần thở dưới nước' },
};
const RACE_ORDER = ['human', 'dwarf', 'elf', 'thu', 'quy', 'undead'];
const BACKGROUNDS = {
  quytoc: { ten: 'Quý Tộc Sa Sút', huong: 'Thương nhân', mo: '+3% giá bán cho NPC, khởi đầu với 1 ô shop' },
  nong: { ten: 'Con Nhà Nông', huong: 'Nông dân / sản xuất', mo: '+10% sản lượng thu hoạch' },
  linh: { ten: 'Lính Đánh Thuê', huong: 'Mạo hiểm giả', mo: '+5% thù lao Ủy Thác, bắt đầu ở hạng F+' },
  luuday: { ten: 'Kẻ Lưu Đày', huong: 'Chiến binh / chiến tranh', mo: '+5% Công Trạng trong Chiến Tranh Tổng' },
  hocgia: { ten: 'Học Giả Lang Thang', huong: 'Nhà thám hiểm', mo: 'Đọc được Cổ Ngữ trên bia đá không cần sách dịch' },
  nguyen: { ten: 'Đứa Trẻ Bị Nguyền', huong: 'Nhà thám hiểm / Mộng Giới', mo: 'Thanh Buồn Ngủ tăng chậm hơn 15%', sleepy: .15 },
};
const BG_ORDER = ['quytoc', 'nong', 'linh', 'luuday', 'hocgia', 'nguyen'];
const classesFor = race => CLS_ORDER.filter(k => CLASSES[k].phe === RACES[race].phe || CLASSES[k].phe === 'Chung');
const OUTFITS = 3, GENDERS = ['m', 'f'];

// ---------------- trang bi (Bang Chi So Nen: Trang bi chuan theo cap; Vat Pham & Che Tao: 6 o, ten mon) ----------------
const SLOTS = ['vk', 'mu', 'ao', 'quan', 'giay', 'gang', 'dai', 'day', 'bong'];
const ARMOR = ['mu', 'ao', 'quan', 'giay', 'gang'], ACC = ['dai', 'day', 'bong'];    // trang suc (de xuat 13/10/2026): khong theo class, khong theo loai giap
const SLOT_TEN = { vk: 'Vũ khí', mu: 'Mũ', ao: 'Áo', quan: 'Quần', giay: 'Giày', gang: 'Găng', dai: 'Thắt lưng', day: 'Dây chuyền', bong: 'Bông tai' };
const VK_TEN = { cb: 'Kiếm Đồng', ps: 'Trượng Phép Gỗ Thông', xt: 'Súng Đồng', ds: 'Găng Vuốt Đồng', ct: 'Cung Gỗ Thông', vs: 'Trượng Rễ Thông',
  ks: 'Đại Kiếm Đồng', tk: 'Dao Găm Đôi Đồng', hn: 'Quyền Trượng Sọ Tro', ch: 'Bộ Bài Phép Vải Lanh', nd: 'Cuốc Chiến Đồng' };
const GIAP_TEN = { nang: 'Tấm Đồng', trung: 'Xích Đồng', nhe: 'Da Sói', vai: 'Vải Lanh' };
const GIAP_LOAI = { nang: 'Nặng', trung: 'Trung', nhe: 'Nhẹ', vai: 'Vải' };
// Pham cap: nhan chi so goc cua mon, so dong phu (moi dong +3-6% mot chi so cua nhan vat)
const RARITY = [
  { ten: 'Thường', mul: 1, lines: 0, col: '#E8E4DA' },
  { ten: 'Tốt', mul: 1.1, lines: 1, col: '#8BD17C' },
  { ten: 'Hiếm', mul: 1.2, lines: 2, col: '#6FB7FF' },
];
// 7 loai sat thuong (Bang Chi So Nen, Nguyen to) + 'phep' (phep khong nguyen to, nhu cot Don danh cua bang quai)
const EL = { vatly: 'Vật lý', phep: 'Phép', lua: 'Lửa', bang: 'Băng', set: 'Sét', doc: 'Độc', thanh: 'Thánh', toi: 'Bóng tối' };
const EL_COL = { vatly: '#E8E4DA', phep: '#C9B8FF', lua: '#FF9A4A', bang: '#9FE3FF', set: '#FFE36A', doc: '#9BE36A', thanh: '#FFF2B0', toi: '#B48CFF' };
const STAT_TEN = { hp: 'Máu', atk: 'Công', def: 'Giáp', mres: 'Kháng phép', ne: 'Né', mana: 'Mana', crit: 'Chí mạng', cd: 'Sát thương chí mạng', aspd: 'Tốc đánh', may: 'May mắn' };
for (const e of Object.keys(EL)) STAT_TEN['el_' + e] = 'Sát thương ' + EL[e];
// Bang Chi So Nen: chi mang tran 60%, sat thuong chi mang tran 250%, toc danh tran 2,5 don/giay
const CAP = { crit: .6, cd: 2.5, aspd: 2.5 };
// dong phu (de xuat 08/10/2026): vu khi ra Cong, Chi mang, Sat thuong chi mang, Toc danh, Sat thuong theo he ma class do gay ra;
// giap ra Mau, Giap, Khang phep, Chi mang, Sat thuong chi mang. Khoang so moi dong (%):
const SUB_VK = ['atk', 'crit', 'cd', 'aspd'], SUB_GIAP = ['hp', 'def', 'mres', 'crit', 'cd'];
// trang suc ra Chi mang, Sat thuong chi mang, Toc danh, Cong va sat thuong moi he nguyen to
const SUB_ACC = ['crit', 'cd', 'aspd', 'atk', 'el_lua', 'el_bang', 'el_set', 'el_doc', 'el_thanh', 'el_toi'];
const SUB_RANGE = { hp: [3, 6], atk: [3, 6], def: [3, 6], mres: [3, 6], crit: [1, 3], cd: [6, 12], aspd: [3, 6], el: [4, 8] };
// cac he ma mot class gay sat thuong (danh thuong + ky nang gay sat thuong)
function classEls(cls) {
  const c = CLASSES[cls], out = new Set([c.el || 'vatly']);
  for (const sk of c.skills) {
    if (sk.mult || sk.dot || sk.kind === 'dice') out.add(sk.el || 'vatly');
    if (sk.dotEl) out.add(sk.dotEl);
  }
  return [...out];
}
function subPool(I) {
  if (ACC.includes(I.slot)) return SUB_ACC.slice();
  if (I.slot !== 'vk') return SUB_GIAP.slice();
  return SUB_VK.concat(classEls(I.cls).filter(e => e !== 'vatly' && e !== 'phep').map(e => 'el_' + e));
}
// Gia NPC do Thuong bac 1 (Lv1-20): 50 Bac moi mon; NPC mua lai 3%; sua 2% gia cho moi 10% do ben mat (Bang Can Bang)
const GIA_BAC1 = 5000;
const EL_TEN_NGAN = { lua: 'Hỏa Ngọc', bang: 'Băng Tinh', set: 'Lôi Thạch', doc: 'Lục Độc', thanh: 'Thánh Quang', toi: 'Hắc Diệu' };
const BONG_KHAC = [['toc', 'Phong Vũ', ['aspd', .05]], ['crit', 'Ưng Nhãn', ['crit', .02]], ['cd', 'Huyết Tinh', ['cd', .08]], ['may', 'Cỏ Bốn Lá', ['may', .05]]];
const ITEMS = {};
for (const lv of [1, 10]) {
  const tl = lv === 10 ? ' Tôi Luyện' : '';
  for (const cls of CLS_ORDER)
    ITEMS[`vk_${cls}_${lv}`] = { ten: VK_TEN[cls] + tl, slot: 'vk', lv, cls, gia: GIA_BAC1, base: { atk: 4 * lv + 6 } };
  for (const g of ['trung', 'nhe', 'vai']) for (const sl of ARMOR) {
    const G = GIAP[g], base = { hp: G.hp * lv / 5, def: G.def * lv / 5, mres: G.mres * lv / 5 };
    if (G.ne) base.ne = G.ne / 5;
    if (G.mana) base.mana = G.mana / 5;
    ITEMS[`${sl}_${g}_${lv}`] = { ten: `${SLOT_TEN[sl]} ${GIAP_TEN[g]}${tl}`, slot: sl, lv, giap: g, gia: GIA_BAC1, base };
  }
  // trang suc: That Lung Da (Mau, Sat thuong chi mang), Day Chuyen Dong (Chi mang), Bong Tai 6 he (Sat thuong he do)
  const k = lv === 10 ? 2 : 1;
  ITEMS[`dai_${lv}`] = { ten: 'Thắt Lưng Da' + tl, slot: 'dai', lv, gia: GIA_BAC1, base: { hp: 10 * k * k, cd: .05 * k } };
  ITEMS[`day_${lv}`] = { ten: 'Dây Chuyền Đồng' + tl, slot: 'day', lv, gia: GIA_BAC1, base: { crit: .02 * k, mres: 2 * k * k } };
  for (const e of ['lua', 'bang', 'set', 'doc', 'thanh', 'toi'])
    ITEMS[`bong_${e}_${lv}`] = { ten: `Bông Tai ${EL_TEN_NGAN[e]}${tl}`, slot: 'bong', lv, el: e, gia: GIA_BAC1, base: { ['el_' + e]: .04 * k } };
  // bong tai cho class khong gay sat thuong nguyen to (de xuat 14/10/2026): Toc danh, Chi mang, Sat thuong chi mang, May man (+% co hoi rot them do)
  for (const [g, ten, st] of BONG_KHAC) ITEMS[`bong_${g}_${lv}`] = { ten: `Bông Tai ${ten}${tl}`, slot: 'bong', lv, gem: g, gia: GIA_BAC1, base: { [st[0]]: st[1] * k } };
}
// hat giong (grow = giay toi khi chin), nong san, mon an (an = [chi so, muc, giay] bua loi)
const FARM_ITEMS = {
  hat_ca_rot: { ten: 'Hạt Cà Rốt', slot: 'nong', stack: 50, gia: 10, grow: 120, crop: 'ca_rot', mo: 'Nông Dân trồng: chín sau 2 phút' },
  hat_lua_mi: { ten: 'Hạt Lúa Mì', slot: 'nong', stack: 50, gia: 15, grow: 240, crop: 'lua_mi', mo: 'Nông Dân trồng: chín sau 4 phút' },
  hat_ca_chua: { ten: 'Hạt Cà Chua', slot: 'nong', stack: 50, gia: 20, grow: 360, crop: 'ca_chua', mo: 'Nông Dân trồng: chín sau 6 phút' },
  hat_bi_ngo: { ten: 'Hạt Bí Ngô', slot: 'nong', stack: 50, gia: 30, grow: 600, crop: 'bi_ngo', mo: 'Nông Dân trồng: chín sau 10 phút' },
  ca_rot: { ten: 'Cà Rốt', slot: 'nong', stack: 50, gia: 20, mo: 'Nông sản. Nông Dân nấu thành món ăn' },
  lua_mi: { ten: 'Lúa Mì', slot: 'nong', stack: 50, gia: 30, mo: 'Nông sản. Nông Dân nấu thành món ăn' },
  ca_chua: { ten: 'Cà Chua', slot: 'nong', stack: 50, gia: 40, mo: 'Nông sản. Nông Dân nấu thành món ăn' },
  bi_ngo: { ten: 'Bí Ngô', slot: 'nong', stack: 50, gia: 60, mo: 'Nông sản. Nông Dân nấu thành món ăn' },
  banh_mi: { ten: 'Bánh Mì Nóng', slot: 'tieu', stack: 20, gia: 120, an: ['atk', .08, 600], mo: '+8% Công trong 10 phút' },
  sup_ca: { ten: 'Súp Cà Chua', slot: 'tieu', stack: 20, gia: 150, an: ['def', .12, 600], mo: '+12% Giáp trong 10 phút' },
  bi_nuong: { ten: 'Bí Ngô Nướng', slot: 'tieu', stack: 20, gia: 200, an: ['aspd', .08, 600], mo: '+8% Tốc đánh trong 10 phút' },
  salad: { ten: 'Salad Vườn', slot: 'tieu', stack: 20, gia: 150, an: ['crit', .05, 600], mo: '+5% Chí mạng trong 10 phút' },
};
const RECIPES = { banh_mi: { lua_mi: 3 }, sup_ca: { ca_chua: 2, ca_rot: 1 }, bi_nuong: { bi_ngo: 1, ca_rot: 2 }, salad: { ca_rot: 1, ca_chua: 1, lua_mi: 1 } };
// tieu hao (Vat Pham & Che Tao, Do NPC ban): binh NPC hoi dan trong 10 giay
Object.assign(ITEMS, {
  hp1: { ten: 'Bình Máu Nhỏ', slot: 'tieu', stack: 20, gia: 25, heal: { hp: .15 }, mo: 'Hồi 15% máu trong 10 giây' },
  hp2: { ten: 'Bình Máu Vừa', slot: 'tieu', stack: 20, gia: 200, heal: { hp: .3 }, mo: 'Hồi 30% máu trong 10 giây' },
  mp1: { ten: 'Bình Mana Nhỏ', slot: 'tieu', stack: 20, gia: 25, heal: { mp: .15 }, mo: 'Hồi 15% Mana trong 10 giây' },
  mp2: { ten: 'Bình Mana Vừa', slot: 'tieu', stack: 20, gia: 200, heal: { mp: .3 }, mo: 'Hồi 30% Mana trong 10 giây' },
  ...FARM_ITEMS,
  manh_hd: { ten: 'Mảnh Bản Đồ Hải Đăng', slot: 'khac', stack: 99, gia: 0, mo: 'Rơi từ Người Gác Đèn Ngủ Mê. Ghép đủ mảnh để mở đường tới Ngọn Hải Đăng Cổ (giai đoạn sau)' },
});
const BAG_MAX = 30;
// ---------------- nong trai cua Nong Dan (de xuat 14/10/2026) ----------------
// Nong Dan trong hat (mua o Ba Mira) vao 6 o ruong rieng, cho chin roi thu hoach 2-4 nong san; nau nong san thanh mon an.
// Mon an ai cung dung duoc (ban, giao dich duoc). Thoi gian tinh bang dong ho may chu, offline cay van lon.
const FARM_N = 6;
// ruong tren Dao Binh Minh, canh Xuong Nghe (Nong Dan): 3 x 2 o, moi Nong Dan thay ruong cua minh; trong, thu hoach phai dung gan ruong
const FARM_FIELD = { x: 744, y: 560, w: 48, h: 30 };
const fieldPlot = i => ({ x: FARM_FIELD.x + (i % 3) * 17, y: FARM_FIELD.y + Math.floor(i / 3) * 17, w: 14, h: 12 });
const nearField = p => Math.hypot(p.x - (FARM_FIELD.x + FARM_FIELD.w / 2), p.y - (FARM_FIELD.y + FARM_FIELD.h / 2)) <= 64;
const farmOk = c => (c.cls === 'nd' ? '' : 'Chỉ Nông Dân trồng trọt và nấu ăn được.');
function farmOf(c) { if (!Array.isArray(c.farm) || c.farm.length !== FARM_N) c.farm = Array.from({ length: FARM_N }, (_, i) => (c.farm && c.farm[i]) || null); return c.farm; }
const bagCount = (c, k) => c.bag.reduce((a, b) => a + (b.k === k ? b.n || 1 : 0), 0);
function bagTake(c, k, n) {                                               // lay n mon chong k khoi tui; thieu thi khong lay gi
  if (bagCount(c, k) < n) return false;
  for (let i = c.bag.length - 1; i >= 0 && n > 0; i--) if (c.bag[i].k === k) { const m = Math.min(n, c.bag[i].n); c.bag[i].n -= m; n -= m; if (!c.bag[i].n) c.bag.splice(i, 1); }
  return true;
}
function doPlant(c, i, k, now) {
  const f = farmOf(c), I = Object.hasOwn(ITEMS, k) && ITEMS[k];
  if (farmOk(c)) return farmOk(c);
  if (!(i >= 0 && i < FARM_N)) return 'Ô ruộng không hợp lệ.';
  if (f[i]) return 'Ô này đang trồng.';
  if (!I || !I.grow) return 'Đây không phải hạt giống.';
  if (!bagTake(c, k, 1)) return 'Không có hạt này trong túi.';
  f[i] = { k, at: now };
  return '';
}
const farmLeft = (p, now) => (p ? Math.max(0, ITEMS[p.k].grow * 1000 - (now - p.at)) : 0);
function doHarvest(c, i, now, rand = Math.random) {
  const f = farmOf(c), p = f[i];
  if (farmOk(c)) return [farmOk(c)];
  if (!p) return ['Ô này trống.'];
  if (farmLeft(p, now) > 0) return ['Cây chưa chín.'];
  const n = 2 + Math.floor(rand() * 3), it = { k: ITEMS[p.k].crop, n };
  const why = bagAdd(c, it);
  if (why && it.n === n) return [why];
  f[i] = null;
  return ['', n - it.n];
}
function doCook(c, k) {
  const need = Object.hasOwn(RECIPES, k) && RECIPES[k];
  if (farmOk(c)) return farmOk(c);
  if (!need) return 'Không có món này.';
  for (const [m, n] of Object.entries(need)) if (bagCount(c, m) < n) return `Thiếu ${ITEMS[m].ten} (cần ${n}).`;
  if (c.bag.length >= BAG_MAX && !c.bag.some(b => b.k === k && b.n < ITEMS[k].stack)) return 'Túi đầy.';
  for (const [m, n] of Object.entries(need)) bagTake(c, m, n);
  bagAdd(c, { k, n: 1 });
  return '';
}
// ---------------- ren (de xuat 14/10/2026): Tho Ren Bram ren trang bi dang mac +1 den +10 ----------------
// moi cap +5% chi so chinh cua mon; gia = 20% gia mon x cap toi; that bai chi mat tien (khong tut cap, khong vo do)
const REN_MAX = 10, REN_PCT = .05, REN_RATE = [1, .9, .8, .7, .6, .5, .4, .3, .25, .2];
const renCost = (it, rate) => Math.max(1, Math.round(ITEMS[it.k].gia * rate * .2 * ((it.up || 0) + 1)));
function doRen(c, sl, rate, rand = Math.random) {
  const it = SLOTS.includes(sl) && c.eq && c.eq[sl];
  if (!it || !ITEMS[it.k] || !ITEMS[it.k].base) return ['Không có món để rèn.'];
  if ((it.up || 0) >= REN_MAX) return [`Đã rèn tối đa +${REN_MAX}.`];
  const cost = renCost(it, rate);
  if (c.tien < cost) return ['Không đủ tiền rèn.'];
  c.tien -= cost;
  if (rand() >= REN_RATE[it.up || 0]) return ['', false, cost];
  it.up = (it.up || 0) + 1;
  return ['', true, cost];
}
// cua hang tap hoa o Cho Cang: binh, do Thuong cua vung (bac 1: Lv1 va Lv10 Toi Luyen)
const SHOP = ['hp1', 'hp2', 'mp1', 'mp2', 'hat_ca_rot', 'hat_lua_mi', 'hat_ca_chua', 'hat_bi_ngo', ...Object.keys(ITEMS).filter(k => ITEMS[k].gia === GIA_BAC1)];

function newItem(k, r = 0, rand = Math.random) {
  const I = ITEMS[k];
  if (!I) return null;
  if (I.stack) return { k, n: 1 };
  const it = { k, r, d: 100, dm: 100 };
  if (RARITY[r].lines) {
    it.s = [];
    const pool = subPool(I);
    for (let i = 0; i < RARITY[r].lines; i++) {
      const st = pool.splice(Math.floor(rand() * pool.length), 1)[0], [a, b] = SUB_RANGE[st.startsWith('el_') ? 'el' : st];
      it.s.push([st, a + Math.floor(rand() * (b - a + 1))]);
    }
  }
  return it;
}
// chi so cua mot mon: khong co tac dung khi do ben 0; do ben toi da duoi 50 la do "Cu", -10% chi so chinh
function itemStats(it) {
  const I = it && ITEMS[it.k];
  if (!I || !I.base) return null;
  const k = (RARITY[it.r || 0] || RARITY[0]).mul * ((it.dm != null ? it.dm : 100) < 50 ? .9 : 1) * (1 + REN_PCT * (it.up || 0)), out = {};
  for (const [s, v] of Object.entries(I.base)) out[s] = v * k;
  return out;
}
const itemOk = (it, L) => { const I = it && ITEMS[it.k]; return !!(I && I.base && I.lv <= L && (it.d == null || it.d > 0)); };
function gearSum(eq, L) {
  const t = { hp: 0, atk: 0, def: 0, mres: 0, ne: 0, mana: 0, crit: 0, cd: 0, aspd: 0, may: 0, el: {}, pct: { hp: 0, atk: 0, def: 0, mres: 0 } };
  if (!eq) return t;
  for (const sl of SLOTS) {
    const it = eq[sl];
    if (!itemOk(it, L)) continue;
    const st = itemStats(it);
    for (const [s, v] of Object.entries(st)) if (s.startsWith('el_')) t.el[s.slice(3)] = (t.el[s.slice(3)] || 0) + v; else t[s] += v;
    if (it.s) for (const [s, v] of it.s) {
      if (s in t.pct) t.pct[s] += v / 100;
      else if (s.startsWith('el_')) t.el[s.slice(3)] = (t.el[s.slice(3)] || 0) + v / 100;
      else t[s] += v / 100;                                             // crit, cd: cong thang; aspd: % toc danh cua class
    }
  }
  return t;
}
// chi so nhan vat. eq = trang bi dang mac; khong truyen eq thi gia dinh du bo do Thuong dung cap (de so sanh, xem truoc)
const hero = (cls, L, eq, br) => {
  const c = CLASSES[cls], k = KHUON[c.khuon], g = GIAP[c.giap];
  const mpBase = c.tl === 'mana' ? 100 + 12 * (L - 1) : 0;
  if (eq === undefined) {
    return {
      hp: Math.round(k.hp + k.hpL * (L - 1) + g.hp * L), atk: Math.round(k.atk + k.atkL * (L - 1) + 4 * L + 6),
      def: Math.round(k.def + g.def * L), mres: Math.round(k.mres + g.mres * L),
      st: c.tl === 'mana' ? 100 : 100 + 2 * (L - 1),                // class dung Mana van co 100 The Luc co dinh de ne
      mp: Math.round(mpBase * (1 + g.mana)), ne: g.ne + (c.ne || 0),
      crit: CRIT, cd: CRIT_X, aspd: c.aspd, may: 0, el: {},
    };
  }
  const t = gearSum(eq, L), b = branchOf({ cls, lv: L, br });
  if (b) for (const [s, v] of Object.entries(b.pas.st)) {                // noi tai nhanh (Lv20)
    if (s in t.pct) t.pct[s] += v;
    else if (s.startsWith('el_')) t.el[s.slice(3)] = (t.el[s.slice(3)] || 0) + v;
    else t[s] += v;
  }
  return {
    hp: Math.round((k.hp + k.hpL * (L - 1) + t.hp) * (1 + t.pct.hp)),
    atk: Math.round((k.atk + k.atkL * (L - 1) + t.atk) * (1 + t.pct.atk)),
    def: Math.round((k.def + t.def) * (1 + t.pct.def)),
    mres: Math.round((k.mres + t.mres) * (1 + t.pct.mres)),
    st: c.tl === 'mana' ? 100 : 100 + 2 * (L - 1),
    mp: Math.round(mpBase * (1 + t.mana)), ne: t.ne + (c.ne || 0),
    crit: Math.min(CAP.crit, CRIT + t.crit), cd: Math.min(CAP.cd, CRIT_X + t.cd), aspd: Math.min(CAP.aspd, c.aspd * (1 + t.aspd)), may: t.may, el: t.el,
  };
};
// bo do tan thu (de xuat 07/10/2026): nhan vat moi mac du 6 mon Thuong Lv1 dung class va loai giap
function starterEq(cls) {
  const eq = { vk: newItem(`vk_${cls}_1`) };
  for (const sl of ARMOR) eq[sl] = newItem(`${sl}_${CLASSES[cls].giap}_1`);
  return eq;
}
function canEquip(c, it) {
  const I = it && ITEMS[it.k];
  if (!I || !I.base) return 'Không mặc được món này.';
  if (I.lv > c.lv) return `Cần Lv${I.lv}.`;
  if (I.cls && I.cls !== c.cls) return `Chỉ ${CLASSES[I.cls].ten} dùng được.`;
  if (I.giap && I.giap !== CLASSES[c.cls].giap) return `${CLASSES[c.cls].ten} mặc giáp ${GIAP_LOAI[CLASSES[c.cls].giap]}, món này là giáp ${GIAP_LOAI[I.giap]}.`;
  return '';
}
// cac thao tac tui do: tra ve '' neu thanh cong, hoac cau bao loi. Dung chung cho may chu va choi mot minh.
function bagAdd(c, it) {
  const I = ITEMS[it.k];
  if (I.stack) {
    for (const b of c.bag) if (b.k === it.k && b.n < I.stack) { const m = Math.min(I.stack - b.n, it.n); b.n += m; it.n -= m; if (!it.n) return ''; }
    while (it.n > 0) {
      if (c.bag.length >= BAG_MAX) return 'Túi đầy.';
      const m = Math.min(I.stack, it.n); c.bag.push({ k: it.k, n: m }); it.n -= m;
    }
    return '';
  }
  if (c.bag.length >= BAG_MAX) return 'Túi đầy.';
  c.bag.push(it);
  return '';
}
function doEquip(c, i) {
  const it = c.bag[i], why = canEquip(c, it);
  if (why) return why;
  const sl = ITEMS[it.k].slot, old = c.eq[sl];
  c.eq[sl] = it; c.bag.splice(i, 1);
  if (old) c.bag.splice(i, 0, old);
  return '';
}
function doUnequip(c, sl) {
  if (!c.eq[sl]) return '';
  if (c.bag.length >= BAG_MAX) return 'Túi đầy.';
  c.bag.push(c.eq[sl]); c.eq[sl] = null;
  return '';
}
// r = 1: mon Tot (1 dong phu ngau nhien) ban o cua hang trong giai doan thu, gia x3 (de xuat 08/10/2026)
const price = (k, rate, r = 0) => Math.max(1, Math.round(ITEMS[k].gia * (ITEMS[k].base ? rate * (r ? 3 : 1) : 1)));          // binh: gia that; do: x he so thu nghiem
const sellPrice = (it, rate) => { const I = ITEMS[it.k]; return I.base ? Math.max(1, Math.round(I.gia * .03 * rate * RARITY[it.r || 0].mul)) : Math.floor(I.gia * .3) * (it.n || 1); };
function doBuy(c, k, rate, r = 0) {
  if (!SHOP.includes(k)) return 'Cửa hàng không bán món này.';
  r = ITEMS[k].base && r === 1 ? 1 : 0;
  const p = price(k, rate, r);
  if (c.tien < p) return 'Không đủ tiền.';
  const why = bagAdd(c, newItem(k, r));
  if (why) return why;
  c.tien -= p;
  return '';
}
function doSell(c, i, rate) {
  const it = c.bag[i];
  if (!it) return 'Không có món này.';
  if (!ITEMS[it.k].gia) return 'Cửa hàng không mua món này.';
  c.tien += sellPrice(it, rate); c.bag.splice(i, 1);
  return '';
}
// sua o NPC: 2% gia cho moi 10% do ben mat; moi 10% sua lam do ben toi da tut 2 diem (khong duoi 20)
function repairCost(c, rate) {
  let n = 0;
  for (const sl of SLOTS) { const it = c.eq[sl]; if (it && it.d < it.dm) n += Math.ceil((it.dm - it.d) / 10) * ITEMS[it.k].gia * .02 * rate; }
  return Math.round(n);
}
function doRepair(c, rate) {
  const cost = repairCost(c, rate);
  if (!cost) return 'Trang bị không cần sửa.';
  if (c.tien < cost) return 'Không đủ tiền sửa.';
  c.tien -= cost;
  for (const sl of SLOTS) {
    const it = c.eq[sl];
    if (!it || it.d >= it.dm) continue;
    const lost = it.dm - it.d;
    it.dm = Math.max(20, it.dm - 2 * Math.ceil(lost / 10)); it.d = it.dm;
  }
  return '';
}
// mon do mon: chet -10% moi mon, danh quai -5% moi gio (Dwarf mon cham hon 10%)
function wear(c, pct) {
  const k = 1 - ((RACES[c.race] || {}).durable || 0);
  for (const sl of SLOTS) { const it = c.eq[sl]; if (it) it.d = Math.max(0, Math.round((it.d - pct * k) * 100) / 100); }
}
const eqDurability = eq => { let lo = 100; for (const sl of SLOTS) if (eq && eq[sl]) lo = Math.min(lo, eq[sl].d); return Math.floor(lo); };
// do roi: quai thuong 3% vu khi (tai lieu Nhanh, Ky Nang), Tinh Anh 15%. Cap mon theo cap quai (bac 1: Lv1 hoac Lv10 Toi Luyen)
function dropFor(m, cls, rand = Math.random) {
  const chance = m.t.bac === 'Tinh Anh Dungeon' ? .15 : m.t.bac === 'Boss Dungeon' ? 0 : .03;
  if (rand() >= chance) return null;
  const lv = m.lv >= 10 ? 10 : 1, wc = rand() < .5 ? cls : CLS_ORDER[Math.floor(rand() * CLS_ORDER.length)];
  return newItem(`vk_${wc}_${lv}`, rand() < (m.t.bac === 'Tinh Anh Dungeon' ? .3 : .1) ? 1 : 0, rand);
}
// binh thuoc roi tu quai (de xuat 09/10/2026): quai thuong 8%, quai Dungeon 12%, Tinh Anh 60% (2 binh).
// Class dung Mana: nua Binh Mana, nua Binh Mau; quai tu Lv10 co 30% ra binh Vua.
const POT_DROP = { 'Yếu': .08, 'Bầy': .08, 'Thường': .08, 'Quái Dungeon': .12, 'Tinh Anh Dungeon': .6, 'Boss Dungeon': 0 };
function potion(cls, lv, rand = Math.random) {
  const mp = CLASSES[cls] && CLASSES[cls].tl === 'mana' && rand() < .5, big = lv >= 10 && rand() < .3;
  return newItem((mp ? 'mp' : 'hp') + (big ? '2' : '1'));
}
function potionDrop(m, cls, rand = Math.random) {
  if (rand() >= (POT_DROP[m.t.bac] || 0)) return null;
  const it = potion(cls, m.lv, rand);
  if (m.t.bac === 'Tinh Anh Dungeon') it.n = 2;
  return it;
}
// Boss Hang Hai Dang Co: moi nguoi 1 mon (vu khi Thuong-Tot, Lv10) + 1 Manh Ban Do Hai Dang + binh Vua (3 Mau; class Mana: 2 Mau + 2 Mana)
function bossLoot(cls, rand = Math.random) {
  const mp = CLASSES[cls] && CLASSES[cls].tl === 'mana';
  const out = [newItem(`vk_${rand() < .6 ? cls : CLS_ORDER[Math.floor(rand() * CLS_ORDER.length)]}_10`, rand() < .35 ? 1 : 0, rand), newItem('manh_hd'),
    Object.assign(newItem('hp2'), { n: mp ? 2 : 3 })];
  if (mp) out.push(Object.assign(newItem('mp2'), { n: 2 }));
  return out;
}

const expNeed = L => Math.round(17 * Math.pow(L, 2.8));   // Bang Chi So Nen: EXP len cap 17 x L^2,8
const MAX_LV = 20;
const DODGE = { cost: 20, time: .3, perfect: .2 };   // moi class: 0,3 giay khong bi trung don, ton 20 The Luc
const MOVE_ATK = .6;              // chot 04/10/2026: vua di vua danh, toc chay con 60% trong luc vung kiem
// thoi gian gong truoc moi don cua quai (nam trong nhip 1 don / 1,5 giay)
const WIND = { 'Yếu': .7, 'Bầy': .5, 'Thường': .6, huc: .8, 'Quái Dungeon': .6, 'Tinh Anh Dungeon': .8, 'Boss Dungeon': .9 };
const DAY = 600, NIGHT_FROM = 420;                        // chu ky 10 phut: 7 phut ngay, 3 phut dem
const skCost = (sk, L) => (sk.C != null ? Math.round(sk.C * (1 + .04 * L)) : sk.cost);
// giap quai giam sat thuong; EXP theo chenh lech cap (Bang Chi So Nen)
// he cua mot don: ch = nhan vat { cls, lv, br, sl }; s = -1 danh thuong, -2 bo xuong trieu hoi, 0..2 o ky nang; dot = phan chay mau / doc
function hitEl(ch, s, dot) {
  const c = CLASSES[ch.cls];
  if (!c || s === -2) return 'vatly';
  if (s == null || s < 0) return c.el || 'vatly';
  const sk = skillsOf(ch)[s];
  if (!sk) return c.el || 'vatly';
  return (dot && sk.dotEl) || sk.el || 'vatly';
}
// quai yeu he do x1,5, khang x0,5, mien 0
function elMul(m, el) {
  const t = m.t;
  if (t.mien && t.mien.includes(el)) return 0;
  if (t.yeu && t.yeu.includes(el)) return 1.5;
  if (t.khang && t.khang.includes(el)) return .5;
  return 1;
}
// sat thuong nguoi choi gay cho quai (Bang Chi So Nen): Cong x %ky nang x (1 - Giam) x Chi mang x He so cap x Nguyen to.
// st = chi so nhan vat (hero), atk = Cong da tinh bua loi. Vat ly giam bang Giap, cac he khac giam bang Khang phep. Tra 0 neu quai mien he nay.
function dmgToMob(st, atk, m, plv, mult, el, crit) {
  const k = elMul(m, el);
  if (!k) return 0;
  const diff = Math.max(0, m.lv - plv), red = mobRed(el === 'vatly' ? m.def : m.mdef, plv);
  return Math.max(1, Math.round(atk * mult * (1 - red) * (crit ? st.cd : 1) * k * (1 + ((st.el && st.el[el]) || 0)) * (1 - .03 * Math.min(15, diff))));
}
const mobRed = (mdef, plv) => Math.min(.75, mdef / (mdef + 50 + 10 * plv));
// chenh lech cap (sua 07/10/2026 sau khi choi thu): quai cao hon moi cap +20% EXP (toi da +200%) va +10% sat thuong len nguoi choi (toi da +100%)
function killExp(mexp, mlv, plv) {
  const diff = mlv - plv;
  let ex = mexp;
  if (diff <= -11) ex *= .1; else if (diff <= -6) ex *= .5; else if (diff > 0) ex *= 1 + Math.min(2, .2 * diff);
  return ex;
}
const mobDmgMul = (mlv, plv) => 1 + Math.min(1, .1 * Math.max(0, mlv - plv));
// so do quai Dungeon theo so nguoi: mau x (0,3 + 0,14 x so nguoi)
const dungeonHp = n => .3 + .14 * Math.max(1, Math.min(5, n));
const PARTY_MAX = 5;
// Dungeon tren Dao Binh Minh (Bang Chi So Nen: Dungeon). Den quet cua Boss: dung ngoai vung sang +10 Buon Ngu moi giay, day thi ngu 3 giay
// limit: so giay de ha Boss (10 phut, 08/10/2026). Het gio thi phong lam lai tu dau; EXP, tien, do roi trong hang chi tra khi ha Boss
const DUNGEONS = {
  hhd: { ten: 'Hang Hải Đăng Cổ', map: 'hhd', lv: 10, minLv: 8, cua: 'Hang Hải Đăng Cổ', back: { x: 1312, y: 790 }, enrage: 480, limit: 600,
    lamp: { r: 13, arc: 80, speed: 26, zz: 10, back: 20, sleep: 3 } },
};
// Dungeon da ha Boss it nhat 1 lan (de xuat 13/10/2026): quai trong hang chi con 50% EXP voi nguoi do (lan dau van du 100%)
const REPEAT_EXP = .5;
const cleared = (c, key) => !!(c && c.ach && c.ach.clr && c.ach.clr[key] > 0);

// ---------------- thanh tuu (de xuat 13/10/2026): chi la danh hieu, khong co thuong vat pham ----------------
// c.ach = { kill: tong quai ha, kk: { loai: so }, clr: { dungeon: so lan }, best: { dungeon: giay nhanh nhat }, trade: so lan, done: { ma: thoi diem } }
// val: tien do hien tai; need: moc can dat; fast: true = thoi gian, can <= need giay
const ACH = [
  { k: 'kill1', ten: 'Nhát Kiếm Đầu Tiên', mo: 'Hạ 1 quái', need: 1, val: a => a.kill },
  { k: 'kill100', ten: 'Thợ Săn Đảo Bình Minh', mo: 'Hạ 100 quái', need: 100, val: a => a.kill },
  { k: 'kill1000', ten: 'Nỗi Khiếp Sợ Của Quái', mo: 'Hạ 1.000 quái', need: 1000, val: a => a.kill },
  { k: 'slime50', ten: 'Kẻ Diệt Slime', mo: 'Hạ 50 Slime Sương', need: 50, val: a => a.kk.slime || 0 },
  { k: 'wolf30', ten: 'Săn Sói Trong Sương', mo: 'Hạ 30 Sói Sương', need: 30, val: a => a.kk.wolf || 0 },
  { k: 'goblin30', ten: 'Dẹp Loạn Bến Cảng', mo: 'Hạ 30 Goblin Cướp Bến', need: 30, val: a => a.kk.goblin || 0 },
  { k: 'wisp20', ten: 'Người Không Sợ Ma', mo: 'Hạ 20 Ma Trơi', need: 20, val: a => a.kk.wisp || 0 },
  { k: 'hhd1', ten: 'Ngọn Đèn Đã Tắt', mo: 'Hạ Người Gác Đèn Ngủ Mê lần đầu (clear Hang Hải Đăng Cổ)', need: 1, val: a => a.clr.hhd || 0 },
  { k: 'hhd10', ten: 'Người Quen Của Hang', mo: 'Clear Hang Hải Đăng Cổ 10 lần', need: 10, val: a => a.clr.hhd || 0 },
  { k: 'hhd5m', ten: 'Nhanh Như Sóng Dữ', mo: 'Clear Hang Hải Đăng Cổ dưới 5 phút', need: 300, fast: true, val: a => a.best.hhd || 0 },
  { k: 'hhd3m', ten: 'Tốc Chiến Hải Đăng', mo: 'Clear Hang Hải Đăng Cổ dưới 3 phút', need: 180, fast: true, val: a => a.best.hhd || 0 },
  { k: 'lv10', ten: 'Rời Bến Tân Thủ', mo: 'Đạt Lv10', need: 10, val: (a, c) => c.lv },
  { k: 'lv20', ten: 'Sẵn Sàng Ra Khơi', mo: 'Đạt Lv20', need: 20, val: (a, c) => c.lv },
  { k: 'branch', ten: 'Chọn Lối Đi', mo: 'Chọn nhánh kỹ năng ở Lv20', need: 1, val: (a, c) => (c.br ? 1 : 0) },
  { k: 'trade1', ten: 'Cái Bắt Tay Đầu Tiên', mo: 'Giao dịch xong với người chơi khác', need: 1, val: a => a.trade },
];
function achOf(c) {
  const a = c.ach || (c.ach = {});
  for (const k of ['kk', 'clr', 'best', 'done']) if (!a[k] || typeof a[k] !== 'object') a[k] = {};
  a.kill = a.kill | 0; a.trade = a.trade | 0;
  return a;
}
const achMet = (A, a, c) => { const v = A.val(a, c); return A.fast ? v > 0 && v <= A.need : v >= A.need; };
// xet thanh tuu moi dat; tra ve danh sach thanh tuu vua mo
function achCheck(c, now = Date.now()) {
  const a = achOf(c), out = [];
  for (const A of ACH) if (!a.done[A.k] && achMet(A, a, c)) { a.done[A.k] = now; out.push(A); }
  return out;
}
function achKill(c, kind) { const a = achOf(c); a.kill++; a.kk[kind] = (a.kk[kind] || 0) + 1; return achCheck(c); }
function achClear(c, key, secs) {
  const a = achOf(c); a.clr[key] = (a.clr[key] || 0) + 1;
  if (!a.best[key] || secs < a.best[key]) a.best[key] = secs;
  return achCheck(c);
}

// NPC buon ban o Cho Cang (Dao Binh Minh): tap hoa ban binh va do Thuong cua vung, tho ren sua do
const SHOP_NPC = { ten: 'Bà Mira', vai: 'Tạp hóa', x: 930, y: 300, frame: 0 };
const SMITH_NPC = { ten: 'Thợ Rèn Bram', vai: 'Sửa đồ', x: 1020, y: 300, frame: 1 };
const NPC_NEAR = 5;                                   // met: dung gan NPC trong 5 m moi mua, ban, sua duoc

// ---------------- tien ich ----------------
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// tien: 100 Dong = 1 Bac, 100 Bac = 1 Vang, 100 Vang = 1 Kim Ngan (GDD, Kinh te)
const MONEY_UNITS = [['kn', 1e6, 'Kim Ngân'], ['vang', 1e4, 'Vàng'], ['bac', 100, 'Bạc'], ['dong', 1, 'Đồng']];
const moneyParts = d => { d = Math.max(0, Math.floor(d)); return MONEY_UNITS.map(([k, u], i) => [k, i ? Math.floor(d / u) % 100 : Math.floor(d / u)]); };
function money(d) {
  const p = moneyParts(d), first = p.findIndex(x => x[1] > 0);
  return p.slice(first < 0 ? 3 : first).map(([k, v]) => v + ' ' + MONEY_UNITS.find(u => u[0] === k)[2]).join(' ');
}

// ---------------- va cham va tim duong tren luoi ban do ----------------
function makeGeo(MAP) {
  const CELL = MAP.cell, COLS = MAP.cols, ROWS = MAP.rows, N = COLS * ROWS;
  const COL = new Uint8Array(N), DYN = new Uint8Array(N);   // DYN: o bi chan tam thoi (cong Dungeon dong)
  for (let i = 0; i < N; i++) COL[i] = MAP.col.charCodeAt(i) === 49 ? 1 : 0;
  // cay nho, bui (de xuat 14/10/2026): than cay chi chan 3-4 px nhung rung day lam kho di; bo chan duoi cac vat nho nay, nhan vat di xuyen qua
  for (const o of MAP.objs || []) {
    const f = MAP.frames && MAP.frames[o.f];
    if (!o.c || !f || f[3] > 22 || o.c[2] - o.c[0] > 5) continue;
    for (let cy = Math.floor(o.c[1] / CELL); cy <= Math.floor(o.c[3] / CELL); cy++)
      for (let cx = Math.floor(o.c[0] / CELL); cx <= Math.floor(o.c[2] / CELL); cx++) if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) COL[cy * COLS + cx] = 0;
  }
  const blockedCell = (cx, cy) => cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || COL[cy * COLS + cx] === 1 || DYN[cy * COLS + cx] === 1;
  const blockedPx = (x, y) => blockedCell(Math.floor(x / CELL), Math.floor(y / CELL));
  // chan nhan vat: hop 5 x 3 px quanh diem chan
  const canStand = (x, y) => !(blockedPx(x - 2.5, y) || blockedPx(x + 2.5, y) || blockedPx(x - 2.5, y - 2.5) || blockedPx(x + 2.5, y - 2.5));
  // luoi "dung duoc": o ma chan nhan vat dat vua (da tinh be rong chan), dung cho tim duong
  const FREE = new Uint8Array(N);
  const calcFree = (x0, y0, x1, y1) => {
    for (let cy = Math.max(0, y0); cy <= Math.min(ROWS - 1, y1); cy++)
      for (let cx = Math.max(0, x0); cx <= Math.min(COLS - 1, x1); cx++) FREE[cy * COLS + cx] = canStand((cx + .5) * CELL, (cy + .5) * CELL) ? 1 : 0;
  };
  calcFree(0, 0, COLS - 1, ROWS - 1);
  const walkCell = (cx, cy) => cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && FREE[cy * COLS + cx] === 1;
  // dong / mo mot vung (px): cong giua cac tang Dungeon
  function setBlock(r, on) {
    const a = Math.floor(r.x0 / CELL), b = Math.floor(r.y0 / CELL), c = Math.floor(r.x1 / CELL), d = Math.floor(r.y1 / CELL);
    for (let cy = Math.max(0, b); cy <= Math.min(ROWS - 1, d); cy++) for (let cx = Math.max(0, a); cx <= Math.min(COLS - 1, c); cx++) DYN[cy * COLS + cx] = on ? 1 : 0;
    calcFree(a - 2, b - 2, c + 2, d + 2);
  }
  function moveBy(e, dx, dy) {
    let moved = false;
    if (dx && canStand(e.x + dx, e.y)) { e.x += dx; moved = true; }
    if (dy && canStand(e.x, e.y + dy)) { e.y += dy; moved = true; }
    return moved;
  }
  function lineFree(a, b) {
    const n = Math.ceil(dist(a, b) / 2);
    for (let k = 1; k <= n; k++) { const t = k / n; if (!canStand(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
    return true;
  }
  // tim duong A* tren luoi va cham. Bo dem dung lai giua cac lan goi (danh dau bang so luot), khong cap phat moi lan.
  const g = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), shut = new Uint32Array(N);
  let stamp = 0;
  function findPath(sx, sy, tx, ty, maxNodes = 60000) {
    let gx = Math.floor(tx / CELL), gy = Math.floor(ty / CELL);
    let s0 = clamp(Math.floor(sx / CELL), 0, COLS - 1), s1 = clamp(Math.floor(sy / CELL), 0, ROWS - 1);
    // dung sat vat can (o duoi chan khong tinh la di duoc): xuat phat tu o di duoc gan nhat
    if (!walkCell(s0, s1)) {
      let best = null, bd = 1e9;
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++)
        if (walkCell(s0 + ox, s1 + oy) && ox * ox + oy * oy < bd) { bd = ox * ox + oy * oy; best = [s0 + ox, s1 + oy]; }
      if (best) [s0, s1] = best;
    }
    if (!walkCell(gx, gy)) {
      let best = null;
      for (let r = 1; r <= 8 && !best; r++)
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++)
          if (!best && walkCell(gx + ox, gy + oy)) best = [gx + ox, gy + oy];
      if (!best) return null;
      [gx, gy] = best;
    }
    stamp++;
    const touch = i => { if (seen[i] !== stamp) { seen[i] = stamp; g[i] = 1e9; from[i] = -1; } };
    const heap = [], push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
    const start = s1 * COLS + s0, goal = gy * COLS + gx;
    touch(start); touch(goal);
    g[start] = 0; push(h(s0, s1), start);
    let n = 0, found = start === goal;
    while (heap.length && n++ < maxNodes) {
      const [, i] = pop();
      if (shut[i] === stamp) continue;
      if (i === goal) { found = true; break; }
      shut[i] = stamp;
      const x = i % COLS, y = (i / COLS) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        if (!walkCell(nx, ny) || (ox && oy && (!walkCell(x + ox, y) || !walkCell(x, y + oy)))) continue;
        const j = ny * COLS + nx, ng = g[i] + (ox && oy ? 1.414 : 1);
        touch(j);
        if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + h(nx, ny), j); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== start && i >= 0; i = from[i]) cells.push(i);
    cells.reverse();
    // rut gon duong: bo cac diem co the di thang
    const pts = cells.map(i => ({ x: (i % COLS + .5) * CELL, y: ((i / COLS | 0) + .5) * CELL }));
    const out = [];
    let cur = { x: sx, y: sy };
    for (let k = 0; k < pts.length; k++) {
      let far = k;
      for (let j = Math.min(pts.length - 1, k + 24); j > k; j--) if (lineFree(cur, pts[j])) { far = j; break; }
      out.push(pts[far]); cur = pts[far]; k = far;
    }
    return out;
  }
  // diem sinh quai nam trong khe hep (dung duoc nhung khong di dau duoc): doi sang tam o di duoc gan nhat
  function freeSpot(x, y) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (walkCell(cx, cy)) return { x, y };
    for (let r = 1; r <= 6; r++) {
      let best = null, bd = 1e9;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++)
        if (walkCell(cx + ox, cy + oy) && ox * ox + oy * oy < bd) { bd = ox * ox + oy * oy; best = { x: (cx + ox + .5) * CELL, y: (cy + oy + .5) * CELL }; }
      if (best) return best;
    }
    return { x, y };
  }
  return { CELL, COLS, ROWS, canStand, moveBy, lineFree, findPath, walkCell, setBlock, freeSpot };
}

// quai moi sinh (cung dung cho may chu). opts.hpMul: so do theo so nguoi trong Dungeon
function makeMob(kind, x, y, PX, opts = {}) {
  const t = LOAI[kind], L = opts.lv || irnd(t.lv[0], t.lv[1]), b = mobBase(L), k = BAC[t.bac], f = t.fix;
  const m = {
    kind, t, lv: L, x, y, home: { x, y }, hp: 0, max: Math.round((f ? f.hp : b.hp * k.hp) * (opts.hpMul || 1)),
    atk: f ? f.atk : b.atk * k.atk, def: f ? f.def : b.def * k.def, mdef: f ? f.mdef : b.mdef * k.def,
    exp: b.exp * k.exp, tien: Math.round(b.tien * k.tien),
    speed: (t.toc || 4.5) * PX, state: 'idle', wait: rnd(.5, 3), dest: null, atkCd: rnd(.5, 1.5), hurt: 0, engaged: 0,
    flee: 0, charged: false, split: !!opts.child, scale: opts.child ? .75 : 1, alive: true, respawn: 0, face: 1, bob: rnd(0, 6),
    wind: null, dash: null, lunge: 0, stuck: 0, fledOnce: false, dying: 0, evade: false, noReach: 0, best: 1e9, path: null,
    dots: [], slowT: 0, slowV: 0, rootT: 0, fearT: 0, blindT: 0, flipT: 0,
  };
  m.hp = m.max;
  return m;
}

// ---------------- AI quai dung chung (may chu va choi mot minh) ----------------
// E: { G: va cham cua ban do, PX, target(m), nearest(m, r), hurtBy(m, p), retarget(m, p), aggro(m, p), strike(m, P), split(m),
//      respawn(m), visible(m), tickDots(m, dt), evaded(m), home(m) }
function mobMove(m, tx, ty, sp, dt, E, usePath) {
  const G = E.G, PX = E.PX, dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
  if (d < 1) return true;
  const k = m.rootT > 0 ? 0 : (m.slowT > 0 ? 1 - m.slowV : 1);   // bi troi thi dung yen, bi lam cham thi cham lai
  if (!k) return false;
  let wx = tx, wy = ty;
  // vuong vat can (hang rao, goc cay): tim duong vong thay vi dam vao
  if (usePath && d > 6 && !G.lineFree(m, { x: tx, y: ty })) {
    m.repath = (m.repath || 0) - dt;
    if (!m.path || m.repath <= 0 || Math.hypot(m.pathTo.x - tx, m.pathTo.y - ty) > 2 * PX) {
      m.path = G.findPath(m.x, m.y, tx, ty, 6000); m.pathTo = { x: tx, y: ty }; m.repath = .6;
      if (!m.path) m.noReach += 1.5;                                    // khong co duong toi: mat kien nhan nhanh
    }
    if (m.path && m.path.length && Math.hypot(m.path[0].x - m.x, m.path[0].y - m.y) < 2) m.path.shift();
    if (m.path && m.path.length) { wx = m.path[0].x; wy = m.path[0].y; }
  } else m.path = null;
  const ex = wx - m.x, ey = wy - m.y, ed = Math.hypot(ex, ey) || 1, st = Math.min(ed, sp * k * dt);
  if (!G.moveBy(m, ex / ed * st, ey / ed * st)) m.stuck = (m.stuck || 0) + dt;
  if (Math.abs(dx) > .5) m.face = dx > 0 ? 1 : -1;
  return false;
}
// quai bo cuoc: quay ve cho cu, mien nhiem sat thuong tren duong ve va hoi day mau khi toi noi (chong dung xa ban quai ket dia hinh)
function mobEvade(m, E) {
  m.state = 'return'; m.evade = true; m.wind = null; m.tgt = null; m.dots.length = 0; m.path = null; m.noReach = 0; m.best = 1e9; m.retT = 0;
  if (E.evaded) E.evaded(m);
}
function startWind(m, P, PX) {
  const dx = P.x - m.x, dy = P.y - m.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, t = m.t;
  m.face = dx > 0 ? 1 : -1;
  if (t.co === 'huc' && !m.charged) {
    // Tho Sung: huc theo duong thang 4 m
    m.wind = { kind: 'line', t: WIND.huc, total: WIND.huc, x: m.x, y: m.y, ux, uy, len: 4 * PX, w: 1.4 * PX, mult: 1.5, dash: true };
  } else if (t.moves) {
    m.mi = ((m.mi || 0) + 1) % t.moves.length;
    const mv = t.moves[m.mi];
    m.wind = mv.kind === 'line'
      ? { kind: 'line', t: mv.wind, total: mv.wind, x: m.x, y: m.y, ux, uy, len: mv.len * PX, w: mv.w * PX, mult: mv.mult, ten: mv.ten }
      : { kind: 'circle', t: mv.wind, total: mv.wind, x: m.x + ux * mv.off * PX, y: m.y + uy * mv.off * PX, r: mv.r * PX, mult: mv.mult, ten: mv.ten };
  } else {
    const w = WIND[t.bac];
    m.wind = { kind: 'circle', t: w, total: w, x: m.x + ux * .8 * PX, y: m.y + uy * .8 * PX, r: (m.kind === 'wisp' ? 1.7 : 1.3) * PX, mult: 1 };
  }
}
function updateMob(m, dt, E) {
  const PX = E.PX, G = E.G;
  if (!m.alive) {
    if (m.dying > 0) m.dying -= dt;
    if (m.origin) { m.respawn -= dt; if (m.respawn <= 0) E.respawn(m); }
    return;
  }
  if (!E.visible(m)) { m.state = 'idle'; m.dots.length = 0; m.wind = null; m.tgt = null; return; }
  m.bob += dt * 6; m.hurt = Math.max(0, m.hurt - dt); m.atkCd -= dt;
  m.slowT = Math.max(0, m.slowT - dt); m.rootT = Math.max(0, m.rootT - dt); m.blindT = Math.max(0, m.blindT - dt); m.flipT = Math.max(0, m.flipT - dt);
  if (m.dots.length) { E.tickDots(m, dt); if (!m.alive) return; }
  if (m.dash) {
    if (dist(m, m.home) > (m.t.leash || 14) * PX * .8) m.dash.left = 0;     // huc khong vuot qua vung quanh cho cu
    const st = Math.min(m.dash.left, 16 * PX * dt);
    if (!G.moveBy(m, m.dash.ux * st, m.dash.uy * st)) m.dash.left = 0; else m.dash.left -= st;
    if (m.dash.left <= 0) m.dash = null;
    return;
  }
  if (m.flipT > 0) { m.wind = null; return; }                       // Cua An Si bi lat ngua: nam yen
  if (m.fearT > 0) {                                                // so hai: bo chay khoi nguoi choi gan nhat
    m.fearT -= dt; m.wind = null;
    const q = E.nearest(m, 30 * PX, true);
    if (q) {
      const dx = m.x - q.x, dy = m.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (m.rootT <= 0) G.moveBy(m, dx / d * m.speed * .8 * dt, dy / d * m.speed * .8 * dt);
      m.face = dx > 0 ? 1 : -1;
    }
    return;
  }
  let P = E.target(m);
  if ((m.state === 'chase' || m.state === 'flee') && !P) {
    const alt = m.state === 'chase' ? E.nearest(m, 6 * PX) : null;
    if (alt && E.hurtBy(m, alt)) { E.retarget(m, alt); P = alt; } else { m.state = 'return'; m.wind = null; m.tgt = null; m.retT = 0; }
  }
  if (m.state === 'idle' && m.t.bac !== 'Yếu') { const q = E.nearest(m, (m.t.aggro || 6) * PX); if (q) { E.aggro(m, q); P = q; } }
  const fromHome = dist(m, m.home), leash = (m.t.leash || 14) * PX;
  if (m.state === 'chase' && fromHome > leash) mobEvade(m, E);
  if (m.wind && m.state !== 'chase') m.wind = null;
  if (m.state === 'idle') {
    m.wait -= dt;
    if (m.dest) { if (mobMove(m, m.dest.x, m.dest.y, m.speed * .35, dt, E, false) || (m.stuck || 0) > 1) { m.dest = null; m.stuck = 0; m.wait = rnd(1.5, 4); } }
    else if (m.wait <= 0) {
      const dx = m.home.x + rnd(-3, 3) * PX, dy = m.home.y + rnd(-2, 2) * PX;
      m.dest = G.canStand(dx, dy) && G.lineFree(m, { x: dx, y: dy }) ? { x: dx, y: dy } : null; m.wait = m.dest ? 0 : rnd(1, 3);
    }
  } else if (m.state === 'return') {
    m.hp = Math.min(m.max, m.hp + m.max * dt * .5);
    m.retT = (m.retT || 0) + dt;
    if (mobMove(m, m.home.x, m.home.y, m.speed * (m.evade ? 1.3 : 1), dt, E, true) || m.retT > 8) {
      if (m.retT > 8) { m.x = m.home.x; m.y = m.home.y; }            // ket han: dua thang ve cho cu
      m.state = 'idle'; m.hp = m.max; m.stuck = 0; m.charged = false; m.fledOnce = false; m.evade = false; m.path = null; m.retT = 0;
      if (E.home) E.home(m);
    }
  } else if (m.state === 'flee' && P) {
    m.flee -= dt;
    // bo chay ra xa nguoi choi nhung chi trong vung quanh cho cu (khong chay qua vung gioi han roi bi tinh la bo cuoc)
    const dx = m.x - P.x, dy = m.y - P.y, d = Math.hypot(dx, dy) || 1;
    let fx = m.x + dx / d * 20, fy = m.y + dy / d * 20;
    const hx = fx - m.home.x, hy = fy - m.home.y, hd = Math.hypot(hx, hy), lim = leash * .6;
    if (hd > lim) { fx = m.home.x + hx / hd * lim; fy = m.home.y + hy / hd * lim; }
    mobMove(m, fx, fy, m.t.co === 'huc' ? 6 * PX : m.speed, dt, E, false);
    if (m.flee <= 0) m.state = 'chase';
  } else if (m.state === 'chase' && P) {
    m.engaged += dt;
    const toP = dist(m, P), reach = (m.t.reach || 1.6) * PX;
    if (m.t.co === 'tach' && !m.split && m.engaged > 10 && m.hp > 0) E.split(m);
    if (m.wind) { m.wind.t -= dt; if (m.wind.t <= 0) { const w = m.wind; m.wind = null; m.atkCd = Math.max(.3, 1.5 - w.total); m.lunge = .2; if (w.dash) { m.dash = { ux: w.ux, uy: w.uy, left: w.len }; m.charged = true; m.state = 'flee'; m.flee = 2.5; } E.strike(m, P, w); } }
    else if (toP > reach && !(m.t.co === 'huc' && !m.charged && toP < 4 * PX)) {
      mobMove(m, P.x, P.y, m.speed, dt, E, true);
      // khong lai gan duoc muc tieu (bi chan, muc tieu dung ben kia vat can): sau 4 giay thi bo cuoc
      if (toP < m.best - .5 * PX) { m.best = toP; m.noReach = Math.max(0, m.noReach - dt); } else m.noReach += dt;
      if (m.noReach > 4) mobEvade(m, E);
    } else {
      m.best = toP; m.noReach = 0;
      if (m.atkCd <= 0) { m.stuck = 0; startWind(m, P, PX); }
    }
  }
  if (m.lunge) m.lunge = Math.max(0, m.lunge - dt);
}
// quai bi danh: cap nhat trang thai thu. Tra ve false neu quai dang mien nhiem (dang bo cuoc ve cho cu)
function mobHurt(m) { return !m.evade; }
// Cua An Si: mai giap phia truoc, don tu phia truoc chi con 1/3; bi khong che (troi, so, mu) thi lat ngua 4 giay, nhan them 50%
function shellMul(m, from) {
  if (m.t.co !== 'mai') return 1;
  if (m.flipT > 0) return 1.5;
  const tx = m.tgtPos ? m.tgtPos.x - m.x : m.face, ty = m.tgtPos ? m.tgtPos.y - m.y : 0, td = Math.hypot(tx, ty) || 1;
  const fx = from.x - m.x, fy = from.y - m.y, fd = Math.hypot(fx, fy) || 1;
  return (tx * fx + ty * fy) / (td * fd) > .35 ? 1 / 3 : 1;
}

// ten nhan vat: 3-16 ky tu, chu (co dau tieng Viet), so, khoang trang
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ]{1,14}[\p{L}\p{N}]$/u;

root.LAZ_RULES = {
  BAC, LOAI, mobBase, KHUON, GIAP, CLASSES, CLS_ORDER, RACES, RACE_ORDER, BACKGROUNDS, BG_ORDER, classesFor, OUTFITS, GENDERS,
  SLOTS, ARMOR, ACC, SLOT_TEN, GIAP_LOAI, RARITY, STAT_TEN, ITEMS, BAG_MAX, SHOP, newItem, itemStats, itemOk, gearSum, starterEq, canEquip,
  bagAdd, doEquip, doUnequip, price, sellPrice, doBuy, doSell, repairCost, doRepair, wear, eqDurability, dropFor, bossLoot,
  hero, expNeed, MAX_LV, CRIT, CRIT_X, CAP, EL, EL_COL, hitEl, elMul, dmgToMob, classEls, potionDrop, POT_DROP, DODGE, MOVE_ATK, WIND, DAY, NIGHT_FROM, skCost, mobRed, killExp, mobDmgMul, dungeonHp, PARTY_MAX, DUNGEONS, SHOP_NPC, SMITH_NPC, NPC_NEAR,
  FARM_N, FARM_FIELD, fieldPlot, nearField, RECIPES, farmOf, farmLeft, doPlant, doHarvest, doCook, bagCount, REN_MAX, REN_RATE, renCost, doRen,
  BRANCH_LV, BRANCHES, SKILL, branchOf, skillPool, skillsOf, cleanSlots, REPEAT_EXP, cleared, ACH, achOf, achMet, achCheck, achKill, achClear,
  rnd, irnd, clamp, dist, money, moneyParts, MONEY_UNITS, makeGeo, makeMob, updateMob, startWind, mobEvade, mobHurt, shellMul, NAME_RE,
};
})(typeof window !== 'undefined' ? window : globalThis);
