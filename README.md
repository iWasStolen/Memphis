# Memphis unBLACKed

A full-stack study-portal web application — a monochrome (pure black & white)
recreation of the Tung Tung experience, rebuilt from an audit of the reference
site with an independent brand identity, a real server-side web proxy, live
chat, an AI tutor, generative music and a public-domain video library.

> Runs as a single-page app at `/` with eight sections: **Home · Play · Apps ·
> Chat · AI · Listen · Watch · Browse**.

---

## Contents

1. [Stack](#stack)
2. [Architecture](#architecture)
3. [Getting started](#getting-started)
4. [Environment variables](#environment-variables)
5. [Services & ports](#services--ports)
6. [Feature inventory](#feature-inventory)
7. [Security model](#security-model)
8. [Data & persistence](#data--persistence)
9. [Troubleshooting](#troubleshooting)

---

## Stack

| Layer      | Technology |
|------------|------------|
| Framework  | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling    | Tailwind CSS 4 + shadcn/ui (New York), Lucide icons |
| Database   | SQLite via Prisma ORM (`db/custom.db`) |
| Realtime   | Socket.io v4 (dedicated mini-service on `:3003`) |
| AI         | z-ai-web-dev-sdk (GLM chat completions) |
| Media      | Internet Archive public search API (movies/cartoons), in-browser Web Audio synthesis (music) |
| Process    | Bun runtime, Caddy gateway |

## Architecture

```
Browser ──► Caddy gateway (:81 public)
              ├─ /?XTransformPort=3003 ──► chat-service (Socket.io, bun:sqlite WAL)
              └─ everything else ────────► Next.js app (:3000)
                                            ├─ /            SPA shell (8 sections)
                                            ├─ /api/proxy   web proxy engine (SSRF-guarded relay)
                                            ├─ /api/auth/*  register / login / logout / me
                                            ├─ /api/games/* catalog + scores
                                            ├─ /api/watch/* catalog / views / ratings / comments
                                            ├─ /api/ai/*    tutor chat / conversations / flashcards
                                            └─ /api/reports issue reporting
```

Key source locations:

- `src/app/page.tsx` — SPA entry (only user-visible route)
- `src/components/shell/` — header, footer, settings, report, legal modals
- `src/components/views/` — one view per section (+ `chat-panels.tsx` dialogs)
- `src/components/games/`, `src/components/apps/` — built-in games and tools
- `src/lib/proxy-server.ts` — proxy engine: DNS-resolved SSRF guard, cookie
  jars, redirect validation, HTML/CSS rewriting, injected client router
- `src/lib/music-engine.ts` — seeded generative Web Audio synthesizer
- `src/lib/store.ts` — Zustand settings store (persisted to localStorage)
- `mini-services/chat-service/index.ts` — chat, presence, DMs, groups,
  friends, polls, casino, moderation, listen-party relay
- `prisma/schema.prisma` — 15 models (User, Session, Channel, Message, …)

## Getting started

```bash
# 1. install dependencies
bun install
# also install chat-service deps
cd mini-services/chat-service && bun install && cd ../..

# 2. create the database (first run only)
bun run db:push

# 3. start the chat mini-service (port 3003)
cd mini-services/chat-service && bun run dev &

# 4. start the app (port 3000)
bun run dev

# 5. (optional) production build
bun run build && bun run start
```

Open `http://localhost:3000`. If you route traffic through the bundled Caddy
gateway (recommended, mirrors the sandbox setup), the app is served on the
gateway port and socket.io is reachable at `/?XTransformPort=3003`.

### First-run notes

- The **first registered account becomes the owner** (full moderation rights).
- Seed channels (`#announcements #rules #general #counting #casino
  #suggestions #share-links #media` + staff-only `#staff-only`, `#logs`) are
  created automatically by the chat service.
- The AI tutor requires a chat account (username + password; no email needed).

## Environment variables

The app runs with zero required environment variables. Optional ones:

| Variable      | Default                 | Purpose |
|---------------|-------------------------|---------|
| `DATABASE_URL`| `file:/home/z/my-project/db/custom.db` | Prisma SQLite path |

The AI service reads its credentials from `/etc/.z-ai-config` (or
`./.z-ai-config`) — `baseUrl`, `apiKey`, `token`. This file is provisioned by
the sandbox; for self-hosting, create it with your own Z.ai credentials:

```json
{
  "baseUrl": "https://internal-api.z.ai/v1",
  "apiKey": "<your key>",
  "token": "<your token>"
}
```

## Services & ports

| Port | Service | Notes |
|------|---------|-------|
| 3000 | Next.js app | dev server; `bun run dev` |
| 3003 | chat-service | Socket.io; must stay alive for Chat/party/soundboard |
| 81   | Caddy gateway | routes `XTransformPort` queries; optional locally |

Keep the chat service running alongside the app:

```bash
cd mini-services/chat-service
nohup bun run dev > /tmp/chat-service.log 2>&1 &
```

It uses `bun --hot`, so edits reload automatically. Both processes share the
same SQLite file (WAL mode) — Prisma owns the schema, the chat service opens
it read/write with `busy_timeout=15000`.

## Feature inventory

Legend: **[C]** complete · **[V]** verified in browser · **[P]** partial /
approximated · **[X]** not available in this environment

### Shell & navigation
- [C][V] Header: wordmark, 8-section nav (desktop tabs + mobile drawer), live
  clock, session timer, fullscreen, settings
- [C][V] Footer: Terms / Privacy / DMCA / Credits modals, proxy status, report
  dialog — sticky-footer layout on all heights
- [C][V] Boot screen (skippable via Settings → Behavior), skip-to-content link
- [C][V] Keyboard: `Alt+1…8` sections, `?` shortcut sheet, `Ctrl+Shift+F`
  fullscreen, `Esc` closes dialogs, `Ctrl+L` focuses Browse address bar
- [C][V] Panic hotkey (configurable combo + redirect URL + test button)

### Settings (persisted in localStorage)
- [C][V] Appearance: Pure Black / Graphite modes, White/Ash/Silver/Bone
  accents, background patterns (none/grid/dots/scanlines), font (default/mono/
  serif), five text sizes, reduce-effects switch
- [C][V] Tab cloak: 9 presets (Google, Classroom, Drive, Docs, Canvas, Clever,
  Khan, Wikipedia) + custom title/favicon, auto-cloak on blur
- [C][V] Panic: hotkey recorder, URL presets, test
- [C][V] Behavior: skip boot screen, close protection, chat quick-button
- [C] Browse: custom proxy server base URL
- [C][V] Data: reset everything

### Play
- [C][V] Game catalog: 12 built-in canvas/DOM games (2048, Snake, Tetris,
  Minesweeper, Breakout, Flappy, Asteroids, Pong, Memory, Minesweeper, Simon,
  Clicker, Tic-tac-toe) + 6 open-source embeds (T-Rex, Clumsy Bird, Astray,
  2048 web, Hextris, HexGL) + classic variants
- [C][V] Search, category tabs (All/Arcade/Puzzle/Classic/Action/Casual),
  favorites (star), recents, pagination
- [C][V] In-app player overlay with fullscreen + report link
- [C] Score submission for built-ins, global per-game high-score table
  (`/api/games/scores`)

### Apps
- [C][V] 10 tools: Calculator, Notes (multi-note, persisted), Draw (PNG
  export), Markdown editor (live preview), JS code sandbox (console output),
  Timers (stopwatch/countdown/pomodoro), World clock, Unit converter, Text
  tools, Random picker

### Chat (Socket.io + SQLite)
- [C][V] Auth: register/login/logout, scrypt password hashing, 30-day session
  tokens, optional recovery code, first user = owner
- [C][V] Community-rules gate before first join (per browser)
- [C][V] Channels: seeded public channels, locked read-only channels, live
  messaging, typing indicators, message deletion (own or staff)
- [C][V] Presence: online list, per-user dot, member sidebar, profile popups
- [C][V] DMs (with per-user DM policy), groups (create/invite), friends
  (requests, accept/decline, remove)
- [C][V] Polls: 2–4 options, 5 min–24 h duration, live bars, one vote per user
- [C][V] Economy: XP per message, coins (capped daily), daily claim with
  streaks, casino channel (`/flip`, `/slots`, `/bal`), counting channel with
  chain-break detection and milestone bonuses
- [C][V] Leaderboard: XP / coins / messages / streak tabs (top 15)
- [C][V] Soundboard: 6 synthesized sounds broadcast to everyone
- [C][V] Private channels: create (60 min / 24 h / permanent) + 6-char invite
  codes, join by code
- [C][V] Moderation (owner/admin/mod): mute/unmute/warn/ban/unban, roles,
  channel lock/unlock/clear, word filter, auto-mod toggle, registrations
  toggle, audit log, restrictions view
- [C] Auto-mod: flood detection, repeat detection, severe-language auto-mute

### AI
- [C][V] AI tutor backed by GLM (z-ai-web-dev-sdk) with a study-focused system
  prompt
- [C][V] Conversation list, auto-titled from first message, delete, resume
- [C][V] Custom instructions (per conversation, saved)
- [C][V] Token quota: ~6.7k tokens/day per account with live progress bar
- [C][V] Flashcards: AI generates 6–12 cards from a chat, stored locally,
  flip/study/delete UI
- [C] Rate limiting per IP (20 msgs / 0.2 rps refill)

### Listen
- [C][V] Generative music engine: 23 seeded stations across 8 styles (lofi,
  chiptune, ambient, synthwave, house, jazz, trap, rock) — drums, bass, chords
  and melody synthesized live via Web Audio (nothing streams, nothing repeats
  identically)
- [C][V] Browse / Search / Discover, genre chips
- [C][V] Library: favourites, recents, queue (add/remove), playlists (create,
  add-to via dialog, delete)
- [C][V] Now-playing bar: play/pause, prev/next, seek, volume, favourite
- [C][V] Listen party: host broadcasts synced playback, member count, party
  chat (requires chat account)

### Watch
- [C][V] “Movy” — real catalog from the Internet Archive search API (cached
  30 min server-side): curated classic feature films + classic cartoons
  collection, with school-safety title filter
- [C][V] Tabs Movies / Anime / YouTube; sub-nav browse / saved / recent;
  categories trending / popular / top rated / favorites / continue; Load more
- [C][V] Player: archive.org embeds + YouTube (paste any link or 11-char ID,
  saved locally)
- [C][V] Save/favourite, star ratings (1–5, aggregated server-side), view
  counts, comments (guests post as “guest”, signed-in users with username),
  Up-next rail, report link

### Browse (the proxy — core feature)
- [C][V] Multi-tab browser UI: new/close tabs, back/forward per-tab history,
  address bar (URL or DuckDuckGo-lite search fallback), quick links, history
  (last 100, clearable), fullscreen mode
- [C][V] Server-side relay engine with:
  - SSRF guard: DNS resolution before connect; blocks private/loopback/link-
    local/CGNAT/multicast ranges for IPv4 + IPv6, `.local/.internal/.lan/…`
    hostnames, metadata endpoints
  - Redirect validation (max 5 hops, each re-checked)
  - Cookie jars per tab (isolated, TTL 30 min, capped)
  - 15 s timeout, 30 MB response cap, per-IP token-bucket rate limiting
  - HTML/CSS URL rewriting + injected client router (link clicks, form
    submits, fetch/XHR patching, location reporting via postMessage)
  - Header hygiene: never leaks app origin; referer only forwarded same-site
- [C][V] Proxied pages run inside a sandboxed iframe (`allow-scripts
  allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock`,
  no `allow-same-origin`)
- Verified in-browser against example.com, Hacker News (incl. sub-resources),
  DuckDuckGo Lite search, archive.org, MDN, Bing

### Reference features noted but intentionally approximated
- **[P]** Reference hosts 2,709 third-party games; Memphis ships 27 verified,
  actually-playable titles instead of dead embeds (no fake listings)
- **[P]** Reference streams commercial movies via unofficial sources; Memphis
  streams **public-domain** titles from the Internet Archive (legal + real)
- **[P]** Reference music streams from YouTube Music; Memphis synthesizes its
  own audio (no licensing, works offline)
- **[X]** Email login/verification codes (reference) — no mail server in this
  environment; replaced by username/password + recovery codes
- **[X]** en.wikipedia.org blocks the server runtime's TLS fingerprint from
  datacenter IPs (Varnish 403); other Wikipedia mirrors and hundreds of other
  sites work — noted for transparency

## Security model

- **Passwords**: scrypt (N=16384 default, 64-byte) with per-user salt;
  timing-safe comparison
- **Sessions**: 256-bit random tokens, 30-day expiry, revoked on logout/ban
- **Proxy SSRF**: see Browse above; every hop (including redirects) resolves
  and validates before connecting
- **Rate limits**: auth (5 reg/min, 10 login/5 min per IP), proxy (token
  bucket), AI (20/burst), comments (10/burst), reports (5/burst)
- **Chat auto-mod**: flood, repeat, severe-language filters with auto-mute;
  staff actions logged to ModAction + #logs
- **Client storage**: settings/favorites/history in localStorage only; auth
  token in localStorage (HTTPS recommended in production)
- **Proxied content**: sandboxed iframe without same-origin — it cannot touch
  the app's DOM, cookies or storage

## Data & persistence

| Data | Where |
|------|-------|
| Users, sessions, channels, messages, groups, friends, mod actions, game scores, watch stats/comments, AI conversations, token usage | SQLite (`db/custom.db`) via Prisma |
| Chat-service access | same file via bun:sqlite (WAL) |
| Settings, cloaks, favorites, history, playlists, flashcards, queue | browser localStorage |

Reset local data via **Settings → Data → Reset**.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Chat stuck on “…” / no channels | chat-service not running — `cd mini-services/chat-service && bun run dev` (port 3003); if you access the app through a different port/gateway, make sure `XTransformPort=3003` routing works |
| “The AI service is unavailable” | `/etc/.z-ai-config` (or `./.z-ai-config`) missing/invalid; AI needs valid Z.ai credentials |
| Watch catalog error page | Archive.org API unreachable or rate-limited; retry after a moment (30-min server cache) |
| A specific site 403s in Browse | Some sites (e.g. Wikipedia) block datacenter/non-browser TLS fingerprints; try the `https://` variant, a mirror, or another site |
| Proxy says “Private and local network addresses are blocked” | intentional SSRF protection; the destination resolved to an internal IP |
| `EADDRINUSE :3000` | another dev server instance is running; `pkill -f "next dev"` and restart |
| Database locked errors | ensure only one `db:push`/migrate at a time; WAL handles concurrent app + chat service |
| Games feel laggy | enable **Settings → Appearance → Reduce effects**; close other tabs |

---

*Memphis unBLACKed is an independent study portal built for educational use.
Games, tools and media are provided for educational purposes. All streamed
films are public domain via the Internet Archive.*
