/**
 * Memphis unBLACKed — GameFlare catalog scraper
 *
 * Scrapes GameFlare listing pages (popularity + franchise + genre categories)
 * into data/gameflare-listing.json. Every tile carries: slug, title, thumb,
 * rating, plays, tech, published date, short description, source categories.
 *
 * GameFlare embeds (gameflare.com/embed/{slug}/) are the cleanest embeddable
 * game pages on the web — verified to render playable games in cross-origin
 * iframes with no site chrome.
 *
 * Run: node scripts/fetch-gameflare-listing.mjs
 */
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/* ---------------- sources ---------------- */

/* popularity rankings — the core "well-known" signal */
const POP_LISTINGS = [
  { path: "most-played-games", pages: 50 }, // deep: global plays ranking
  { path: "best-games", pages: 6 }, // by rating
];

/* the biggest genre categories get a deeper crawl */
const BIG_CATS = new Set([
  "action", "shooting", "puzzle", "racing", "sports", "strategy", "arcade",
  "car", "io", "multiplayer", "adventure", "horror", "platform", "zombie",
  "stickman", "fighting", "tower-defense", "sniper", "girls", "dress-up",
  "cooking", "running", "escape", "idle", "two-players", "battle-royale",
]);

/* ---------------- helpers ---------------- */

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();

const parsePlays = (s) => {
  const m = /([\d.,]+)\s*([km]?)/i.exec(s || "");
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  const mult = m[2].toLowerCase() === "m" ? 1e6 : m[2].toLowerCase() === "k" ? 1e3 : 1;
  return Math.round(n * mult);
};

