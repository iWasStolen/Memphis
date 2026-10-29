/**
 * Memphis unBLACKed — POPULAR games catalog builder (v2)
 *
 * Builds data/games.json from two sources:
 *
 *   1. data/games.json (existing) — the 62 hand-verified curated games
 *      (official sites, Scratch, GitHub Pages, KBHgames, Gameflare) plus
 *      the 12 built-in canvas games. Kept as-is at the top of the catalog.
 *
 *   2. data/gameflare-listing.json — scraped popularity-ranked candidates
 *      from GameFlare (scripts/fetch-gameflare-listing.mjs). GameFlare embed
 *      URLs (gameflare.com/embed/{slug}/) render clean, chrome-free, playable
 *      games in cross-origin iframes — verified in a real browser.
 *
 * Every new entry is verified live at build time:
 *   - embed URL returns HTTP 200 (following redirects)
 *   - no X-Frame-Options deny/sameorigin
 *   - no CSP frame-ancestors restricting embedding
 *
 * Candidates are ranked by play count so the catalog is genuinely the
 * most-played (≈ most well-known) games, and deduped against the curated
 * set by both GameFlare slug and normalized title.
 *
 * Run: node scripts/build-games-catalog.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/* how many GameFlare games to aim for after verification */
const TARGET_NEW = 1500;
/* accept candidates down to this play count if needed to hit the target */
const MIN_PLAYS = 5000;

/* ---------------------------------------------------------------
   GameFlare category → Memphis taxonomy.
   Priority tiers: lower tier number wins when a game carries several
   matching categories. Tier 0 = franchise-specific overrides.
   --------------------------------------------------------------- */

