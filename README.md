# Memphis unBLACKed

A full-stack, monochrome (pure black & white) web app — 2,817 real embedded
games, 50 day-use apps, Spotify and YouTube through a self-hosted **Scramjet**
web proxy, a free unlimited **GLM** AI chat, and a live community chat.

> Single-page app at `/` with eight sections: **Home · Play · Apps · Chat · AI ·
> Listen · Watch · Browse**.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| State | Zustand (client) · localStorage persistence |
| Database | Prisma ORM + SQLite (`db/custom.db`) |
| Realtime | Socket.io mini-service (`mini-services/chat-service`, port 3003) |
| Proxy engine | Scramjet 1.1.0 (Mercury Workshop) + bare-mux 2.1.9 |
| Transports | epoxy-transport 2.1.29 (default) · libcurl-transport 1.5.2 |
| Relay | Self-hosted wisp server (`mini-services/wisp-service`, port 3001) |
| AI | GLM (glm-4-plus) via `z-ai-web-dev-sdk`, server-side only, streaming SSE |
| Games | 2,799 HTML5 games from the GameMonetize public feed + 18 built-ins |

## Architecture

```
Browser
  └─ Memphis SPA (Next.js, port 3000)
       ├─ /sw.js — Scramjet service worker intercepts /scramjet/* URLs
       │    └─ bare-mux SharedWorker (/baremux/worker.js)
       │         ├─ /epoxy/index.mjs   (EpoxyTransport, default)
       │         └─ /libcurl/index.mjs (CurlTransport, optional)
       │              └─ WebSocket → wisp relay (port 3001) → target site
       ├─ /api/games    — 2,817-game catalog (search / categories / ids)
       ├─ /api/ai/*     — GLM chat (streaming SSE, no auth, no limits)
       ├─ /api/games/scores, /api/auth/*, /api/reports
       └─ chat-service  — socket.io community chat (port 3003)
```

- **Vendored proxy assets** live in `public/`: `scram/` (engine + wasm),
  `epoxy/`, `libcurl/`, `baremux/`, and `sw.js`.
- **COOP/COEP headers** (`same-origin` / `credentialless`) are set in
  `next.config.ts` — required by the transports (SharedArrayBuffer), while
  `credentialless` keeps cross-origin game embeds and CDN thumbnails working.
- **The wisp URL** is computed at runtime as
  `ws(s)://<host>/wisp/?XTransformPort=3001&/` — the trailing `&/` is required
  (the wisp server switches to wsproxy mode if the URL does not end in `/`).
- **Transport switching** is real: Settings → Browse → Transport re-calls
  `BareMuxConnection.setTransport()` with the chosen module and wisp args.

## Getting started

```bash
bun install
bun run db:push          # apply the Prisma schema
bun scripts/fetch-games.mjs   # (re)build data/games.json from the GM feed

# terminal 1 — wisp relay (required for the proxy)
cd mini-services/wisp-service && bun install && bun run dev

# terminal 2 — chat service (required for the Chat tab)
cd mini-services/chat-service && bun install && bun run dev

# terminal 3 — the app
bun run dev              # http://localhost:3000
```

Behind the sandbox gateway, the services are reached with
`?XTransformPort=<port>` query params (see `Caddyfile`):
`/wisp/?XTransformPort=3001&/` (relay) and `/?XTransformPort=3003` (chat).

## Environment variables

`DATABASE_URL` — SQLite connection string (default `file:../db/custom.db` in
`src/lib/db.ts`). No other secrets are required: the AI runs on the built-in
GLM SDK.

## Feature inventory

- **Play** — 2,817 real games (2,799 from the GameMonetize feed + 18 built-in
  canvas classics with server-side leaderboards). Search, 22 category filters,
  A–Z sorting, favorites & recents (localStorage), fullscreen player with a
  "load via proxy" fallback for stubborn embeds.
- **Apps** — exactly 50 day-use apps (YouTube, Instagram, TikTok, ChatGPT,
  Gemini, Snapchat, Discord, Netflix, Gmail, Maps, Roblox, …), each opened
  through the Scramjet proxy in the built-in browser.
- **Chat** — full community chat: accounts, channels, DMs, friends, polls,
  moderation, XP/coins, soundboard (socket.io mini-service).
- **AI** — real GLM chat: streaming answers, markdown + code highlighting,
  custom instructions, saved conversations (anonymous per-browser sessions),
  flashcard generator. No sign-in, no quota, no rate limits.
- **Listen** — the full Spotify web player through the proxy.
- **Watch** — all of YouTube through the proxy (trending, subscriptions,
  history, quick links).
- **Browse** — tabbed Scramjet browser: address bar with engine choice
  (DuckDuckGo/Google/Bing/Brave), history, reload, proxied new-tab,
  fullscreen, live engine status.
- **Settings** — appearance (monochrome variants), tab cloak, about:blank
  launcher, panic hotkey, close protection, proxy transport (epoxy/libcurl),
  search engine, local data management.

## Services & ports

| Port | Service |
| --- | --- |
| 3000 | Next.js app (gateway default) |
| 3001 | wisp relay (`mini-services/wisp-service`) |
| 3003 | chat service (`mini-services/chat-service`) |

## Data sources

- Games: GameMonetize public feed (`gamemonetize.com/feed.php`) — real,
  embeddable HTML5 games; catalog regenerated by `scripts/fetch-games.mjs`
  (auto-resumes, rate-limit backoff, writes `data/games.json`).
- App favicons: Google's public favicon service.
- Proxy stack: Mercury Workshop's Scramjet / bare-mux / epoxy-transport /
  libcurl-transport / wisp-js (vendored dist files, licenses AGPL/LGPL — see
  `public/*/`).
