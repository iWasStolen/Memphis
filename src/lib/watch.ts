/* ============================================================
   Watch catalog — real data from the Internet Archive
   public search API (no key required) with in-memory cache.
   ============================================================ */

import { WatchItemDef } from "./types";

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let cache: { at: number; movies: WatchItemDef[]; anime: WatchItemDef[] } | null =
  null;

/* Curated Solr query — verified classic public-domain films */
const MOVIE_TITLES = [
  "Night of the Living Dead",
  "Plan 9 from Outer Space",
  "Carnival of Souls",
  "Charade",
  "His Girl Friday",
  "Detour",
  "Suddenly",
  "The Stranger",
  "Animal Farm",
  "Royal Wedding",
  "The Lost World",
  "The Phantom of the Opera",
  "House on Haunted Hill",
  "The General",
  "Sherlock Jr",
  "Steamboat Bill",
  "Nosferatu",
  "Metropolis",
  "Cabinet of Dr. Caligari",
  "Last Man on Earth",
  "McLintock",
  "Beat the Devil",
  "My Man Godfrey",
  "The 39 Steps",
  "The Lady Vanishes",
  "Africa Screams",
  "Dementia 13",
  "Little Shop of Horrors",
  "The Terror",
  "D.O.A.",
  "Snows of Kilimanjaro",
  "Jungle Book",
  "Scrooge",
  "The Little Princess",
  "Nothing Sacred",
  "Gulliver",
  "The Outlaw",
  "Hell's Angels",
  "Father's Little Dividend",
];

/* Titles to exclude no matter what (safety filter) */
const TITLE_BLOCKLIST =
  /(sex|molester|naked|nude|porn|xxx|reefer|weed|gangbang|prostitut|smoking fetish)/i;

interface ArchiveDoc {
  identifier: string;
  title?: string;
  year?: string | number;
  downloads?: number;
  avg_rating?: string | number;
  runtime?: string;
  creator?: string | string[];
  description?: string | string[];
}

function pickDescription(d: ArchiveDoc): string {
  const raw = d.description;
  let text = "";
  if (Array.isArray(raw)) text = String(raw[0] ?? "");
  else if (typeof raw === "string") text = raw;
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 220) text = text.slice(0, 217) + "...";
  return text;
}

function dedupeAndClean(docs: ArchiveDoc[]): WatchItemDef[] {
  const seenTitle = new Set<string>();
  const out: WatchItemDef[] = [];
  for (const d of docs) {
    if (!d.identifier || !d.title) continue;
    if (TITLE_BLOCKLIST.test(d.title)) continue;
    /* prefer one copy per title (highest sort position = most downloaded) */
    const norm = d.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenTitle.has(norm)) continue;
    seenTitle.add(norm);
    const creator = Array.isArray(d.creator) ? d.creator[0] : d.creator;
    out.push({
      id: d.identifier,
      title: String(d.title).replace(/\s*\((?:complete|HD|restored|ipod)[^)]*\)/gi, "").trim(),
      year: d.year ? String(d.year) : undefined,
      meta: [creator, d.year ? String(d.year) : null, d.runtime ? `${d.runtime}` : null]
        .filter(Boolean)
        .join(" · "),
      desc: pickDescription(d) || "Public-domain classic, streamed from the Internet Archive.",
      kind: "movie" as const,
      source: "Internet Archive",
      sourceUrl: `https://archive.org/embed/${d.identifier}`,
      duration: d.runtime,
      rating: d.avg_rating ? `${Number(d.avg_rating).toFixed(1)}/5.0` : undefined,
    });
  }
  return out;
}

async function searchArchive(
  query: string,
  rows: number
): Promise<ArchiveDoc[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  for (const f of ["identifier", "title", "year", "downloads", "avg_rating", "runtime", "creator", "description"])
    params.append("fl[]", f);
  params.append("rows", String(rows));
  params.append("output", "json");
  params.append("sort[]", "downloads desc");
  const url = `https://archive.org/advancedsearch.php?${params.toString()}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Archive search failed (${res.status})`);
  const data = (await res.json()) as { response?: { docs?: ArchiveDoc[] } };
  return data.response?.docs ?? [];
}

export async function getWatchCatalog(): Promise<{
  movies: WatchItemDef[];
  anime: WatchItemDef[];
  cachedAt: number;
}> {
  if (cache && Date.now() - cache.at < CACHE_TTL)
    return { movies: cache.movies, anime: cache.anime, cachedAt: cache.at };

  const titleQuery = MOVIE_TITLES.map((t) => `"${t}"`).join(" OR ");
  const [movieDocs, animeDocs] = await Promise.all([
    searchArchive(
      `mediatype:movies AND collection:(feature_films OR SciFi_Horror) AND title:(${titleQuery})`,
      120
    ).catch(() => [] as ArchiveDoc[]),
    searchArchive(
      "mediatype:movies AND collection:(classic_cartoons OR animationandcartoons)",
      80
    ).catch(() => [] as ArchiveDoc[]),
  ]);

  const movies = dedupeAndClean(movieDocs);
  const anime = dedupeAndClean(animeDocs).map((a) => ({
    ...a,
    kind: "anime" as const,
    desc:
      a.desc ||
      "Classic animation from the golden age, streamed from the Internet Archive.",
  }));

  cache = { at: Date.now(), movies, anime };
  return { movies, anime, cachedAt: cache.at };
}

/* ---------------- YouTube helpers ---------------- */

export function parseYouTubeInput(input: string): {
  videoId: string;
  title: string;
} | null {
  const t = input.trim();
  if (!t) return null;
  /* bare id */
  if (/^[\w-]{11}$/.test(t)) return { videoId: t, title: "YouTube video" };
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return { videoId: m[1], title: "YouTube video" };
  }
  return null;
}
