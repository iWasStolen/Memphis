/**
 * Memphis unBLACKed — BULK import every game from the tung tung reference
 * (vcsasecrly.365-24-7.de) into data/games.json.
 *
 * merge-tungtung-games.mjs adds a hand-picked ~100 titles with hand-written
 * descriptions ("tt-" ids). This script imports EVERYTHING ELSE the
 * reference ships, so the Memphis catalog matches the reference /play
 * section title-for-title:
 *
 *   mf113660 = 3kh0    (370) — PUBLIC jsdelivr CDN (github.com/zennedu/3kh)
 *   m8f04680 = hydra   (872) — PUBLIC jsdelivr CDN (github.com/zennedu/hydra)
 *   mc4d5af1 = gn-math (809) — self-hosted "study2/" on the reference domain
 *   m882f408 = seraph  (468) — self-hosted "study/"  on the reference domain
 *   m630d80d = ports   (107) — self-hosted "/k/"    on the reference domain
 *   m576e992 = tglsc   (83)  — self-hosted "/k/"    on the reference domain
 *
 * Rules:
 *   - dedupe by normalized title against the WHOLE existing catalog
 *     (curated + tt- + gf- + builtins), and by URL inside the batch
 *   - when a title exists in several lists, jsdelivr-backed wins
 *     (public CDN outlives any proxy domain)
 *   - every embed verified live at import time, same rules as always:
 *       HTTP 200 · no X-Frame-Options deny/sameorigin · no CSP
 *       frame-ancestors · content-type html or text/plain
 *     (jsdelivr serves .html as text/plain — the player's srcdoc mode
 *      fetches those cross-origin and injects a <base>, so they pass)
 *   - thumbnails HEAD-checked, dropped when they 404
 *   - categories from a tiered title-keyword classifier (the reference
 *     lists carry no genre info — "category" is just the list name)
 *   - junk entries (numeric-only names like "1", too-short names) skipped
 *   - entries get "tta-" ids and the batch is fully rebuilt on re-run,
 *     so the script is idempotent and never duplicates
 *
 * Run: node scripts/import-all-tungtung.mjs [--dry]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const REF = "https://vcsasecrly.365-24-7.de";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/* jsdelivr-backed lists first — public CDN > private reference domain */
const LISTS = [
  { key: "mf113660", name: "3kh0", label: "3kh0", jsdelivr: true },
  { key: "m8f04680", name: "hydra", label: "Hydra", jsdelivr: true },
  { key: "mc4d5af1", name: "gn-math", label: "gn-math", jsdelivr: false },
  { key: "m882f408", name: "seraph", label: "Seraph", jsdelivr: false },
  { key: "m630d80d", name: "ports", label: "reference ports", jsdelivr: false },
  { key: "m576e992", name: "tglsc", label: "TGL", jsdelivr: false },
];

const LIST_LABEL = Object.fromEntries(LISTS.map((l) => [l.name, l.label]));

/* ---------------------------------------------------------------
   helpers
   --------------------------------------------------------------- */
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* prettify all-lowercase names ("subway surfers" → "Subway Surfers")
   while protecting acronyms (fnf, fnaf, io, gta…) and dotted names
   ("1v1.lol", "agar.io") which are left untouched */
const PROTECT = new Set([
  "io", "lol", "fnf", "fnaf", "td", "rpg", "gta", "fps", "id", "vs", "hd",
  "nes", "snes", "gba", "nds", "3d", "2d", "vr", "tv", "dj", "mc", "x", "y",
]);
const SMALL = new Set(["a", "an", "the", "of", "and", "or", "to", "in", "on", "for", "at", "by"]);

