"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI, lsGet, lsSet, api } from "@/lib/store";
import { WatchItemDef } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clapperboard,
  Star,
  Clock,
  Bookmark,
  BookmarkCheck,
  Play,
  ArrowLeft,
  Send,
  Youtube as YoutubeIcon,
  Film,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Trash2,
} from "lucide-react";

type Tab = "movies" | "anime" | "youtube";
type SubNav = "browse" | "saved" | "recent";
type Category = "trending" | "popular" | "top" | "favorites" | "continue";

interface SavedEntry {
  id: string;
  kind: Tab;
  title: string;
  at: number;
}

interface RecentEntry extends SavedEntry {
  watchedAt: number;
}

interface WatchStats {
  [key: string]: { views: number; rating: number | null; ratingCount: number };
}

interface CommentRow {
  id: string;
  itemKey: string;
  author: string;
  content: string;
  createdAt: string;
}

const SAVED_KEY = "memphis-watch-saved";
const RECENT_KEY = "memphis-watch-recent";
const PAGE = 12;

const CATEGORIES: { id: Category; label: string; icon: typeof TrendingUp }[] = [
  { id: "trending", label: "trending", icon: TrendingUp },
  { id: "popular", label: "popular", icon: Sparkles },
  { id: "top", label: "top rated", icon: Star },
  { id: "favorites", label: "favorites", icon: Bookmark },
  { id: "continue", label: "continue", icon: Clock },
];

