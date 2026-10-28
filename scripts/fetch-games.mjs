/**
 * Memphis unBLACKed — game catalog builder
 * Fetches real HTML5 games from the GameMonetize public feed
 * (https://gamemonetize.com/feed.php) and merges them with the
 * built-in games. Output: data/games.json
 *
 * Run: bun scripts/fetch-games.mjs
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const FEED = "https://gamemonetize.com/feed.php";
const PAGE_SIZE = 100;
const TARGET = 2760; // a bit over 2700 to survive dedupe
const MAX_PAGES = 60;
const DELAY_MS = 2600;
const RETRY_429_MS = 20000;
const MAX_RETRIES = 6;

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function esc(s) {
  return String(s || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(page) {
  const url = `${FEED}?format=0&num=${PAGE_SIZE}&page=${page}`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) MemphisCatalog/1.0" },
    });
    if (res.status === 429 || res.status === 503) {
      if (attempt === MAX_RETRIES) throw new Error(`page ${page}: persistent HTTP ${res.status}`);
      console.log(`[rate] page ${page}: HTTP ${res.status}, backing off ${(RETRY_429_MS / 1000) | 0}s (attempt ${attempt}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, RETRY_429_MS));
      continue;
    }
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`page ${page}: non-JSON response`);
    }
    if (!Array.isArray(data)) throw new Error(`page ${page}: unexpected shape`);
    return data;
  }
  throw new Error(`page ${page}: unreachable`);
}

async function main() {
  const seenTitles = new Set();
  const seenUrls = new Set();
  const games = [];
  const categories = new Map(); // slug -> label
  let startPage = 1;

  /* auto-resume from an existing catalog */
  try {
    const prev = JSON.parse(await readFile(path.join(process.cwd(), "data/games.json"), "utf8"));
    if (prev && Array.isArray(prev.games)) {
      for (const g of prev.games) {
        /* only external games seed the dedupe sets; builtins re-merge below */
        if (!g.b) {
          if (g.u) seenUrls.add(g.u);
          seenTitles.add(g.t.toLowerCase());
          games.push(g);
          if (g.c && !categories.has(g.c)) categories.set(g.c, g.c);
        }
      }
      const external = prev.games.filter((g) => !g.b).length;
      startPage = Math.floor(external / PAGE_SIZE) + 1;
      console.log(`[resume] ${prev.games.length} games loaded, continuing from page ${startPage}`);
    }
  } catch {
    /* no previous catalog */
  }

  for (let page = startPage; page <= MAX_PAGES; page++) {
    if (games.length >= TARGET) break;
    let items;
    try {
      items = await fetchPage(page);
    } catch (e) {
      console.error(`[warn] ${e.message} — stopping paging here`);
      break;
    }
    if (!items.length) {
      console.log(`[info] page ${page} empty — end of feed`);
      break;
    }
    let added = 0;
    for (const g of items) {
      if (!g || !g.url || !g.title) continue;
      const title = esc(g.title).slice(0, 90);
      const key = title.toLowerCase();
      if (seenTitles.has(key)) continue;
      if (seenUrls.has(g.url)) continue;
      seenTitles.add(key);
      seenUrls.add(g.url);

      const catLabel = esc(g.category) || "Arcade";
      const cat = slugify(catLabel) || "arcade";
      if (!categories.has(cat)) categories.set(cat, catLabel);

      games.push({
        id: `gm-${g.id}`,
        t: title,
        d: esc(g.description).slice(0, 220),
        u: g.url,
        c: cat,
        g: String(g.tags || "")
          .split(",")
          .map((t) => esc(t).toLowerCase())
          .filter(Boolean)
          .slice(0, 10),
        th: g.thumb || "",
        w: parseInt(g.width, 10) || 960,
        h: parseInt(g.height, 10) || 540,
        b: 0, // builtin flag (0 = external)
      });
      added++;
    }
    console.log(`[info] page ${page}: +${added} (total ${games.length})`);
    if (page < MAX_PAGES) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  /* merge built-in games (kept in src/lib/games.ts format) */
  let builtinCount = 0;
  try {
    const src = await readFile(
      path.join(process.cwd(), "src/lib/games-builtin.ts"),
      "utf8"
    );
    const m = src.match(/export const BUILTIN_GAMES[^=]*=\s*(\[[\s\S]*?\n\]);/);
    if (m) {
      const builtin = eval(m[1].replace(/as const/g, ""));
      for (const g of builtin) {
        if (seenTitles.has(g.name.toLowerCase())) continue;
        seenTitles.add(g.name.toLowerCase());
        games.push({
          id: g.id,
          t: g.name,
          d: esc(g.desc),
          u: g.embedUrl || "",
          c: g.category,
          g: [],
          th: "",
          w: 960,
          h: 600,
          b: 1,
          ...(g.builtin ? { bi: g.id } : {}),
        });
        if (!categories.has(g.category))
          categories.set(g.category, g.category[0].toUpperCase() + g.category.slice(1));
        builtinCount++;
      }
    }
  } catch {
    console.log("[warn] no builtin games file found, skipping merge");
  }

  /* order: builtin first, then stable feed order */
  games.sort((a, b) => (b.b || 0) - (a.b || 0));

  const titleCase = (s) => s.replace(/(^|[- ])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  const catList = [...categories.entries()]
    .map(([slug, label]) => ({
      slug,
      label: label === slug ? titleCase(slug) : label,
      count: games.filter((g) => g.c === slug).length,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const out = {
    generatedAt: new Date().toISOString(),
    source: "gamemonetize.com public feed + built-in",
    total: games.length,
    categories: catList,
    games,
  };

  await mkdir(path.join(process.cwd(), "data"), { recursive: true });
  const dest = path.join(process.cwd(), "data/games.json");
  await writeFile(dest, JSON.stringify(out));
  const kb = Math.round((JSON.stringify(out).length / 1024) * 10) / 10;
  console.log(
    `[done] ${games.length} games (${builtinCount} builtin), ${catList.length} categories, ${kb} KB -> ${dest}`
  );
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