const CAT_MAP = [
  /* tier 0 — strong franchise signals (order matters within a tier) */
  { ours: "horror", cats: ["fnaf", "murder", "vampire", "mummy", "russian-roulette"], tier: 0 },
  { ours: "rhythm", cats: ["music", "dance"], tier: 0 },
  { ours: "sandbox", cats: ["minecraft", "kogama", "gta", "sandbox", "lego", "creative"], tier: 0 },
  { ours: "strategy", cats: ["tower-defense", "base-defense"], tier: 0 },
  { ours: "idle", cats: ["idle"], tier: 0 },
  { ours: "card", cats: ["solitaire", "chess", "poker", "ludo", "domino", "casino", "checkers", "monopoly", "card", "board"], tier: 0 },
  { ours: "arcade", cats: ["flappy-bird", "pacman", "bomberman", "snake", "pinball", "tron", "yeti-sports", "angry-birds", "zuma"], tier: 0 },
  { ours: "puzzle", cats: ["tetris", "sudoku", "mahjong", "connect"], tier: 0 },
  { ours: "sports", cats: ["billiards"], tier: 0 },
  { ours: "simulation", cats: ["papa-s", "cooking", "farm", "hospital", "dentist", "doctor", "surgery", "salon", "hotel", "zoo", "restaurant", "service", "tycoon", "business", "company", "dinosaur-park"], tier: 0 },
  { ours: "casual", cats: ["girls", "dress-up", "barbie", "princess", "wedding", "paco", "kids", "coloring", "painting", "cleaning", "makeover"], tier: 0 },
  { ours: "horror", cats: ["horror", "bloody", "creepy"], tier: 0 },

  /* tier 1 — core genres */
  { ours: "io", cats: ["io", "battle-royale"], tier: 1 },
  { ours: "shooter", cats: ["shooting", "sniper", "fps", "tank", "hunting", "archery", "worms"], tier: 1 },
  { ours: "racing", cats: ["racing", "car", "bike", "motorcycle", "karting", "drifting", "parking", "truck", "formula", "rally", "nascar", "bmx", "stunt", "traffic", "police-chase", "taxi", "drunk", "jet-ski", "rafting", "kayak", "snowmobile", "ski", "snowboarding", "skateboarding", "surfing", "wake-up"], tier: 1 },
  { ours: "sports", cats: ["sports", "soccer", "basketball", "tennis", "pool", "golf", "bowling", "hockey", "baseball", "volleyball", "air-hockey", "badminton", "swimming", "penalty-shootout", "hurdle-race", "javelin-throwing", "wrestling", "american-football", "rugby", "diving", "skateboarding"], tier: 1 },
  { ours: "platformer", cats: ["platform", "parkour", "obby", "jumping", "running"], tier: 1 },
  { ours: "fighting", cats: ["fighting", "boxing", "karate", "kung-fu-panda", "samurai", "anime"], tier: 1 },
  { ours: "puzzle", cats: ["puzzle", "brain", "maze", "logic", "merge", "physics", "drawing", "finding-things", "spot-the-difference", "jigsaw", "observation", "jewel"], tier: 1 },
  { ours: "strategy", cats: ["strategy", "building", "capture", "management"], tier: 1 },
  { ours: "adventure", cats: ["adventure", "rpg", "escape", "detective", "treasure", "survival", "pirate", "viking", "wild-west", "prison-break", "secret-agent", "agent", "rescue"], tier: 1 },
  { ours: "card", cats: ["tarot"], tier: 1 },
  { ours: "simulation", cats: ["simulator", "mini-golf"], tier: 1 },
  { ours: "casual", cats: ["casual", "funny", "cartoon", "tv-show", "christmas", "halloween", "easter", "santa-claus", "winter", "summer"], tier: 1 },

  /* tier 2 — broad buckets */
  { ours: "action", cats: ["action", "war", "zombie", "battle", "ninja", "soldier", "terrorist", "gangster", "mafia", "knight", "gladiator", "swords", "dragon", "wizard", "magic", "space", "alien", "robot", "dinosaur", "shark", "bear", "wolf", "spiderman", "superman", "iron-man", "batman", "super-hero", "marvel", "star-wars", "sonic", "ben-10", "kung-fu-panda", "samurai", "assassin", "revenge", "destroy", "bomb", "dynamite", "knife-throwing", "throwing", "elevator", "police", "fireman", "thief", "virus", "microbe", "medal", "historical", "cyberpunk", "future", "arena", "crazy", "police-chase"], tier: 2 },
  { ours: "arcade", cats: ["arcade", "skill", "high-score", "classic", "retro", "y8", "collection", "obstacle", "one-button", "upgrade", "training", "flying", "gravity", "helicopter", "rocket", "balloon", "fruit", "hamburger", "assembly", "liquid", "wake-up", "animal", "bird", "penguin", "monkey", "bear"], tier: 2 },
  { ours: "io", cats: ["multiplayer", "social"], tier: 2 },
  { ours: "two-player", cats: ["two-players", "3-player", "4-player"], tier: 2 },
];

/* a few classics whose GameFlare categories don't reveal their true genre */
const TITLE_OVERRIDES = [
  [/monopoly/i, "card"],
  [/whack (your|the) (boss|ex|neighbor|computer|phone)/i, "casual"],
  [/(run ?3|run ninja run|slope run)/i, "platformer"],
  [/age of war/i, "strategy"],
];

/* Memphis category labels */
const CAT_LABELS = {
  io: ".io Arena", shooter: "Shooter", action: "Action", arcade: "Arcade",
  puzzle: "Puzzle", platformer: "Platformer", racing: "Racing", sports: "Sports",
  adventure: "Adventure", strategy: "Strategy", idle: "Idle", horror: "Horror",
  card: "Cards & Board", rhythm: "Rhythm", sandbox: "Sandbox", simulation: "Simulation",
  casual: "Casual", "two-player": "2 Player", classic: "Classics", trivia: "Trivia",
};

