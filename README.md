# Lazaria Online

A small open-world pixel MMORPG that runs in the browser, with a multiplayer server built entirely on the **Cloudflare free tier** (Workers + Durable Objects with SQLite).

The goal is to be a readable, end-to-end reference for building a small multiplayer game on serverless free tiers: one Worker accepts WebSocket connections, one Durable Object per map holds the authoritative world state.

> Tiếng Việt: Lazaria là game nhập vai online dạng pixel chạy trên trình duyệt, máy chủ chạy hoàn toàn trên gói miễn phí của Cloudflare. Tài liệu chi tiết trong `server/README.md` (tiếng Việt).

## What's here

| Folder | Contents |
| --- | --- |
| `client/` | Browser game (plain HTML/JS, no build step): character creation (11 classes, races, backgrounds), levels 1–20, inventory and equipment, skill trees, achievements, NPC shop and blacksmith, parties of 5, chat, day/night, and the 3-floor dungeon *Ancient Lighthouse Cave*. UI in Vietnamese, English and Spanish. |
| `server/` | Cloudflare Worker + Durable Object `World`: monsters (AI, pathfinding, respawn, aggro), damage, EXP and loot split by damage share, inventory and item durability, parties, per-party dungeon instances with a timer, character persistence in SQLite. Smoke and lag tests in `server/test/`. |

Game rules, numbers and maps live in `client/data/` (`rules.js`, `dbm.js`, `hhd.js`) and are **shared by client and server**, so offline and online play use the same formulas.

## Run it

Play solo: open `client/index.html` in a browser (add `?offline` to the URL).

Run the multiplayer server locally (Node.js 18+):

```bash
cd server
npm install
npm run dev          # http://127.0.0.1:8787
npm test             # smoke test against the local server
```

Then open `client/index.html?server=http://127.0.0.1:8787`.

Deploy: `npx wrangler deploy` inside `server/`, put the Worker URL in `client/data/server.js`, and host `client/` on any static host (e.g. Cloudflare Pages). Details in `server/README.md`.

## Status

Early playtest (started October 2026). Known limitation: player HP is still client-side, so it can be cheated; moving it to the server is the next step before expanding beyond the starting island.

## Contributing

Issues and pull requests are welcome. Good places to start: tests for `client/data/rules.js`, English translations in `client/data/lang_en.js`, and server-side player HP.

## License

- **Code** (`.js`, `.mjs`, `.html`, `.css`, config files): [MIT](LICENSE).
- **Art assets** (`client/img/`) and game content (story, names, NPC and item text): © hongvy0707, all rights reserved. You may use them to run and test this project, not in other projects.