async function fetchPage(url) {
  const { stdout } = await execFileP(
    "curl",
    [
      "-sL", "--compressed", "--max-time", "20", "-A", UA,
      "-H", "Accept: text/html,application/xhtml+xml",
      "-H", "Accept-Language: en-US,en;q=0.9",
      url,
    ],
    { timeout: 25000, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}

/* parse game tiles from a listing page's OWN content only.

   Page layout: H1 (category title) → real category tiles (grid cells + a
   games-list section) → H2 "Popular Games" strip (global, NOT category
   members) → H2 "Best Games" strip (global). We cut the HTML at the first
   H2 page-header so strips never pollute category tags. */
function parseTiles(html) {
  const tiles = [];
  const h1 = html.indexOf('<h1 class="page-header">');
  if (h1 < 0) return tiles;
  const h2 = html.indexOf('<h2 class="page-header">', h1);
  const scope = html.slice(h1, h2 > 0 ? h2 : undefined);

  /* rating span class varies (label-success / label-warning / label-danger);
     grid cells use class="col-xs-4 … game-cell", list cells class=" game-cell" */
  const cellRe =
    /<div class="[^"]*game-cell">\s*<div data-toggle="popover-game" title="([^"]*)">\s*<a href="https:\/\/www\.gameflare\.com\/online-game\/([a-z0-9-]+)\/"[^>]*>\s*<img([^>]*)>\s*<\/a>\s*<p class="info">\s*<span class="label label-\w+">(\d+)%<\/span>\s*(?:<span class="label[^"]*">[^<]*<\/span>\s*)*<span class="label label-primary">([^<]*)plays<\/span>\s*<\/p>\s*<p class="title">[\s\S]*?<p class="content hidden">\s*<span class="game-popover-info">\s*<span class="label label-success">Published: ([^<]*)<\/span>\s*<span class="label label-primary">(\w+)<\/span>\s*<\/span>\s*(?:<[^>]+>)*([\s\S]*?)<\/p>/g;

  let m;
  while ((m = cellRe.exec(scope))) {
    const [, rawTitle, slug, imgAttrs, rating, playsRaw, published, tech, descRaw] = m;
    const desc = decode(descRaw.replace(/<[^>]+>/g, " "));
    if (!slug) continue;
    /* pick the best thumbnail: prefer -400-300 variant from any attr */
    const imgUrls = [...imgAttrs.matchAll(/https:\/\/data\.gameflare\.com\/[^"'\s]+/g)].map((x) => x[0]);
    const big = imgUrls.find((u) => /-400-300\./.test(u)) || imgUrls.find((u) => / src="/.test(u)) || imgUrls[0] || "";
    tiles.push({
      slug,
      title: decode(rawTitle),
      thumb: big,
      rating: parseInt(rating, 10) || 0,
      plays: parsePlays(playsRaw),
      published: published.trim(),
      tech: tech.trim(),
      desc: desc.slice(0, 300),
    });
  }
  return tiles;
}

/* ---------------- main ---------------- */

const bySlug = new Map();
let pagesFetched = 0;

function mergeTiles(tiles, cat) {
  for (const t of tiles) {
    const prev = bySlug.get(t.slug);
    if (prev) {
      prev.plays = Math.max(prev.plays, t.plays);
      prev.cats.add(cat);
      if (t.desc && (!prev.desc || t.desc.length > prev.desc.length)) prev.desc = t.desc;
      if (t.rating > prev.rating) prev.rating = t.rating;
    } else {
      bySlug.set(t.slug, { ...t, cats: new Set([cat]) });
    }
  }
}

/* scrape one listing sequentially, page by page.
   Stops on: fetch error, empty page, or a page whose tile slugs repeat an
   earlier page — GameFlare serves identical fallback content past the real
   pagination depth (soft-404) which would pollute the category tags. */
async function scrapeListing(cat, maxPages) {
  const seenSigs = new Set();
  for (let p = 1; p <= maxPages; p++) {
    const url = p === 1 ? `https://www.gameflare.com/${cat}/` : `https://www.gameflare.com/${cat}/${p}/`;
    let tiles;
    try {
      const html = await fetchPage(url);
      pagesFetched++;
      tiles = parseTiles(html);
    } catch {
      return; /* network error → done with this listing */
    }
    if (tiles.length === 0) return;
    const sig = tiles.map((t) => t.slug).join(",");
    if (seenSigs.has(sig)) return; /* repeated fallback content */
    seenSigs.add(sig);
    mergeTiles(tiles, cat);
  }
}

/* run a queue of scrape jobs with bounded concurrency */
async function runQueue(jobs, concurrency) {
  const queue = [...jobs];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      await job();
    }
  });
  await Promise.all(workers);
}

const jobs = [];
for (const { path: p, pages } of POP_LISTINGS) jobs.push(() => scrapeListing(p, pages));

/* discover every category from the categories index, then scrape them all */
async function discoverCategories() {
  const html = await fetchPage("https://www.gameflare.com/categories/");
  const cats = [...html.matchAll(/href="https:\/\/www\.gameflare\.com\/([a-z0-9-]+)-games\/"/g)]
    .map((m) => m[1])
    .filter((c, i, arr) => arr.indexOf(c) === i);
  return cats;
}

const allCats = await discoverCategories();
console.log(`discovered ${allCats.length} categories`);
for (const cat of allCats) {
  const depth = BIG_CATS.has(cat) ? 4 : 3;
  jobs.push(() => scrapeListing(`${cat}-games`, depth));
}

console.log(`scraping ${jobs.length} listings (8 concurrent, page-by-page)…`);
const t0 = Date.now();
await runQueue(jobs, 8);

const games = [...bySlug.values()]
  .map((g) => ({ ...g, cats: [...g.cats] }))
  .sort((a, b) => b.plays - a.plays);

console.log(
  `\n${pagesFetched} pages fetched in ${Math.round((Date.now() - t0) / 1000)}s → ${games.length} unique games`
);
console.log(`top 12 by plays:`);
for (const g of games.slice(0, 12))
  console.log(`  ${String(g.plays).padStart(9)}  ${g.title}  [${g.cats.slice(0, 3).join(", ")}]`);

const out = path.join(process.cwd(), "data", "gameflare-listing.json");
await writeFile(out, JSON.stringify({ scrapedAt: new Date().toISOString(), total: games.length, games }, null, 1));
console.log(`wrote ${out}`);