/* natural player sizes per category */
const SIZES = {
  arcade: [960, 600], shooter: [960, 600], io: [960, 640], sports: [960, 640],
  platformer: [960, 640], classic: [960, 640], puzzle: [960, 640],
  idle: [960, 600], racing: [960, 540], sandbox: [960, 540], trivia: [960, 600],
  rhythm: [960, 640], action: [960, 600], adventure: [960, 600], horror: [960, 600],
  strategy: [960, 600], card: [960, 640], simulation: [960, 600], casual: [800, 600],
  "two-player": [960, 640],
};

/* franchise names worth keeping as search tags */
const FRANCHISE_TAGS = new Set([
  "fnaf", "minecraft", "kogama", "gta", "lego", "sonic", "spiderman", "superman",
  "iron-man", "batman", "super-hero", "marvel", "star-wars", "ben-10", "papa-s",
  "angry-birds", "flappy-bird", "pacman", "bomberman", "tetris", "sudoku",
  "solitaire", "mahjong", "chess", "snake", "pinball", "zuma", "worms", "tron",
  "the-simpsons", "toy-story", "kung-fu-panda", "yeti-sports", "monopoly",
  "bomberman", "dragon", "wild-west", "cyberpunk", "y8", "retro", "classic",
  "sprunki", "fnaf", "zombie", "kogama", "obby",
]);

const normTitle = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* map a game's GameFlare categories → (our category, tags) */
function mapCategories(gfCats, title) {
  const catSet = new Set(gfCats.map((c) => c.replace(/-games$/, "")));
  let best = null; /* { ours, tier } */
  for (const rule of CAT_MAP) {
    if (best && rule.tier >= best.tier) continue;
    if (rule.cats.some((c) => catSet.has(c))) {
      if (!best || rule.tier < best.tier) best = { ours: rule.ours, tier: rule.tier };
    }
  }
  let category = best?.ours || "arcade";
  /* title overrides for classics whose categories mislead */
  for (const [re, cat] of TITLE_OVERRIDES) {
    if (re.test(title)) {
      category = cat;
      break;
    }
  }
  const tags = [];
  for (const c of catSet) {
    if (tags.length >= 6) break;
    if (FRANCHISE_TAGS.has(c) && c !== category) tags.push(c);
  }
  return { category, tags };
}

/* ---------------- verification ---------------- */

/* hosts that provably refuse to be framed (verified with real-browser
   render tests + header checks) — games whose embed page sources the
   actual game from one of these are dead embeds */
const BLOCKED_HOSTS = [
  "crazygames.com",
  "playhop.com",
  "kogama.com",
  "poki.com",
  "twoplayergames.org",
];

/* hosts that are proven-good inner sources (GameFlare's own infra and
   game CDNs designed for embedding) — skip the second header check */
const TRUSTED_HOSTS = [
  "gameflare.com",
  "gamesflare.org",
  "data.gameflare.com",
  "html5.gamedistribution.com",
  "gamedistribution.com",
  "scratch.mit.edu",
  "kdata1.com",
];

function checkFrameHeaders(head) {
  /* any XFO deny/sameorigin in the redirect chain, or a restrictive
     CSP frame-ancestors on the final response → blocked */
  if (/^x-frame-options:\s*(deny|sameorigin)/im.test(head)) return "X-Frame-Options";
  const csp = [...head.matchAll(/^content-security-policy:\s*(.+)$/gim)].map((m) => m[1]);
  for (const c of csp) {
    const fa = /frame-ancestors[^;]*/i.exec(c)?.[0] || "";
    if (fa && !fa.includes("*")) return `CSP ${fa.trim().slice(0, 40)}`;
  }
  return null;
}

async function curlHead(url) {
  const { stdout } = await execFileP("curl", ["-sIL", "--max-time", "20", "-A", UA, url], { timeout: 25000 });
  return stdout;
}

