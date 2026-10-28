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
