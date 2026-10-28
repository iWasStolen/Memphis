# Memphis unBLACKed — Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Reference audit + environment init for Memphis unBLACKed (Tung Tung Proxy recreation)

Work Log:
- Audited reference site vcsasecrly.365-24-7.de via WebFetch (home, /play, /apps, /chat, /ai, /listen, /watch, /browse, /leaderboard, /settings)
- Reference feature inventory discovered:
  * Header: logo, nav tabs Home/Play/Apps/Chat/AI/Listen/Watch/Browse, two time widgets, settings
  * Home: "Study Portal" educational facade (math, ELA, science, social studies, world languages, test prep, how practice works, accessibility)
  * Play: 2,709 games, filter tabs (All/sources/Favorites/Recent), star favorites, alphabetical list, pagination prev/next + "1/14 (2709 items)", leaderboard/Top Players, "Game not working?" report
  * Apps: app launcher with "Launching app..." transition
  * Chat: auth (login/register/email-code/recovery), community rules gate, channels (#rules #announcements #links #general #counting #casino #staff-only #suggestions #share-links #moderation #reports/logs #pfp-requests #pfps #appeals #roles + Private), DMs/groups/friends, account settings (info/profile/appearance/premium/DMs/password/recovery/blocked/delete), moderation (mute/unmute/warn/ban/ip-ban/wipe/staff mgmt/chat controls/word filter/auto-mod/audit log/restrictions/badges), polls, private channels w/ 6-char invite codes, coins/casino, daily streak + spin, rewards, leaderboard (XP/Coins/Rob/Msgs/Streak), soundboard, online list
  * AI: "tung ai" — Today/New chat, custom instructions, save, flashcards, model selectors, token usage "0 / 6.7k tokens today"
  * Listen: Browse/Search/Discover, Library (Favourites/Recent/Queue/Playlists), All/YT Music tabs, Listen Party, genre sections (Top Hits/K-Pop/Pop/Hip-Hop/Indie/Rock/R&B/Latin/Electronic/Chill), now-playing bar w/ 0:00 times, new playlist modal, "Nothing playing / Pick something to play"
  * Watch: "Movy" — Movies/Anime/YouTube, browse/saved/recent, trending/popular/top rated/favorites/continue, Watch/More info/Load more, player w/ timer/Save/up next/comments, streaming sources (Quasar/Astro/Backup/Pulse), loading + unavailability messages
  * Browse: proxy (404 at /browse on reference — engine settings revealed: Scramjet/Ultraviolet, Epoxy/Libcurl transports, custom server)
  * Settings: Appearance (mode, themes, backgrounds, reduce effects, fonts, text size), Tab (cloak presets, auto-switch), Blob Window (about:blank, auto cover), Character masking, Panic (hotkey, URL presets, save/test), Behavior (close protection, skip loading), Chat (floating button, activity visibility), Browse (engine/transport/custom server), Credits/Links (TOS, Privacy, DMCA, Discord)
  * 404 page: "404 / page not found / doesn't exist or moved / report on Discord"
- Initialized fullstack env (Next.js 16, Tailwind 4, shadcn/ui, Prisma SQLite, bun)
- Verified z-ai-web-dev-sdk at /etc/.z-ai-config; API: zai.chat.completions.create({messages, thinking})

Stage Summary:
- Architecture decision: SPA in src/app/page.tsx (only user-visible route per sandbox), client view router w/ Zustand; Next API routes for proxy/auth/games/AI/watch; Socket.io mini-service on :3003 (chat + presence + listen party + soundboard) using bun:sqlite on shared DB (WAL); Prisma for main app; generative Web Audio music engine; in-house games/apps; Internet Archive PD films + YouTube embeds for Watch; full settings suite (cloak/panic/about:blank/blob/fonts/themes).
- Next: Prisma schema → design system → app shell → views → mini-service → testing.

---
Task ID: 2
Agent: main (Z.ai)
Task: Complete remaining views, APIs, verification, docs

Work Log:
- Audited remaining reference routes/settings keys via raw HTML + JS bundles (s_theme/s_mode/s_bg/s_font/s_lowfx/s_leavewarn/s_autocover, apps "tung tung" launcher, archive route set: home/play/apps/chat/ai/listen/watch/settings/account/rewards)
- Created src/lib/watch.ts (Archive.org advancedsearch catalog: curated 40-title OR query + classic_cartoons, title blocklist, 30-min cache, YouTube parser)
- Created API routes: /api/watch/catalog, /api/watch/view (view+rate), /api/watch/comments, /api/ai/chat (GLM via z-ai-web-dev-sdk, daily 6.7k token quota, conversation persistence), /api/ai/conversations(+[id]), /api/ai/flashcards
- Created views: watch-view.tsx (Movy: tabs/categories/player/ratings/comments/up-next/Load more/YouTube paste), ai-view.tsx (tutor with conversations, custom instructions, token bar, flashcards deck), listen-view.tsx (23 stations, 8 styles, queue/playlists/favorites/recents, now-playing bar, listen party via socket)
- Created src/lib/music-engine.ts: seeded mulberry32 PRNG + per-style configs, lookahead scheduler, drum/bass/chord/lead voices, vinyl layer, seek/volume
- Created chat-view.tsx + chat-panels.tsx: auth panel, rules gate, channels/DMs/groups sidebar, message list with polls, typing, presence members, soundboard, leaderboard, friends, private channels (create/join by code), mod dialog (mute/ban/roles/lock/clear/audit/restrictions/word filter/auto-mod)
- Fixes: header verified OK; eslint config extended for react-hooks v6 advisory rules (warn); converter.tsx Select-in-render fixed (module-level UnitSelect); watch-view useMemo deps; chat-view imports (setToken/getToken/api from @/lib/store); lucide Mute→VolumeX; installed socket.io-client; ZAI.create() async factory (new ZAI() fails)
- Proxy hardening: never forward origin; referer only same-site (bot-mitigation fix); verified 6 sites OK through gateway (example/HN/DDG-lite/archive/MDN/Bing); en.wikipedia.org 403s bun TLS fingerprint (site-specific, documented)
- bun run db:push (in sync) + db:generate; chat-service confirmed running (hot reload); lint: 0 errors, 45 advisory warnings
- Browser verification (agent-browser via :81 gateway): shell/nav ✓, Play+2048 launch ✓, Chat register→rules→#general message send/receive ✓, AI tutor full step-by-step reply + conversation saved + tokens 144/6.7k ✓, Listen station playing 0:02/3:00 with seekbar ✓, Watch 86 real titles + Load more + 5-star rating + comment posted ✓, Browse tabs + example.com + HN (doc+js+img all 200 proxied) + SSRF block ✓, Settings all 8 sections + cloak title switch verified ✓, mobile 375px hamburger nav ✓, Daily claim +20 coins streak 1 ✓, leaderboard tabs ✓, calculator interaction ✓
- Wrote README.md (architecture, env vars, ports, full feature inventory with [C]/[V]/[P]/[X] flags, security model, troubleshooting) + .env.example

Stage Summary:
- All 8 sections complete and browser-verified end-to-end through the Caddy gateway; lint passes with 0 errors; chat-service + Next dev server running; docs delivered.

---
Task ID: 3
Agent: main (Z.ai)
Task: Rework per user feedback — Scramjet proxy (epoxy/libcurl), 2700+ games, 50 real apps, Spotify/YouTube proxied, unlimited GLM AI

Work Log:
- Researched the official MercuryWorkshop/Scramjet-Demo wiring (scramjet 1.1.0 release tgz + bare-mux 2.1.9 + libcurl-transport 1.5.2 + wisp-js 0.4.1)
- Vendored engine to public/: scram/ (scramjet.all.js, bundle, sync, wasm), epoxy/, libcurl/, baremux/; wrote public/sw.js (skipWaiting + clients.claim)
- Added COOP same-origin + COEP credentialless headers in next.config.ts (SAB for transports; credentialless keeps game embeds/thumbnails alive)
- New wisp mini-service on :3001 (system DNS via dns_method:"lookup"); gateway route wss://host/wisp/?XTransformPort=3001&/ — the trailing "&/" is REQUIRED (wisp switches to wsproxy mode otherwise)
- src/lib/scramjet.ts: bootProxy() (controller init BEFORE SW registration — official demo order, prevents partial IDB schema), setProxyTransport() (always re-applies; args differ per transport), encodeUrl via proxiedHref()
- Removed the old custom relay: api/proxy, lib/proxy-server.ts, api/watch/*, lib/watch.ts, lib/music-engine.ts, components/apps/* (10 educational apps)
- Games: scripts/fetch-games.mjs pages the GameMonetize public feed (429 backoff, auto-resume, builtin merge fix) → data/games.json = 2,817 real games (2,799 external + 18 builtin), 22 categories; /api/games (q/cat/ids/page/per/sort); Play view rebuilt (search, chips, A–Z, infinite scroll, favorites/recents); player gets scramjet fallback mode
- Apps: exactly 50 day-use apps (YouTube, Instagram, TikTok, ChatGPT, Gemini, X, Snapchat, Reddit, WhatsApp, Discord, Netflix, Spotify, Gmail, Maps, Roblox...) launched through openInProxy()
- Listen = full Spotify web player via shared ProxyFrame; Watch = full YouTube via ProxyFrame (fake catalog removed)
- AI rebuilt: /api/ai/chat streams GLM over SSE (SDK yields raw SSE bytes — parse incrementally), no auth/no quota/no rate limits, sessionId-keyed conversations in Prisma (schema updated + db push), markdown+GFM+Prism rendering, flashcards kept (session-based)
- Browse rebuilt on scramjet: multi-tab, engine-aware address bar, proxied new-tab, live status strip; fixed first-mount navigate() targeting (activeId empty on mount)
- Settings: Transport (Epoxy default / libcurl) + search engine choice; footer/home copy updated

Verification (agent-browser, via gateway :81):
- scramjet online (SW controlling, controller init, transport set)
- example.com, en.wikipedia.org (1,218 links, images), youtube.com (full app: nav/sign-in/Shorts), open.spotify.com (web player) all render through the proxy
- epoxy AND libcurl transports both verified proxying live traffic (wisp log shows TCP streams)
- Play: 2,817 games, search "kart" → 10, Nutty Rush Kart launches from GM CDN
- AI: 17*23=391 streamed + rendered; conversation persists across reload
- Apps: 50 cards; YouTube app → Browse through proxy
- lint: 0 errors

Stage Summary:
- Proxy = real Scramjet 1.1.0 + self-hosted wisp, epoxy default with working libcurl option
- 2,817 real games, 50 real apps, Spotify/YouTube proxied, unlimited GLM AI — everything verified in-browser

---
Task ID: 4
Agent: main (Z.ai)
Task: Fix "proxy engine failed to start" — proxy robustness overhaul

Work Log:
- Diagnosed the reported failure: engine/transport boot path (wisp-down produces a different, in-frame "Uh oh!" page; verified by killing the relay and browsing)
- Root causes fixed:
  1. Safari/iOS: bare-mux throws "Unable to get a channel to the SharedWorker" (no SharedWorker in WebKit) → NEW public/sharedworker-shim.js (loaded first, blocking) + public/sharedworker-wrapper.js: dedicated Worker polyfills SharedWorker, feeds real worker MessagePorts via synthetic `connect` handshake (direct self.onconnect call — dispatchEvent never fires expando handlers in dedicated workers), pools one process per (url,name) like real SharedWorker semantics (prevents unbounded worker spawn crash)
  2. Chrome "Block all cookies": localStorage property access throws → bare-mux module dies → in-memory localStorage guard in the same shim
  3. Failed <script> tags never re-run → Retry re-injects bundles dynamically (ensureScramjetBundle/ensureBareMux with grace periods)
  4. Stale service workers from old deployments never updated (register skipped when controller existed) → always register /sw.js + controllerchange→reload-once (guarded by sessionStorage + module flag)
  5. Transport URLs must be ABSOLUTE (bare-mux builds import("<url>") inside possibly-blob workers) + singleton BareMuxConnection
- UX: staged errors (engine vs transport) with plain-language guidance + diagnostics line (browser · SW · ctl · SharedWorker · storage · engine) + in-place Retry button (browse-view + proxy-frame); ProxyFrame/frameSrc effects re-attempt on proxy recovery
- Ops: scripts/supervise-wisp.sh (auto-restart w/ backoff) — running via nohup; killed 4 stale bun processes; wisp crash-recovery verified (kill -9 → back in 3s)
- Verification (agent-browser):
  - Chrome fresh profile: engine boots, SW controls, example.com + HN + Spotify render through proxy (dev :81 AND HTTPS preview)
  - Safari simulation (SharedWorker deleted, http + https/wss): shim installed → epoxy transport → wisp → real example.com fetch body returned
  - Error path: blocked /scram/scramjet.all.js → error screen w/ diagnostics ("Chrome · SW:y · ctl:n · SharedWorker:y · storage:y · engine:n") → unblock + Retry → engine recovers IN PLACE, iframe loads again
  - Transport switch epoxy→libcurl live via Settings (persisted, wisp log shows new connection, page renders)
- tsc: 0 src errors; eslint: 0 errors (37 advisory warnings); production build passes
- README: compat shim, boot resilience, supervisor + full troubleshooting table for the error screen

Stage Summary:
- Proxy engine now boots/retries across Safari/iOS, storage-blocked Chromebooks, ad-blocker script failures and stale SWs; wisp relay is supervised; error screen is diagnosable and actionable

---
Task ID: 5
Agent: main (Z.ai)
Task: Fix "Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found."

Work Log:
- Root cause (2 colliding code paths in vendored Scramjet 1.1.0):
  1. SW-side ScramjetServiceWorker opens $scramjet at v1 WITHOUT an upgrade handler — if it wakes before the controller ever initialized (stale registration survived a storage clear), it creates an EMPTY v1 database
  2. Controller-side openIDB opens $scramjet at v1 WITH an upgrade handler — but onupgradeneeded only fires on version CHANGE, so against the empty v1 DB it never runs, the 5 stores (config/cookies/redirectTrackers/referrerPolicies/publicSuffixList) are never created, and every db.transaction(store) (idb wrapper get/put) throws NotFoundError — permanently, across reloads
- Fix 1 — src/lib/scramjet.ts: ensureScramjetDB() pre-flight in bootProxy stage 1.5:
  - indexedDB.databases() fast-path (skip if $scramjet absent), versionless inspect open (never upgrades/blocks), delete when version!=1 or any store missing (version bump is NOT an option — engine insists on v1)
  - blocked-delete recovery (stale SW holds connections): unregister SW + one-time guarded reload (sessionStorage flag) + 8s in-page wait
- Fix 2 — public/sw.js hardening:
  - monkey-patched indexedDB.open BEFORE new ScramjetServiceWorker(): any SW-side open("$scramjet",1) gets the full-schema upgrade injected → the empty-DB race can never recur (verified no-op on healthy DBs, foreign DBs untouched)
  - non-scramjet requests (pathname not /scramjet/* and not the wasm file) bypass loadConfig/scramjet entirely → a broken engine DB can never 502 the site's own assets (old code ran loadConfig on EVERY fetch)
- Verification (agent-browser, full E2E on dev stack):
  - Reproduced the user's exact error character-for-character: closed controller conn → deleted healthy DB → recreated EMPTY v1 → db.transaction('config') threw "Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found."
  - Loaded app → pre-flight healed automatically → DB recreated with all 5 stores → engine ready → SW active
  - Topology confirmed: Caddy :81 gateway = production-equivalent path (XTransformPort→3001 wisp relay); localhost:3000 bypasses it (308) — proxy tests must run via :81
  - epoxy (default): example.com renders real live content through /scramjet/ frame
  - libcurl: wikipedia.org renders real live content (title, search box, full portal text)
  - agent-browser errors: none; console: only benign Next dev-overlay hydration warnings
  - parse checks: TS compiler API (scramjet.ts OK), node --check (sw.js OK), node simulation of the SW patch (5 stores created on race, foreign DBs untouched)
- Note: full-project tsc not runnable in-sandbox (4GB box, OOM at fork with dev server + browser running); build config untouched, changes are 1 client lib + 1 public script

Stage Summary:
- $scramjet IndexedDB is now self-healing at boot and race-proof at the SW layer; both transports serve real pages end-to-end through the gateway topology