async function curlBody(url) {
  const { stdout } = await execFileP(
    "curl",
    ["-sL", "--compressed", "--max-time", "20", "-A", UA, url],
    { timeout: 25000, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}

const hostOf = (u) => {
  try {
    return new URL(u, "https://www.gameflare.com/").hostname;
  } catch {
    return "";
  }
};

/* full verification: the gameflare wrapper must be embeddable AND the
   actual game host inside it must not refuse iframes. Wrapper pages with
   no static iframe host the game themselves via JS — those are fine
   (render-tested: 8 Ball Pool, Cartoon Strike, SSF2, Mine Clone). */
async function verifyEmbed(slug) {
  const url = `https://www.gameflare.com/embed/${slug}/`;
  try {
    const body = await curlBody(url);
    if (!body) return { ok: false, why: "empty body" };
    if (/<title>[^<]*(not exist|404)/i.test(body)) return { ok: false, why: "404 page" };

    /* 1. wrapper headers */
    const head = await curlHead(url);
    const code = [...head.matchAll(/^HTTP\/[\d.]+\s+(\d+)/gim)].map((m) => m[1]).pop() || "0";
    if (code !== "200") return { ok: false, why: `HTTP ${code}` };
    const wrapperBlock = checkFrameHeaders(head);
    if (wrapperBlock) return { ok: false, why: `wrapper ${wrapperBlock}` };

    /* 2. inner game host. Embed pages use a lazy-load pattern:
         <iframe src="gameflare.com/loading/" data-src="REAL_GAME_URL">
       so data-src wins; a plain non-loading src is the legacy pattern;
       no iframe at all means the game is self-hosted JS (render-tested). */
    const inner =
      /<iframe[^>]*\sdata-src="([^"]+)"/.exec(body)?.[1] ||
      [...body.matchAll(/<iframe[^>]*\ssrc="([^"]+)"/g)]
        .map((m) => m[1])
        .find((u) => !u.includes("gameflare.com/loading"));
    if (!inner) return { ok: true, url, inner: "(self-hosted)" };

    const host = hostOf(inner);
    if (BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
      return { ok: false, why: `blocked host ${host}` };
    }
    if (TRUSTED_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) {
      return { ok: true, url, inner: host };
    }
    /* unknown third-party host — verify it directly */
    const innerHead = await curlHead(new URL(inner, url).href);
    const innerCode = [...innerHead.matchAll(/^HTTP\/[\d.]+\s+(\d+)/gim)].map((m) => m[1]).pop() || "0";
    if (innerCode !== "200") return { ok: false, why: `inner HTTP ${innerCode} (${host})` };
    const innerBlock = checkFrameHeaders(innerHead);
    if (innerBlock) return { ok: false, why: `inner ${innerBlock} (${host})` };
    return { ok: true, url, inner: host };
  } catch (e) {
    return { ok: false, why: e.message.slice(0, 60) };
  }
}

/* bounded-concurrency map */
async function pool(items, worker, concurrency) {
  const queue = [...items];
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const i = next++;
      const item = queue.shift();
      out[i] = await worker(item, i);
    }
  });
  await Promise.all(runners);
  return out;
}

/* ---------------- main ---------------- */

const dataDir = path.join(process.cwd(), "data");
const existing = JSON.parse(await readFile(path.join(dataDir, "games.json"), "utf8"));
const listing = JSON.parse(await readFile(path.join(dataDir, "gameflare-listing.json"), "utf8"));

/* --- dedupe keys from the existing catalog ---
   only the hand-curated (non-gf-) entries block candidates; gf- entries
   from a previous build are re-generated from the listing, never skipped */
const curatedSource = existing.games.filter((g) => !g.b && !g.id.startsWith("gf-"));
const takenTitles = new Set();
const takenSlugs = new Set();
for (const g of curatedSource) {
  takenTitles.add(normTitle(g.t));
  let slug = "";
  try {
    const m = /gameflare\.com\/embed\/([a-z0-9-]+)/.exec(g.u || "");
    if (m) slug = m[1];
  } catch {}
  if (slug) takenSlugs.add(slug);
}

