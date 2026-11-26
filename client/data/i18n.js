// Ngon ngu giao dien: 'vi' (mac dinh) hoac 'en'. Luu o localStorage 'lz_lang' (dung chung voi trang chu), hoac ?lang=en tren dia chi.
// Tieng Anh: dich chu tren trang (MutationObserver) va chu ve tren canvas (fillText) theo tu dien data/lang_en.js.
// Doi ngon ngu thi tai lai trang, nen khong can giu ban goc.
(() => {
  let lang = 'vi';
  try { lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('lz_lang') || 'vi'; } catch (e) { /* bi chan luu */ }
  if (lang !== 'en' && lang !== 'es') lang = 'vi';
  document.documentElement.lang = lang;
  window.LAZ_LANG = lang;
  window.LAZ_SET_LANG = l => { try { localStorage.setItem('lz_lang', l); } catch (e) { /* bo qua */ } const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); };
  const D = lang === 'es' ? window.LAZ_ES : window.LAZ_EN;
  if (lang === 'vi' || !D) { window.LAZ_T = s => s; return; }

  // tu ngan, hay nham: chi dich khi la ca chuoi
  const ONLY = new Set(['Nam', 'Nữ', 'Vào', 'Còn', 'Hết', 'Chỉ', 'Chào', 'Mặc', 'Dùng', 'Bán', 'Mua', 'Hiện', 'Chép', 'Đóng', 'Thôi', 'Nhận', 'Đánh', 'Né',
    'đội', 'mời', 'rời', 'người', 'giây', 'phút', 'chấm', 'Chung', 'Tầng', 'tầng', 'Công', 'Kháng', 'Miễn', 'Trung', 'Phép', 'Áo', 'Mũ', 'Chưa', 'Tốt', 'Đội']);
  const dict = Object.assign({}, D.exact, D.phrase);
  const keys = Object.keys(dict).filter(k => !ONLY.has(k)).sort((a, b) => b.length - a.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const W = /[\p{L}\p{N}]/u;
  const alt = keys.map(k => (W.test(k[0]) ? '(?<![\\p{L}\\p{N}])' : '') + esc(k) + (W.test(k[k.length - 1]) ? '(?![\\p{L}\\p{N}])' : ''));
  const RE = new RegExp(alt.join('|'), 'gu');
  const TAIL = [[/(\d[\d.,]*)\s?giây/g, '$1 s'], [/(\d)\s?phút/g, '$1 min'], [/(\d)\s?người/g, lang === 'es' ? '$1 jugadores' : '$1 players'], [/\bgiây\b/g, 's']];
  const cache = new Map();
  const T = s => {
    if (typeof s !== 'string' || !s) return s;
    if (!/[^\x00-\x7F]/.test(s)) { const d = dict[s.trim()]; return d !== undefined ? s.replace(s.trim(), d) : s; }   // chu khong dau (Xung Phong...): chi dich khi trung ca chuoi
    let r = cache.get(s);
    if (r !== undefined) return r;
    const t = s.trim();
    if (dict[t] !== undefined) r = s.replace(t, dict[t]);
    else {
      r = s.replace(RE, m => dict[m]);
      for (const [a, b] of TAIL) r = r.replace(a, b);
    }
    if (cache.size > 4000) cache.clear();
    cache.set(s, r);
    return r;
  };
  window.LAZ_T = T;

  // chu tren trang
  const ATTR = ['title', 'placeholder', 'aria-label', 'alt'];
  const fixNode = n => {
    if (n.nodeType === 3) { const v = n.nodeValue, r = T(v); if (r !== v) n.nodeValue = r; return; }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
    for (const a of ATTR) if (n.hasAttribute(a)) { const v = n.getAttribute(a), r = T(v); if (r !== v) n.setAttribute(a, r); }
    for (let c = n.firstChild; c; c = c.nextSibling) fixNode(c);
  };
  const obs = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') fixNode(m.target);
      else if (m.type === 'attributes') fixNode(m.target);
      else for (const n of m.addedNodes) fixNode(n);
    }
  });
  // nap trong <head>: theo doi ca trang ngay tu dau, chu duoc dich ngay khi trinh duyet doc toi
  obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
  if (document.body) fixNode(document.body);
  document.addEventListener('DOMContentLoaded', () => { document.title = T(document.title); });

  // chu ve tren canvas (ten quai, so bay len, bong bong thoai)
  const P2 = CanvasRenderingContext2D.prototype;
  for (const f of ['fillText', 'strokeText', 'measureText']) {
    const o = P2[f];
    P2[f] = function (s, ...a) { return o.call(this, T(s), ...a); };
  }
})();