function prettyTitle(raw) {
  const name = (raw || "").replace(/\s+/g, " ").trim();
  /* only touch pure lowercase names without dots */
  if (!/^[a-z0-9\s&':!,?+-]+$/.test(name)) return name;
  return name
    .split(" ")
    .map((w, i) => {
      if (PROTECT.has(w)) return w;
      if (/\d/.test(w)) return w; /* "3", "2player" stay as-is */
      if (w.length === 1) return i === 0 ? w.toUpperCase() : w;
      if (SMALL.has(w) && i !== 0) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** STRICT embed verification — same rules as every other batch.
 *  Returns the page HTML too, so phase 2 can extract the game's
 *  runtime asset URLs without a second fetch. */
async function verifyEmbed(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (res.status !== 200) return { err: `HTTP ${res.status}` };
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if (xfo.includes("deny") || xfo.includes("sameorigin")) return { err: `XFO ${xfo}` };
    const csp = (res.headers.get("content-security-policy") || "").toLowerCase();
    const fa = csp.match(/frame-ancestors([^;]*)/);
    if (fa && !fa[1].includes("*")) return { err: `CSP frame-ancestors${fa[1]}` };
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return { err: `content-type ${ct}` };
    return { err: null, html: await res.text() };
  } catch (e) {
    return { err: e.name === "TimeoutError" ? "timeout" : String(e).slice(0, 60) };
  }
}

/* ---------------------------------------------------------------
   payload verification — a page that 200s can still be a dead game:
   jsdelivr has banned whole users (e.g. genizy) for AUP violations,
   so every game whose build files live under gh/genizy/* returns
   403 and renders a blank white canvas. Extract each page's
   game-critical asset URLs and probe them:

     - absolute src=/href= attributes with payload extensions
       (.js/.wasm/.data/.unityweb/.json — analytics excluded)
     - any absolute quoted URL with .wasm/.unityweb/.data
     - Unity pattern: buildUrl = "https://…" + quoted
       "/….loader.js"-style paths resolved against it

   A game is dropped only when an asset answers ≥ 400 — network
   errors/timeouts count as unverifiable, not dead (no false drops).
   --------------------------------------------------------------- */
const CRITICAL_EXT = /\.(js|wasm|data|unityweb|jsgz|datagz|wasmgz|json)(\?|#|$)/i;
const ANALYTICS = /googletagmanager|google-analytics|gtag|cloudflareinsights|doubleclick|hotjar|segment\.io|whatbrowser/;
/* legacy shims a modern browser doesn't need — a dead URL here does
   NOT mean a dead game (the script tag just fails silently) */
const OPTIONAL_POLYFILL = /polyfill\.io|ie7-js\.googlecode\.com|html5shiv|oss\.maxcdn\.com\/respond|cdnjs\.cloudflare\.com\/ajax\/libs\/html5shiv|cdn\.jsdelivr\.net\/npm\/babel-polyfill/;

function extractCritical(html, pageUrl) {
  const urls = new Set();
  /* 1. absolute src=/href= attributes */
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const u = m[1];
    if (/^https?:\/\//.test(u) && CRITICAL_EXT.test(u) && !ANALYTICS.test(u) && !OPTIONAL_POLYFILL.test(u)) urls.add(u);
  }
  /* 2. absolute quoted strings with engine payload extensions */
  for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:wasm|unityweb|data)[^"']*)["']/gi)) {
    if (!ANALYTICS.test(m[1]) && !OPTIONAL_POLYFILL.test(m[1])) urls.add(m[1]);
  }
  /* 3. Unity buildUrl + relative build-file paths */
  const builds = [...html.matchAll(/buildUrl\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  if (builds.length) {
    for (const m of html.matchAll(/["'](\/?[^"']*\.(?:loader\.js|framework\.js[^"']*|wasm|unityweb|data))(?:\.br|\.gz)?["']/gi)) {
      const p = m[1];
      if (!p.startsWith("http") && !/https?:/.test(p)) {
        for (const b of builds) {
          try {
            urls.add(new URL(p.replace(/^\//, ""), b.endsWith("/") ? b : b + "/").href);
          } catch { /* ignore malformed */ }
        }
      }
    }
  }
  return [...urls].slice(0, 8);
}

/** ranged GET: 2xx/3xx = alive, ≥400 = dead, network error = unknown */
async function assetDead(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Range: "bytes=0-1" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    return res.status >= 400;
  } catch {
    return false; /* unverifiable ≠ dead */
  }
}

async function checkThumb(url) {
  if (!url) return "";
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? url : "";
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------------
   title-keyword classifier — the reference lists carry no genre
   info, so categories come from the title. Ordered rules, first
   match wins; strongest franchise signals live at the top.
   --------------------------------------------------------------- */
const RULES = [
  [/fnf|friday night|funkin|sprunki|incredibox|vocaloid|guitar hero|beat ?saber|rhythm|dance ?dance|\bosu\b/i, "rhythm"],
  [/solitaire|freecell|black ?jack|poker|chess|checkers|domino|monopoly|\buno\b|tarot|\bhearts\b|\bspades\b|\bcards?\b|euchre|gin rummy/i, "card"],
  [/\bidle\b|clicker|incremental|prestige|adventure capitalist/i, "idle"],
  [/five nights|fnaf|freddy|granny|slender|horror|creepy|scary|poppy|banban|\bpiggy\b|jumpscare|resident evil|\bevil\b|\bnun\b|haunt|nightmare|sons of the forest/i, "horror"],
  [/minecraft|kogama|\bgta\b|grand theft|roblox|terraria|\blegos?\b|sandbox|minetest/i, "sandbox"],
  [/papa'?s|cooking|cook ?off|bakery|baking|restaurant|sushi|pizza|burger|hot ?dog|barista|coffee|farm|harvest|tycoon|surgery|surgeon|dentist|doctor|hospital|salon|barber|hotel|\bzoo\b|simulat|mechanic|garage|vet clinic/i, "simulation"],
  [/soccer|football|basketball|hoops|dunk|billiard|\bpool\b|8 ?ball|snooker|golf|mini ?golf|bowling|tennis|hockey|baseball|volleyball|badminton|cricket|boxing|wrestling|olympic|penalt|free ?kick|stadium|ski ?jump|snowboard|skateboard|archery king|darts/i, "sports"],
  [/racing|\brace\b|racer|drift|kart|\bmoto|motorcycle|\bbikes?\b|\bbmx\b|truck|parking|traffic|highway|rally|nascar|formula|\bstunts?\b|police chase|\btaxi\b|road ?rage|\bcars?\b|happy wheels|traffic runner|motor ?bike|drag ?race/i, "racing"],
  [/2 ?players?|two ?players?|1 ?vs ?1|1v1|versus|\bduel\b/i, "two-player"],
  [/\.io\b/i, "io"],
  [/shoot|gunne|\bguns?\b|\bfps\b|sniper|strike|bullet|\bdoom\b|\bhalo\b|call of duty|counter|paintball|archer|\barrows?\b|\btanks?\b|weapon|ammo|crosshair|battlefield|team fortress|left 4 dead|pixel warfare|shell shockers|krunker/i, "shooter"],
  [/fight|combat|mortal kombat|street fighter|tekken|brawl|smash|karate|kung ?fu|judo|\bmma\b/i, "fighting"],
  [/mario|sonic|platform|parkour|obby|\bvex\b|run ?3|\bslope\b|geometry dash|doodle ?jump|jumping|jump ?on|fireboy|watergirl|cuphead|rayman|runner|endless run|temple run|subway surfers|vector parkour/i, "platformer"],
  [/tower ?defense|\btd\b|kingdom rush|age of war|civiliz|warcraft|starcraft|strateg|conquer|clash of|base ?defense|defense|bloon/i, "strategy"],
  [/puzzle|tetris|sudoku|mahjong|2048|match ?3|matching|jewel|\bgems?\b|brain|logic|maze|jigsaw|crossword|\bword\b|merge|minesweep|connect|nonogram|picross|flow free|bubble|\bzuma\b|candy crush|hexa|\bblocks?\b|cut the rope|where'?s my|brain test|impossible quiz|riweave/i, "puzzle"],
  [/adventure|\brpg\b|escape|zelda|treasure|quest|dungeon|pirate|viking|wild ?west|detective|mystery|point ?and ?click/i, "adventure"],
  [/pac ?man|\bpong\b|\bsnake\b|space ?invaders|asteroids?|breakout|arkanoid|donkey ?kong|galaga|frogger|pinball|\bretro\b|\bclassic\b|atari/i, "classic"],
  [/dress ?up|makeup|makeover|barbie|princess|wedding|clean|wash|coloring|colouring|paint|nail|baby|\bpets?\b|\bdogs?\b|\bcat\b|puppy|kitty|cute|kawaii|meme|doge|funny|happy|sweet|cozy|unicorn|\bpony\b|hello kitty|hospital babysit/i, "casual"],
  [/zombie|\bwar\b|battle|ninja|samurai|assassin|killer|sword|warrior|stickman|alien|robot|dinosaur|\bshark\b|dragon|gangster|mafia|\bhero\b|spider|batman|superman|captain america|avenger|star ?wars|attack|survival|apocalypse|destroy|\bbomb\b|dynamite|monster|fight|clash|arena|\bboss\b/i, "action"],
];

const CAT_LABELS = {
  io: ".io Arena", shooter: "Shooter", action: "Action", arcade: "Arcade",
  puzzle: "Puzzle", platformer: "Platformer", racing: "Racing", sports: "Sports",
  adventure: "Adventure", strategy: "Strategy", idle: "Idle", horror: "Horror",
  card: "Cards & Board", rhythm: "Rhythm", sandbox: "Sandbox", simulation: "Simulation",
  casual: "Casual", "two-player": "2 Player", classic: "Classics", trivia: "Trivia",
};

const SIZES = {
  arcade: [960, 600], shooter: [960, 600], io: [960, 640], sports: [960, 640],
  platformer: [960, 640], classic: [960, 640], puzzle: [960, 640],
  idle: [960, 600], racing: [960, 540], sandbox: [960, 540], trivia: [960, 600],
  rhythm: [960, 640], action: [960, 600], adventure: [960, 600], horror: [960, 600],
  strategy: [960, 600], card: [960, 640], simulation: [960, 600], casual: [800, 600],
  "two-player": [960, 640],
};

function classify(title) {
  for (const [re, cat] of RULES) if (re.test(title)) return cat;
  return "arcade";
}

/* franchise keywords worth keeping as search tags */
const FRANCHISES = [
  "minecraft", "fnf", "friday night", "sonic", "mario", "pokemon", "among us",
  "geometry dash", "slope", "granny", "fnaf", "five nights", "kogama", "gta",
  "lego", "terraria", "roblox", "subway surfers", "temple run", "angry birds",
  "bloons", "papa's", "stickman", "fireboy", "watergirl", "cuphead", "halo",
  "doom", "call of duty", "counter", "tank trouble", "agar.io", "slither.io",
  "krunker", "shell shockers", "paper.io", "hole.io", "diep.io", "zombs royale",
  "smash karts", "mortal kombat", "street fighter", "tetris", "sudoku",
  "mahjong", "solitaire", "chess", "checkers", "2048", "pac-man", "pacman",
  "pong", "snake", "retro bowl", "cookie clicker", "burrito bison",
  "learn to fly", "impossible quiz", "happy wheels", "run 3", "vex",
  "doodle jump", "tomb of the mask", "crossy road", "flappy", "1v1.lol",
  "just fall", "basket random", "soccer random", "volley random", "smashy road",
  "who's your", "monkey mart", "ballistic", "snowball", "iron snout", "duck life",
];

function tagsFor(title, category) {
  const t = title.toLowerCase();
  const tags = ["unblocked"];
  for (const f of FRANCHISES) {
    if (tags.length >= 5) break;
    if (t.includes(f)) {
      const tag = f.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (tag && tag !== category && !tags.includes(tag)) tags.push(tag);
    }
  }
  return tags;
}

function describe(title, category, listName) {
  const phrase =
    category === "io" ? "an .io arena pick"
    : category === "two-player" ? "a 2-player pick"
    : `a ${CAT_LABELS[category]?.toLowerCase() || category} pick`;
  const label = LIST_LABEL[listName] || listName;
  return `Play ${title} free in the browser — ${phrase} from the ${label} collection. No download, no install.`;
}

/* ---------------------------------------------------------------
   load reference lists
   --------------------------------------------------------------- */
console.log("Fetching reference game lists…");
const lists = [];
for (const l of LISTS) {
  const data = await fetchJson(`${REF}/${l.key}.json`);
  lists.push({ ...l, games: Array.isArray(data) ? data : [] });
  console.log(`  ${l.name.padEnd(7)} ${String(data.length).padStart(4)} games`);
}

/* index: normalized name → first hit in list-priority order */
const index = new Map();
for (const l of lists) {
  for (const g of l.games) {
    const n = norm(g.name);
    if (!n) continue;
    if (!index.has(n)) index.set(n, []);
    const bucket = index.get(n);
    if (!bucket.some((b) => b.list.name === l.name)) bucket.push({ list: l, game: g });
  }
}
console.log(`\n${[...index.keys()].length} unique titles across all lists`);

/* ---------------------------------------------------------------
   load existing catalog
   --------------------------------------------------------------- */
const dataDir = path.join(process.cwd(), "data");
const existing = JSON.parse(await readFile(path.join(dataDir, "games.json"), "utf8"));
/* the tta- batch is fully rebuilt on every run, so previous tta- entries
   must NOT count as "already have" (that would drop them) */
const preexisting = existing.games.filter((g) => !g.id.startsWith("tta-"));
const haveNorm = new Set(preexisting.map((g) => norm(g.t)));
const CAT_LABELS_EXISTING = Object.fromEntries((existing.categories || []).map((c) => [c.slug, c.label]));
Object.assign(CAT_LABELS, CAT_LABELS_EXISTING);

/* ---------------------------------------------------------------
   resolve candidates (dedupe + junk filter)
   --------------------------------------------------------------- */
const candidates = [];
const seenUrls = new Set();
let skippedHave = 0;
let skippedJunk = 0;
let skippedDupUrl = 0;

for (const [n, bucket] of index) {
  if (haveNorm.has(n)) {
    skippedHave++;
    continue;
  }
  const hit = bucket[0]; /* first list in priority order */
  const rawName = (hit.game.name || "").replace(/\s+/g, " ").trim();
  /* junk filter: numeric-only names ("1"), 1-2 char names ("-b", "Oo"),
     names without at least 3 alphanumeric characters */
  if (!rawName || rawName.length < 2 || /^[\d\s.-]+$/.test(rawName) || rawName.replace(/[^a-z0-9]/gi, "").length < 3) {
    skippedJunk++;
    continue;
  }
  const url = hit.game.url?.startsWith("http")
    ? hit.game.url
    : new URL(hit.game.url || "", `${REF}/`).href;
  if (!/^https?:\/\//.test(url)) {
    skippedJunk++;
    continue;
  }
  if (seenUrls.has(url)) {
    skippedDupUrl++;
    continue;
  }
  seenUrls.add(url);
  const image = hit.game.image && !/favicon/i.test(hit.game.image)
    ? hit.game.image.startsWith("http")
      ? hit.game.image
      : new URL(hit.game.image, `${REF}/`).href
    : "";
  candidates.push({ n, title: prettyTitle(rawName), list: hit.list, url, image });
}

console.log(`candidates: ${candidates.length} (skipped: ${skippedHave} already in catalog, ${skippedJunk} junk, ${skippedDupUrl} duplicate urls)`);

/* ---------------------------------------------------------------
   verify + build batch
   --------------------------------------------------------------- */
const added = [];
const failed = [];
const CONCURRENCY = 24;
const queue = [...candidates];
const t0 = Date.now();
let done = 0;

async function worker() {
  while (queue.length) {
    const c = queue.shift();
    done++;
    if (done % 250 === 0) console.log(`  … ${done}/${candidates.length} checked (${added.length} ok, ${Math.round((Date.now() - t0) / 1000)}s)`);
    const { err, html } = await verifyEmbed(c.url);
    if (err) {
      failed.push(`${c.title} [${c.list.name}] — ${err}`);
      continue;
    }
    /* phase 2 — game payload must be alive, not just the page */
    const assets = extractCritical(html || "", c.url);
    let deadAsset = null;
    for (const a of assets) {
      if (await assetDead(a)) {
        deadAsset = a;
        break;
      }
    }
    if (deadAsset) {
      failed.push(`${c.title} [${c.list.name}] — dead payload ${deadAsset.slice(0, 90)}`);
      continue;
    }
    const category = classify(c.title);
    const [w, h] = SIZES[category] || [960, 600];
    const th = await checkThumb(c.image);
    let id = `tta-${slugify(c.title)}`;
    let k = 2;
    while (usedIds.has(id)) id = `tta-${slugify(c.title)}-${k++}`;
    usedIds.add(id);
    added.push({
      id,
      t: c.title,
      d: describe(c.title, category, c.list.name),
      u: c.url,
      px: 0,
      c: category,
      g: tagsFor(c.title, category),
      th,
      w,
      h,
      b: 0,
    });
  }
}
const usedIds = new Set();

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

/* ---------------------------------------------------------------
   payload-audit the existing curated tt- picks too — they were
   verified page-level only, and the same jsdelivr bans apply.
   Dead ones are dropped (merge-tungtung-games.mjs can re-add them
   later if the payload ever comes back).
   --------------------------------------------------------------- */
console.log("\nAuditing existing tung-tung picks for dead payloads…");
const ttQueue = existing.games.filter((g) => g.id.startsWith("tt-")).map((g) => ({ id: g.id, t: g.t, u: g.u }));
const ttDead = [];
const ttAudited = { n: 0 };
async function ttWorker() {
  while (ttQueue.length) {
    const g = ttQueue.shift();
    ttAudited.n++;
    if (ttAudited.n % 50 === 0) console.log(`  … ${ttAudited.n} audited (${ttDead.length} dead)`);
    const { err, html } = await verifyEmbed(g.u);
    if (err) {
      ttDead.push(g.id);
      failed.push(`${g.t} [tt] — page ${err}`);
      continue;
    }
    const assets = extractCritical(html || "", g.u);
    for (const a of assets) {
      if (await assetDead(a)) {
        ttDead.push(g.id);
        failed.push(`${g.t} [tt] — dead payload ${a.slice(0, 90)}`);
        break;
      }
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, ttWorker));
const ttDeadSet = new Set(ttDead);
console.log(`  tt- picks: ${ttDeadSet.size} dead of ${ttAudited.n} audited`);

/* per-list + category stats */
const byList = {};
const byCat = {};
for (const a of added) {
  const ln = a.u.includes("jsdelivr") ? (a.u.includes("/3kh@") ? "3kh0" : "hydra") : "reference";
  byList[ln] = (byList[ln] || 0) + 1;
  byCat[a.c] = (byCat[a.c] || 0) + 1;
}
console.log(`\nverified in ${Math.round((Date.now() - t0) / 1000)}s: ${added.length} added, ${failed.length} failed embed check`);
console.log(`by source: ${Object.entries(byList).map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log(`by category: ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ")}`);

if (DRY) {
  console.log("\n--dry: not writing. failures (first 25):");
  for (const f of failed.slice(0, 25)) console.log(`  ✗ ${f}`);
  process.exit(0);
}

/* ---------------------------------------------------------------
   assemble: curated → tt (curated picks) → tta (this bulk batch) → gf → builtins
   NOTE: "tt-" and "tta-" are different prefixes — filter BOTH out of
   curated, or the previous run's bulk batch leaks into "curated" and
   gets duplicated (startsWith("tt-") does NOT match "tta-…").
   --------------------------------------------------------------- */
const curated = existing.games.filter(
  (g) => !g.b && !g.id.startsWith("gf-") && !g.id.startsWith("tt-") && !g.id.startsWith("tta-")
);
const tt = existing.games.filter((g) => g.id.startsWith("tt-") && !ttDeadSet.has(g.id));
const gf = existing.games.filter((g) => g.id.startsWith("gf-"));
const builtins = existing.games.filter((g) => g.b);
const games = [...curated, ...tt, ...added, ...gf, ...builtins];

const counts = new Map();
for (const g of games) counts.set(g.c, (counts.get(g.c) || 0) + 1);
const categories = [...counts.entries()]
  .map(([slug, count]) => ({ slug, label: CAT_LABELS[slug] || slug, count }))
  .sort((a, b) => b.count - a.count);

const catalog = {
  generatedAt: new Date().toISOString(),
  source:
    "hand-curated popular games + tung tung reference picks (verified embeddable) + tung tung full-catalog import (verified embeddable) + GameFlare most-played catalog (verified embeddable) + built-in",
  total: games.length,
  categories,
  games,
};

const out = path.join(dataDir, "games.json");
await writeFile(out, JSON.stringify(catalog, null, 1));

console.log(`\nWrote ${games.length} games (${curated.length} curated + ${tt.length} tung-tung picks + ${added.length} bulk import + ${gf.length} GameFlare + ${builtins.length} built-in) → ${out}`);
console.log(`size: ${(JSON.stringify(catalog).length / 1024).toFixed(0)} KB`);
console.log(`categories: ${categories.map((c) => `${c.slug}=${c.count}`).join(" ")}`);
if (failed.length) {
  console.log(`\nembed-check failures (first 40 of ${failed.length}):`);
  for (const f of failed.slice(0, 40)) console.log(`  ✗ ${f}`);
}