/* --- select candidates --- */
const candidates = listing.games.filter(
  (g) =>
    g.tech === "HTML5" &&
    !takenSlugs.has(g.slug) &&
    !takenTitles.has(normTitle(g.title)) &&
    g.plays >= MIN_PLAYS &&
    g.title &&
    g.title.length >= 2
);

/* dedupe among candidates by normalized title (GameFlare sometimes has dupes) */
const seenTitles = new Set();
const unique = [];
for (const g of candidates) {
  const k = normTitle(g.title);
  if (seenTitles.has(k)) continue;
  seenTitles.add(k);
  unique.push(g);
}

/* take a buffer above target — verification will drop some */
/* deeper buffer: the strict inner-host verification drops ~15% */
const selected = unique.slice(0, TARGET_NEW + 400);
console.log(
  `${listing.games.length} scraped → ${candidates.length} after filters → ${unique.length} unique → verifying top ${selected.length} (plays ≥ ${selected[selected.length - 1]?.plays?.toLocaleString()})`
);

/* --- verify embeds (20 concurrent) --- */
const t0 = Date.now();
let done = 0;
const verified = await pool(selected, async (g) => {
  const r = await verifyEmbed(g.slug);
  done++;
  if (done % 200 === 0) console.log(`  verified ${done}/${selected.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  return { g, ...r };
}, 20);

const okGames = verified.filter((v) => v.ok);
const failed = verified.filter((v) => !v.ok);
console.log(`verified ${okGames.length} ok, ${failed.length} failed in ${Math.round((Date.now() - t0) / 1000)}s`);
if (failed.length > 0 && failed.length < 30) {
  for (const f of failed) console.log(`  DROP ${f.g.slug}: ${f.why}`);
}

/* --- compose new entries --- */
const newGames = okGames.slice(0, TARGET_NEW).map(({ g }) => {
  const { category, tags } = mapCategories(g.cats, g.title);
  const [w, h] = SIZES[category] || [960, 600];
  let desc = (g.desc || "").trim();
  if (desc.length < 40) {
    desc = `${g.title} — a popular ${CAT_LABELS[category]?.toLowerCase() || category} game with ${g.plays.toLocaleString()} plays. Play free in the browser.`;
  }
  return {
    id: `gf-${g.slug}`,
    t: g.title,
    d: desc,
    u: `https://www.gameflare.com/embed/${g.slug}/`,
    px: 0,
    c: category,
    g: tags,
    th: g.thumb || "",
    w,
    h,
    b: 0,
  };
});

/* --- assemble final catalog: curated → new (by plays) → builtins ---
   idempotent: only non-gf external games count as curated, so re-running
   the build never duplicates the GameFlare batch from a previous run */
const curated = existing.games.filter((g) => !g.b && !g.id.startsWith("gf-"));
const builtins = existing.games.filter((g) => g.b);
const games = [...curated, ...newGames, ...builtins];

/* --- category meta with live counts --- */
const counts = new Map();
for (const g of games) counts.set(g.c, (counts.get(g.c) || 0) + 1);
const categories = [...counts.entries()]
  .map(([slug, count]) => ({ slug, label: CAT_LABELS[slug] || slug, count }))
  .sort((a, b) => b.count - a.count);

const catalog = {
  generatedAt: new Date().toISOString(),
  source:
    "hand-curated popular games + GameFlare most-played catalog (verified embeddable) + built-in",
  total: games.length,
  categories,
  games,
};

const out = path.join(dataDir, "games.json");
await writeFile(out, JSON.stringify(catalog, null, 1));
console.log(
  `\nWrote ${games.length} games (${curated.length} curated + ${newGames.length} GameFlare + ${builtins.length} built-in) → ${out}`
);
console.log(`size: ${(JSON.stringify(catalog).length / 1024).toFixed(0)} KB`);
console.log(`categories: ${categories.map((c) => `${c.slug}=${c.count}`).join(" ")}`);
