"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameDef } from "@/lib/types";
import { lsGet, lsSet } from "@/lib/store";
import { GamePlayer } from "@/components/games/player";
import { Button } from "@/components/ui/button";
import {
  Search,
  Star,
  Clock,
  Gamepad2,
  Loader2,
  Server,
  ArrowDownAZ,
  ArrowUpAZ,
  ListFilter,
  Sparkles,
} from "lucide-react";

const FAV_KEY = "memphis-fav-games";
const RECENT_KEY = "memphis-recent-games";
const PAGE_SIZE = 48;

interface ApiResp {
  ok: boolean;
  total: number;
  page: number;
  per: number;
  categories: { slug: string; label: string; count: number }[];
  games: GameDef[];
}

type Filter = "all" | "favorites" | "recent" | "builtin";

export default function PlayView() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [cat, setCat] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"default" | "az" | "za">("default");
  const [categories, setCategories] = useState<ApiResp["categories"]>([]);
  const [games, setGames] = useState<GameDef[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playing, setPlaying] = useState<GameDef | null>(null);
  const [favVersion, setFavVersion] = useState(0); // bump to refresh fav filter
  const sentinelRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const favs = useMemo(() => lsGet<string[]>(FAV_KEY, []), [favVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const recents = useMemo(() => lsGet<string[]>(RECENT_KEY, []), [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  /* debounce the search box */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const buildUrl = useCallback(
    (pageNo: number) => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (cat !== "all") params.set("cat", cat);
      if (filter === "builtin") params.set("ids", "2048,snake,tetris,minesweeper,breakout,flappy,pong,memory,tictactoe,simon,asteroids,clicker");
      if (filter === "favorites" && favs.length) params.set("ids", favs.join(","));
      if (filter === "recent" && recents.length) params.set("ids", recents.join(","));
      if (sort !== "default") params.set("sort", sort);
      params.set("page", String(pageNo));
      params.set("per", String(PAGE_SIZE));
      return `/api/games?${params.toString()}`;
    },
    [debouncedQ, cat, filter, sort, favs, recents]
  );

  /* (re)load the first page when the query changes */
  useEffect(() => {
    let cancelled = false;
    /* empty favorites / recents must show their empty state — without
       this guard the request would fall through to the full catalog */
    if (
      (filter === "favorites" && favs.length === 0) ||
      (filter === "recent" && recents.length === 0)
    ) {
      setGames([]);
      setTotal(0);
      setPage(1);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(buildUrl(1))
      .then((r) => r.json())
      .then((data: ApiResp) => {
        if (cancelled) return;
        setGames(data.games || []);
        setTotal(data.total || 0);
        setCategories(data.categories || []);
        setPage(1);
        setLoading(false);
        if (firstLoad.current) firstLoad.current = false;
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (loadingMore || games.length >= total) return;
    setLoadingMore(true);
    try {
      const r = await fetch(buildUrl(page + 1));
      const data: ApiResp = await r.json();
      setGames((cur) => [...cur, ...(data.games || [])]);
      setPage((p) => p + 1);
      setTotal(data.total || total);
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, loadingMore, page, total, games.length]);

  /* infinite scroll */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && games.length > 0 && games.length < total) {
          void loadMore();
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, loading, loadingMore, games.length, total]);

  const openGame = (g: GameDef) => {
    const recent = lsGet<string[]>(RECENT_KEY, []).filter((x) => x !== g.id);
    recent.unshift(g.id);
    lsSet(RECENT_KEY, recent.slice(0, 60));
    setPlaying(g);
  };

  const closeGame = () => {
    setPlaying(null);
    setFavVersion((v) => v + 1);
  };

  const chips: { id: Filter | string; label: string; icon?: React.ReactNode }[] = [
    { id: "all", label: "All" },
    { id: "favorites", label: `Favorites${favs.length ? ` (${favs.length})` : ""}`, icon: <Star className="size-3" /> },
    { id: "recent", label: "Recent", icon: <Clock className="size-3" /> },
    { id: "builtin", label: "Built-in", icon: <Gamepad2 className="size-3" /> },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b border-[#141414] shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <Gamepad2 className="size-4" /> Play
          </h1>
          <span className="mono-label">
            {total > 0 ? `${total.toLocaleString()} games ready` : "loading catalog"}
          </span>
          <span className="flex-1" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#555]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search games…"
              aria-label="Search games"
              spellCheck={false}
              className="w-64 max-w-[60vw] h-9 rounded-full bg-[#050505] border border-[#1f1f1f] pl-9 pr-3 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#3a3a3a]"
            />
          </div>
          <div className="flex items-center rounded-full border border-[#1f1f1f] overflow-hidden">
            <button
              onClick={() => setSort(sort === "az" ? "default" : "az")}
              aria-pressed={sort === "az"}
              title="Sort A to Z"
              className={`px-2.5 h-9 flex items-center gap-1.5 text-[11px] transition-colors ${
                sort === "az" ? "bg-white text-black" : "text-[#9a9a9a] hover:text-white"
              }`}
            >
              <ArrowDownAZ className="size-3.5" /> A–Z
            </button>
            <button
              onClick={() => setSort(sort === "za" ? "default" : "za")}
              aria-pressed={sort === "za"}
              title="Sort Z to A"
              className={`px-2.5 h-9 flex items-center gap-1.5 text-[11px] border-l border-[#1f1f1f] transition-colors ${
                sort === "za" ? "bg-white text-black" : "text-[#9a9a9a] hover:text-white"
              }`}
            >
              <ArrowUpAZ className="size-3.5" /> Z–A
            </button>
          </div>
        </div>

        {/* filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="Game filters">
          {chips.map((c) => {
            const selected = filter === c.id && cat === "all";
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setFilter(c.id as Filter);
                  setCat("all");
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] border whitespace-nowrap transition-colors ${
                  selected
                    ? "bg-white text-black border-white"
                    : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
                }`}
              >
                {c.icon}
                {c.label}
              </button>
            );
          })}
          <span className="w-px h-5 bg-[#222] mx-1 shrink-0" aria-hidden />
          <button
            onClick={() => setCat("all")}
            aria-pressed={cat === "all"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] border whitespace-nowrap transition-colors ${
              cat === "all"
                ? "bg-[#161616] text-white border-[#333]"
                : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
            }`}
          >
            <ListFilter className="size-3" /> Categories
          </button>
          {categories.slice(0, 14).map((c) => (
            <button
              key={c.slug}
              onClick={() => {
                setCat(c.slug);
                setFilter("all");
              }}
              aria-pressed={cat === c.slug}
              className={`px-2.5 py-1.5 rounded-full text-[12px] border whitespace-nowrap transition-colors ${
                cat === c.slug
                  ? "bg-[#161616] text-white border-[#333]"
                  : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
              }`}
            >
              {c.label}
              <span className="ml-1 text-[10px] text-[#666]">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto memphis-scroll">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#777]">
            <Loader2 className="size-6 animate-spin text-white" />
            <p className="text-xs font-mono">loading {total ? total.toLocaleString() : ""} games…</p>
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
            <Sparkles className="size-7 text-[#555]" />
            <p className="text-sm text-white">
              {filter === "favorites"
                ? "No favorites yet — tap the star on any game."
                : debouncedQ
                  ? `Nothing matched “${debouncedQ}”.`
                  : "Nothing here."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3 sm:p-5">
              {games.map((g) => {
                const isFav = favs.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => openGame(g)}
                    className="group relative rounded-xl border border-[#1a1a1a] bg-[#080808] hover:border-[#3a3a3a] hover:bg-[#0d0d0d] transition-all text-left overflow-hidden focus-visible:outline focus-visible:outline-white/60"
                    aria-label={`Play ${g.name}`}
                  >
                    <div className="aspect-[4/3] bg-[#101010] overflow-hidden relative">
                      {g.thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={g.thumb}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 grayscale-[35%] group-hover:grayscale-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.opacity = "0";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gamepad2 className="size-8 text-[#333]" />
                        </div>
                      )}
                      {isFav && (
                        <span className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1">
                          <Star className="size-3 fill-white text-white" />
                        </span>
                      )}
                      {g.builtin && (
                        <span className="absolute bottom-1.5 left-1.5 mono-label !text-[9px] bg-black/70 rounded px-1.5 py-0.5">
                          built-in
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="text-[12.5px] text-white truncate font-medium">{g.name}</div>
                      <div className="text-[10.5px] text-[#666] truncate">
                        {g.category}
                        {g.tags && g.tags.length > 0 ? ` · ${g.tags.slice(0, 2).join(", ")}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* infinite scroll sentinel + load more */}
            <div ref={sentinelRef} className="h-2" aria-hidden />
            {games.length < total && (
              <div className="flex justify-center py-6">
                <Button
                  variant="outline"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="border-[#262626] text-[#bbb] hover:text-white hover:bg-[#101010]"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" /> Loading…
                    </>
                  ) : (
                    <>
                      <Server className="size-4 mr-2" /> Load more ({(total - games.length).toLocaleString()} left)
                    </>
                  )}
                </Button>
              </div>
            )}
            <div className="h-6" />
          </>
        )}
      </div>

      {/* player overlay */}
      {playing && <GamePlayer game={playing} onClose={closeGame} />}
    </div>
  );
}
