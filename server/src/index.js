/* LazyEyes – Worker nhan yeu cau va chuyen vao Durable Object cua ban do.
   GET  /api/health          kiem tra may chu
   POST /api/create          tao nhan vat moi -> { id, key, char }
   GET  /ws?id=..&key=..     ket noi WebSocket vao the gioi */
export { World } from './world.js';

function cors(env, req) {
  const allow = env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.get('Origin') || '';
  // so khop ca khi dia chi co hoac khong co dau / o cuoi
  const ok = allow === '*' || allow.split(',').map(s => s.trim().replace(/\/+$/, '')).includes(origin.replace(/\/+$/, ''));
  return {
    'Access-Control-Allow-Origin': ok ? (allow === '*' ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    if (url.pathname === '/' || url.pathname === '/api/health')
      return new Response(JSON.stringify({ ok: true, game: 'LazyEyes', map: 'dbm' }), { headers: { ...h, 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/create' || url.pathname === '/ws') {
      // hien chi co mot ban do (Dao Binh Minh); sau nay moi Lanh Dia la mot Durable Object rieng
      const stub = env.WORLD.get(env.WORLD.idFromName('dbm'));
      // lenh thu (doi cap, dich chuyen) chi mo khi chay tren may voi wrangler.dev.toml (DEV = "1"); tham so dev do nguoi choi tu gui luon bi xoa
      const u2 = new URL(req.url);
      u2.searchParams.delete('dev');
      if (String(env.DEV) === '1') u2.searchParams.set('dev', '1');
      const res = await stub.fetch(new Request(u2.toString(), req));
      if (url.pathname === '/ws') return res;
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
      return out;
    }
    return new Response('Không có trang này', { status: 404, headers: h });
  },
};
