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
