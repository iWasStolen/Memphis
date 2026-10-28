"use client";

import { useEffect, useMemo, useState } from "react";
import { GAMES, GAME_CATEGORIES } from "@/lib/games";
import { GameDef } from "@/lib/types";
import { lsGet, lsSet, api, useUI } from "@/lib/store";
import { GamePlayer } from "@/components/games/player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Star, Trophy, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";

const PAGE_SIZE = 12;

interface ScoreRow {
  id: string;
  name: string;
  score: number;
  createdAt: string;
}
interface PlayerRow {
  name: string;
  total: number;
  games: number;
}

function LeaderboardPanel() {
  const [tab, setTab] = useState<"players" | "2048" | "snake" | "tetris" | "flappy">("players");
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [scores, setScores] = useState<ScoreRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (tab === "players") {
        setScores(null);
        const r = await api<{ players: PlayerRow[] }>(
          "/api/games/scores?mode=players"
        );
        if (!cancelled) setPlayers(r.ok ? r.data.players : []);
      } else {
        setPlayers(null);
        const r = await api<{ scores: ScoreRow[] }>(
          `/api/games/scores?game=${tab}`
        );
        if (!cancelled) setScores(r.ok ? r.data.scores : []);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "players", label: "Top Players" },
    { id: "2048", label: "2048" },
    { id: "snake", label: "Snake" },
    { id: "tetris", label: "Tetris" },
    { id: "flappy", label: "Flappy" },
  ];

  return (
    <section
      aria-label="Leaderboard"
      className="border border-[#1a1a1a] rounded-lg bg-[#080808]"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#141414]">
        <Trophy className="size-4 text-white" />
        <h2 className="text-sm font-semibold text-white">Leaderboard</h2>
      </div>
      <div className="flex gap-1 px-3 pt-3 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors ${
              tab === t.id
                ? "bg-white text-black"
                : "text-[#8f8f8f] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3 min-h-[120px]">
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 shimmer rounded" />
            ))}
          </div>
        ) : tab === "players" ? (
          players && players.length > 0 ? (
            <ol className="space-y-1">
              {players.map((p, i) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between text-[13px] px-2 py-1.5 rounded hover:bg-[#0e0e0e]"
                >
                  <span className="text-[#c9c9c9] flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-[#555] w-5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="font-mono text-xs text-white">
                    {p.total.toLocaleString()}{" "}
                    <span className="text-[#555]">pts · {p.games} runs</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-[#666] py-4 text-center">
              No scores yet — be the first on the board.
            </p>
          )
        ) : scores && scores.length > 0 ? (
          <ol className="space-y-1">
            {scores.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-[13px] px-2 py-1.5 rounded hover:bg-[#0e0e0e]"
              >
                <span className="text-[#c9c9c9] flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-[#555] w-5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="font-mono text-xs text-white">
                  {s.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-[#666] py-4 text-center">
            No scores for this game yet.
          </p>
        )}
      </div>
    </section>
  );
}

export default function PlayView() {
  const { setReportTarget, openModal } = useUI();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState<GameDef | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setFavs(lsGet<string[]>("memphis-fav-games", []));
    setRecent(lsGet<string[]>("memphis-recent-games", []));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [filter, query]);

  useEffect(() => {
    if (playing) {
      setRecent(lsGet<string[]>("memphis-recent-games", []));
      setFavs(lsGet<string[]>("memphis-fav-games", []));
    }
  }, [playing]);

  const filtered = useMemo(() => {
    let list = [...GAMES];
    if (filter === "favorites") list = list.filter((g) => favs.includes(g.id));
    else if (filter === "recent") list = recent.map((id) => list.find((g) => g.id === id)).filter(Boolean as unknown as (v: GameDef | undefined) => v is GameDef);
    else if (filter !== "all") list = list.filter((g) => g.category === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.desc.toLowerCase().includes(q) ||
          g.category.includes(q)
      );
    }
    if (filter === "recent") return list;
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [filter, query, favs, recent]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleFav = (id: string) => {
    const cur = lsGet<string[]>("memphis-fav-games", []);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    lsSet("memphis-fav-games", next);
    setFavs(next);
  };

  return (
    <div className="flex-1">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-semibold text-white flex items-center gap-2.5">
              <BookOpen className="size-5" /> Games
            </h1>
            <p className="text-xs text-[#7a7a7a] mt-1">
              {GAMES.length} games · {GAMES.filter((g) => g.builtin).length} built
              in-house · star your favorites
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-[#555]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games…"
              aria-label="Search games"
              className="pl-8 bg-[#050505] border-[#262626] text-sm h-9"
            />
          </div>
        </div>

        {/* filter tabs */}
        <div
          className="flex gap-1.5 overflow-x-auto pb-1 mb-4"
          role="tablist"
          aria-label="Game filters"
        >
          {GAME_CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={`px-3 py-1.5 rounded-md text-xs border whitespace-nowrap transition-colors ${
                filter === c.id
                  ? "bg-white text-black border-white"
                  : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
              }`}
            >
              {c.label}
              {c.id === "favorites" && favs.length > 0 && (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">
                  {favs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          {/* game grid */}
          <div>
            {pageItems.length === 0 ? (
              <div className="border border-dashed border-[#222] rounded-lg py-16 text-center">
                <p className="text-sm text-[#8f8f8f]">
                  {filter === "favorites"
                    ? "No favorites yet — tap the star on any game."
                    : filter === "recent"
                      ? "Nothing played yet — your recently opened games will appear here."
                      : `No games match "${query}".`}
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {pageItems.map((g) => (
                  <li key={g.id}>
                    <div className="group relative rounded-lg border border-[#1a1a1a] bg-[#080808] hover:border-[#333] transition-colors">
                      <button
                        onClick={() => setPlaying(g)}
                        className="w-full text-left p-3.5"
                        aria-label={`Play ${g.name}`}
                      >
                        <div className="aspect-[5/3] rounded-md border border-[#1c1c1c] bg-black flex items-center justify-center mb-3 overflow-hidden relative">
                          <span className="font-mono text-[10px] tracking-[0.25em] text-[#3a3a3a] group-hover:text-[#5a5a5a] transition-colors">
                            {g.builtin ? "MEMPHIS" : "EMBED"}
                          </span>
                          <span className="absolute bottom-1.5 right-2 font-mono text-[9px] text-[#333]">
                            {g.category}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] text-white truncate">
                            {g.name}
                          </span>
                          {g.builtin && (
                            <span className="size-1.5 rounded-[2px] bg-[#3a3a3a] group-hover:bg-white transition-colors shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-[#666] truncate mt-0.5">
                          {g.desc}
                        </p>
                      </button>
                      <button
                        onClick={() => toggleFav(g.id)}
                        aria-label={
                          favs.includes(g.id)
                            ? `Remove ${g.name} from favorites`
                            : `Add ${g.name} to favorites`
                        }
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <Star
                          className={`size-3.5 ${
                            favs.includes(g.id)
                              ? "fill-white text-white"
                              : "text-[#777] hover:text-white"
                          }`}
                        />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* pagination */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="border-[#262626] text-[#9a9a9a] hover:text-white"
                >
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <span className="font-mono text-xs text-[#7a7a7a]">
                  {safePage + 1} / {pages} ({filtered.length}{" "}
                  {filtered.length === 1 ? "item" : "items"})
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pages - 1}
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                  className="border-[#262626] text-[#9a9a9a] hover:text-white"
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            )}

            <button
              className="mt-4 text-[11px] text-[#666] hover:text-white u-link"
              onClick={() => {
                setReportTarget({ kind: "game", target: "General games feedback" });
                openModal("report");
              }}
            >
              Game not working? Report it
            </button>
          </div>

          <LeaderboardPanel />
        </div>
      </div>

      {playing && (
        <GamePlayer game={playing} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
