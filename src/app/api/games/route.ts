import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GameDef } from "@/lib/types";
import { BUILTIN_GAMES } from "@/lib/games-builtin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   /api/games — catalog of 74 hand-verified popular games
   Sources: data/games.json (GameMonetize public feed) + the
   built-in canvas games that ship with the app.
   Query: q, cat, ids, page, per, sort, meta
   ------------------------------------------------------------ */

interface RawGame {
  id: string;
  t: string;
  d: string;
  u: string;
  /** 1 = source site refuses iframes, load through the proxy */
  px?: number;
  c: string;
  g: string[];
  th: string;
  w: number;
  h: number;
  b: number;
  bi?: string;
}

interface Catalog {
  generatedAt: string;
  total: number;
  categories: { slug: string; label: string; count: number }[];
  games: RawGame[];
}

const BUILTIN_SCORES: Record<string, { hasScore: true; scoreLabel: string }> = {
  "2048": { hasScore: true, scoreLabel: "points" },
  snake: { hasScore: true, scoreLabel: "apples" },
  tetris: { hasScore: true, scoreLabel: "points" },
  minesweeper: { hasScore: true, scoreLabel: "seconds (lower is better)" },
  breakout: { hasScore: true, scoreLabel: "points" },
  flappy: { hasScore: true, scoreLabel: "pipes" },
  pong: { hasScore: true, scoreLabel: "rally wins" },
  memory: { hasScore: true, scoreLabel: "points" },
  tictactoe: { hasScore: true, scoreLabel: "points" },
  simon: { hasScore: true, scoreLabel: "rounds" },
  asteroids: { hasScore: true, scoreLabel: "points" },
  clicker: { hasScore: true, scoreLabel: "total voids" },
};

let cache: { catalog: Catalog; games: GameDef[] } | null = null;

async function loadCatalog(): Promise<{ catalog: Catalog; games: GameDef[] }> {
  if (cache) return cache;
  let catalog: Catalog = {
    generatedAt: "",
    total: 0,
    categories: [],
    games: [],
  };
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "games.json"), "utf8");
    catalog = JSON.parse(raw) as Catalog;
  } catch {
    /* catalog file missing — fall back to builtins below */
  }

  const games: GameDef[] = catalog.games.map((g) => {
    const builtin = !!g.bi;
    const score = builtin ? BUILTIN_SCORES[g.bi!] : undefined;
    return {
      id: g.id,
      name: g.t,
      desc: g.d,
      url: builtin ? undefined : g.u,
      proxy: builtin ? undefined : !!g.px,
      category: g.c,
      tags: g.g || [],
      thumb: g.th || "",
      width: g.w || 960,
      height: g.h || 540,
      builtin,
      hasScore: score?.hasScore,
      scoreLabel: score?.scoreLabel,
    };
  });

  /* guarantee the builtins exist even if the catalog file is missing */
  const have = new Set(games.map((g) => g.id));
  for (const b of BUILTIN_GAMES) {
    if (have.has(b.id)) continue;
    const score = BUILTIN_SCORES[b.id];
    games.push({
      id: b.id,
      name: b.name,
      desc: b.desc,
      url: b.embedUrl,
      category: b.category,
      tags: [],
      thumb: "",
      width: 960,
      height: 600,
      builtin: !!b.builtin,
      hasScore: score?.hasScore,
      scoreLabel: score?.scoreLabel,
    });
  }

  cache = { catalog, games };
  return cache;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const cat = (url.searchParams.get("cat") || "").trim();
  const ids = (url.searchParams.get("ids") || "").trim();
  const sort = url.searchParams.get("sort") || "default";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const per = Math.min(120, Math.max(12, parseInt(url.searchParams.get("per") || "48", 10) || 48));

  const { catalog, games } = await loadCatalog();

  /* category meta with live counts */
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.category, (counts.get(g.category) || 0) + 1);
  const categories = (catalog.categories || [])
    .map((c) => ({ ...c, count: counts.get(c.slug) || 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  /* resolve by ids (favorites / recently played) */
  if (ids) {
    const wanted = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
    const byId = new Map(games.map((g) => [g.id, g]));
    const resolved = wanted.map((id) => byId.get(id)).filter(Boolean) as GameDef[];
    return Response.json({
      ok: true,
      total: resolved.length,
      categories,
      generatedAt: catalog.generatedAt,
      games: resolved,
    });
  }

  let list = games;
  if (cat && cat !== "all") list = list.filter((g) => g.category === cat);
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter((g) => {
      const hay = `${g.name} ${g.desc} ${(g.tags || []).join(" ")}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  if (sort === "az") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "za") list = [...list].sort((a, b) => b.name.localeCompare(a.name));

  const total = list.length;
  const start = (page - 1) * per;
  const slice = list.slice(start, start + per);

  return Response.json({
    ok: true,
    total,
    page,
    per,
    categories,
    generatedAt: catalog.generatedAt,
    games: slice,
  });
}