export default function WatchView() {
  const { setReportTarget, openModal } = useUI();
  const [tab, setTab] = useState<Tab>("movies");
  const [subNav, setSubNav] = useState<SubNav>("browse");
  const [category, setCategory] = useState<Category>("trending");
  const [catalog, setCatalog] = useState<{
    movies: WatchItemDef[];
    anime: WatchItemDef[];
  }>({ movies: [], anime: [] });
  const [stats, setStats] = useState<WatchStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<WatchItemDef | null>(null);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [ytInput, setYtInput] = useState("");
  const [ytError, setYtError] = useState("");
  /* player state */
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [upNext, setUpNext] = useState<WatchItemDef[]>([]);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  /* ---------- catalog load ---------- */
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await api<{ movies?: WatchItemDef[]; anime?: WatchItemDef[]; error?: string }>(
      "/api/watch/catalog"
    );
    if (!res.ok || res.data.error) {
      setError(res.data.error || "Could not load the video catalog.");
    } else {
      setCatalog({ movies: res.data.movies ?? [], anime: res.data.anime ?? [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
    setSaved(lsGet<SavedEntry[]>(SAVED_KEY, []));
    setRecent(lsGet<RecentEntry[]>(RECENT_KEY, []));
  }, [loadCatalog]);

  /* fetch view/rating stats once catalog loads */
  useEffect(() => {
    if (!catalog.movies.length && !catalog.anime.length) return;
    const keys = [...catalog.movies, ...catalog.anime].map((m) => m.id);
    void api<{ items?: WatchStats }>(`/api/watch/view?keys=${encodeURIComponent(keys.join(","))}`).then(
      (r) => {
        if (r.ok && r.data.items) {
          const map: WatchStats = {};
          for (const it of r.data.items as { itemKey: string; views: number; rating: number | null; ratingCount: number }[])
            map[it.itemKey] = { views: it.views, rating: it.rating, ratingCount: it.ratingCount };
          setStats(map);
        }
      }
    );
  }, [catalog]);

  /* ---------- derived list ---------- */
  const allItems = useMemo(() => {
    const base = tab === "anime" ? catalog.anime : catalog.movies;
    const ytSaved: WatchItemDef[] = saved
      .filter((s) => s.kind === "youtube")
      .map((s) => ({
        id: s.id,
        title: s.title,
        meta: "YouTube",
        desc: "Saved YouTube video.",
        kind: "youtube" as const,
        source: "YouTube",
        sourceUrl: `https://www.youtube-nocookie.com/embed/${s.id}`,
      }));
    return tab === "youtube" ? ytSaved : base;
  }, [tab, catalog, saved]);

  const listed = useMemo(() => {
    let list = [...allItems];
    if (subNav === "saved") {
      const ids = new Set(saved.filter((s) => s.kind === tab).map((s) => s.id));
      list = list.filter((i) => ids.has(i.id));
    } else if (subNav === "recent") {
      const ids = new Set(recent.filter((s) => s.kind === tab).map((s) => s.id));
      list = list.filter((i) => ids.has(i.id));
    } else {
      switch (category) {
        case "trending":
          list.sort((a, b) => (stats[b.id]?.views ?? 0) - (stats[a.id]?.views ?? 0));
          break;
        case "top":
          list.sort(
            (a, b) =>
              (stats[b.id]?.rating ?? 0) - (stats[a.id]?.rating ?? 0) ||
              (stats[b.id]?.ratingCount ?? 0) - (stats[a.id]?.ratingCount ?? 0)
          );
          break;
        case "popular":
          list.sort((a, b) => (b.year ?? "").localeCompare(a.year ?? ""));
          break;
        case "favorites": {
          const ids = new Set(saved.filter((s) => s.kind === tab).map((s) => s.id));
          list = list.filter((i) => ids.has(i.id));
          break;
        }
        case "continue": {
          const ids = new Set(recent.filter((s) => s.kind === tab).map((s) => s.id));
          list = list.filter((i) => ids.has(i.id));
          break;
        }
      }
    }
    return list;
  }, [allItems, subNav, category, saved, recent, stats, tab]);

  /* ---------- helpers ---------- */
  const toggleSave = (item: WatchItemDef) => {
    const cur = lsGet<SavedEntry[]>(SAVED_KEY, []);
    const exists = cur.find((s) => s.id === item.id && s.kind === tab);
    const next = exists
      ? cur.filter((s) => !(s.id === item.id && s.kind === tab))
      : [
          { id: item.id, kind: tab, title: item.title, at: Date.now() },
          ...cur,
        ];
    lsSet(SAVED_KEY, next.slice(0, 200));
    setSaved(next);
  };

  const isSaved = (id: string) => saved.some((s) => s.id === id && s.kind === tab);

  const openItem = useCallback(
    (item: WatchItemDef, kind: Tab) => {
      setSelected(item);
      setMyRating(0);
      setComments([]);
      setCommentText("");
      /* recent list */
      const cur = lsGet<RecentEntry[]>(RECENT_KEY, []).filter(
        (r) => !(r.id === item.id && r.kind === kind)
      );
      const next = [
        { id: item.id, kind, title: item.title, at: Date.now(), watchedAt: Date.now() },
        ...cur,
      ];
      lsSet(RECENT_KEY, next.slice(0, 40));
      setRecent(next);
      /* register view */
      void api("/api/watch/view", {
        method: "POST",
        body: JSON.stringify({ kind: item.kind, itemKey: item.id }),
      });
      /* comments */
      void api<{ comments?: CommentRow[] }>(
        `/api/watch/comments?item=${encodeURIComponent(item.id)}`
      ).then((r) => setComments(r.data.comments ?? []));
      /* up next */
      const pool = (kind === "anime" ? catalog.anime : catalog.movies).filter(
        (m) => m.id !== item.id
      );
      setUpNext(pool.slice(0, 6));
    },
    [catalog]
  );

  const rate = async (stars: number) => {
    if (!selected) return;
    setMyRating(stars);
    const r = await api<{ rating?: number; count?: number }>("/api/watch/view", {
      method: "POST",
      body: JSON.stringify({
        kind: selected.kind,
        itemKey: selected.id,
        action: "rate",
        rating: stars,
      }),
    });
    if (r.ok && r.data.rating != null) {
      setStats((s) => ({
        ...s,
        [selected.id]: {
          views: s[selected.id]?.views ?? 0,
          rating: r.data.rating!,
          ratingCount: r.data.count ?? 0,
        },
      }));
    }
  };

  const postComment = async () => {
    if (!selected || !commentText.trim()) return;
    setCommentPosting(true);
    const r = await api<{ comment?: CommentRow }>("/api/watch/comments", {
      method: "POST",
      body: JSON.stringify({ itemKey: selected.id, content: commentText }),
    });
    setCommentPosting(false);
    if (r.ok && r.data.comment) {
      setComments((c) => [r.data.comment!, ...c]);
      setCommentText("");
    } else if ((r.data as { error?: string })?.error) {
      setYtError((r.data as { error?: string }).error!);
      setTimeout(() => setYtError(""), 3000);
    }
  };

  const addYouTube = () => {
    const t = ytInput.trim();
    if (!t) return;
    /* bare 11-char id, youtu.be, watch?v=, shorts, embed */
    let id = "";
    if (/^[\w-]{11}$/.test(t)) id = t;
    else {
      const m = t.match(
        /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
      );
      if (m) id = m[1];
    }
    if (!id) {
      setYtError("Paste a valid YouTube link or 11-character video ID.");
      setTimeout(() => setYtError(""), 4000);
      return;
    }
    const cur = lsGet<SavedEntry[]>(SAVED_KEY, []);
    if (!cur.find((s) => s.id === id && s.kind === "youtube")) {
      const next = [
        { id, kind: "youtube" as Tab, title: `YouTube · ${id}`, at: Date.now() },
        ...cur,
      ];
      lsSet(SAVED_KEY, next);
      setSaved(next);
    }
    setYtInput("");
    setTab("youtube");
    setSubNav("browse");
  };

  const removeSaved = (id: string, kind: Tab) => {
    const next = saved.filter((s) => !(s.id === id && s.kind === kind));
    lsSet(SAVED_KEY, next);
    setSaved(next);
  };

  /* ---------- render helpers ---------- */
  const itemStat = (id: string) => stats[id];

  const Card = ({ item }: { item: WatchItemDef }) => (
    <button
      onClick={() => openItem(item, item.kind === "anime" ? "anime" : item.kind === "youtube" ? "youtube" : "movies")}
      className="group text-left rounded-lg border border-[#1a1a1a] bg-[#080808] overflow-hidden transition-colors hover:border-[#3a3a3a] hover:bg-[#0d0d0d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
      <div className="relative aspect-video bg-[#050505] flex items-center justify-center">
        {item.kind === "youtube" ? (
          <YoutubeIcon className="size-8 text-[#555] group-hover:text-white transition-colors" />
        ) : (
          <Film className="size-8 text-[#555] group-hover:text-white transition-colors" />
        )}
        <span className="absolute bottom-1.5 right-1.5 font-mono text-[10px] text-[#777] bg-black/70 rounded px-1">
          {item.year || item.duration || "—"}
        </span>
        {isSaved(item.id) && (
          <BookmarkCheck className="absolute top-1.5 left-1.5 size-3.5 text-white" />
        )}
      </div>
      <div className="p-2.5">
        <div className="text-[13px] text-white font-medium truncate">{item.title}</div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-[#666] truncate">
            {item.meta || item.source}
          </span>
          {itemStat(item.id)?.rating ? (
            <span className="flex items-center gap-1 text-[11px] text-[#9a9a9a] shrink-0">
              <Star className="size-3" /> {itemStat(item.id).rating}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );

  /* ---------- player ---------- */
  if (selected) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b border-[#141414] px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(null)}
            className="text-[#9a9a9a] hover:text-white hover:bg-[#101010]"
          >
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{selected.title}</h2>
            <p className="text-[11px] text-[#666] truncate">
              {selected.meta} · {selected.source}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSave(selected)}
              className={
                isSaved(selected.id)
                  ? "bg-white text-black border-white hover:bg-[#e0e0e0]"
                  : "border-[#2a2a2a] text-white hover:bg-[#101010]"
              }
            >
              {isSaved(selected.id) ? (
                <BookmarkCheck className="size-4 mr-1" />
              ) : (
                <Bookmark className="size-4 mr-1" />
              )}
              {isSaved(selected.id) ? "Saved" : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Report problem"
              onClick={() => {
                setReportTarget({ kind: "link", target: selected.sourceUrl });
                openModal("report");
              }}
              className="text-[#666] hover:text-white"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 grid lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col min-w-0">
            <div className="bg-black">
              <div className="aspect-video max-h-[70vh] w-full">
                <iframe
                  key={selected.id}
                  src={selected.sourceUrl}
                  title={selected.title}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  referrerPolicy="noreferrer"
                  allowFullScreen
                />
              </div>
            </div>
            <div className="px-4 py-4 border-b border-[#141414]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] text-[#777]">
                  {itemStat(selected.id)?.views
                    ? `${itemStat(selected.id)!.views.toLocaleString()} views`
                    : "Streaming from " + selected.source}
                </span>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Rate this title">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={myRating === n}
                      aria-label={`Rate ${n} stars`}
                      onClick={() => void rate(n)}
                      className="p-0.5 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`size-4 ${
                          n <= myRating ? "fill-white text-white" : "text-[#444]"
                        }`}
                      />
                    </button>
                  ))}
                  {itemStat(selected.id)?.rating != null && (
                    <span className="text-[11px] text-[#777] ml-1">
                      {itemStat(selected.id)!.rating} avg · {itemStat(selected.id)!.ratingCount} ratings
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[13px] text-[#8f8f8f] leading-relaxed max-w-3xl">
                {selected.desc}
              </p>
            </div>

            {/* comments */}
            <div className="px-4 py-4">
              <h3 className="text-sm font-semibold text-white mb-3">
                Comments <span className="text-[#555] font-normal">({comments.length})</span>
              </h3>
              <div className="flex gap-2 mb-4">
                <Textarea
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your thoughts (sign in to comment with your username)…"
                  rows={2}
                  maxLength={500}
                  className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30 min-h-0"
                />
                <Button
                  onClick={() => void postComment()}
                  disabled={!commentText.trim() || commentPosting}
                  className="bg-white text-black hover:bg-[#e0e0e0] self-start"
                  aria-label="Post comment"
                >
                  <Send className="size-4" />
                </Button>
              </div>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 memphis-scroll">
                {comments.length === 0 && (
                  <p className="text-[13px] text-[#666]">No comments yet — be the first.</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="text-[13px]">
                    <span className="text-white font-medium">{c.author}</span>{" "}
                    <span className="text-[#555] text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                    <p className="text-[#9a9a9a] mt-0.5 whitespace-pre-wrap break-words">
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* up next */}
          <aside className="border-t lg:border-t-0 lg:border-l border-[#141414] p-3">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#666] mb-3">
              Up next
            </h3>
            <ScrollArea className="h-full max-h-[70vh]">
              <div className="space-y-2 pr-2">
                {upNext.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openItem(m, m.kind === "anime" ? "anime" : "movies")}
                    className="w-full flex gap-2.5 text-left rounded-md border border-[#161616] bg-[#080808] p-2 hover:border-[#333] transition-colors"
                  >
                    <div className="size-16 shrink-0 rounded bg-[#050505] flex items-center justify-center">
                      <Film className="size-4 text-[#555]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-white font-medium truncate">
                        {m.title}
                      </div>
                      <div className="text-[11px] text-[#666] truncate">{m.meta}</div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </aside>
        </div>
      </div>
    );
  }

  /* ---------- browse ---------- */
  return (
    <div className="flex-1">
      {/* header */}
      <div className="border-b border-[#141414] px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clapperboard className="size-5" /> Movy
          </h1>
          <div className="flex rounded-lg border border-[#1f1f1f] overflow-hidden">
            {(["movies", "anime", "youtube"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setVisible(PAGE);
                }}
                className={`px-3 py-1.5 text-[13px] capitalize transition-colors ${
                  tab === t
                    ? "bg-white text-black"
                    : "text-[#9a9a9a] hover:bg-[#101010] hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {(["browse", "saved", "recent"] as SubNav[]).map((s) => (
              <button
                key={s}
                onClick={() => setSubNav(s)}
                className={`px-2.5 py-1 text-[12px] rounded-md transition-colors ${
                  subNav === s
                    ? "text-white bg-[#141414]"
                    : "text-[#777] hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* youtube input */}
        {tab === "youtube" && (
          <div className="mt-4 flex gap-2 max-w-xl">
            <Input
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addYouTube()}
              placeholder="Paste a YouTube link or video ID to watch it here…"
              aria-label="YouTube link"
              className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30"
            />
            <Button
              onClick={addYouTube}
              className="bg-white text-black hover:bg-[#e0e0e0] shrink-0"
            >
              <Play className="size-4 mr-1" /> Watch
            </Button>
          </div>
        )}
        {ytError && (
          <p className="mt-2 text-[12px] text-white bg-[#1a1a1a] border border-[#333] rounded px-2.5 py-1.5 inline-block">
            {ytError}
          </p>
        )}

        {/* categories */}
        {tab !== "youtube" && subNav === "browse" && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                  category === c.id
                    ? "border-white text-white bg-[#141414]"
                    : "border-[#1f1f1f] text-[#888] hover:border-[#3a3a3a] hover:text-white"
                }`}
              >
                <c.icon className="size-3" /> {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* body */}
      <div className="p-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#141414]">
                <div className="aspect-video bg-[#0a0a0a] shimmer" />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-3 w-3/4 bg-[#141414] rounded shimmer" />
                  <div className="h-2.5 w-1/2 bg-[#101010] rounded shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-[#9a9a9a]">{error}</p>
            <Button
              onClick={() => void loadCatalog()}
              variant="outline"
              className="mt-4 border-[#2a2a2a] text-white hover:bg-[#101010]"
            >
              <RefreshCw className="size-4 mr-2" /> Retry
            </Button>
          </div>
        ) : listed.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-[#9a9a9a]">
              {tab === "youtube"
                ? "Nothing here yet — paste a YouTube link above to start watching."
                : subNav === "saved"
                  ? "Nothing saved yet — tap Save on a title to keep it here."
                  : subNav === "recent"
                    ? "No watch history yet."
                    : "This title isn't available to stream."}
            </p>
            <p className="text-[12px] text-[#555] mt-1.5">
              Try another category or check back later.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {listed.slice(0, visible).map((item) => (
                <Card key={item.id} item={item} />
              ))}
            </div>
            {visible < listed.length && (
              <div className="mt-6 text-center">
                <Button
                  variant="outline"
                  onClick={() => setVisible((v) => v + PAGE)}
                  className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                >
                  Load more
                </Button>
                <p className="text-[11px] text-[#555] mt-2">
                  {Math.min(visible, listed.length)} / {listed.length} titles
                </p>
              </div>
            )}
          </>
        )}

        {/* saved management (youtube tab) */}
        {tab === "youtube" && saved.filter((s) => s.kind === "youtube").length > 0 && (
          <section className="mt-8 border-t border-[#141414] pt-5">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#666] mb-3">
              Saved YouTube videos
            </h3>
            <ul className="space-y-1.5">
              {saved
                .filter((s) => s.kind === "youtube")
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 text-[13px] group"
                  >
                    <button
                      onClick={() =>
                        openItem(
                          {
                            id: s.id,
                            title: s.title,
                            meta: "YouTube",
                            desc: "Saved YouTube video.",
                            kind: "youtube",
                            source: "YouTube",
                            sourceUrl: `https://www.youtube-nocookie.com/embed/${s.id}`,
                          },
                          "youtube"
                        )
                      }
                      className="text-[#c9c9c9] hover:text-white truncate"
                    >
                      <Play className="size-3.5 inline mr-1.5 -mt-0.5" />
                      {s.title}
                    </button>
                    <button
                      onClick={() => removeSaved(s.id, "youtube")}
                      aria-label={`Remove ${s.title}`}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-[#666] hover:text-white p-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
