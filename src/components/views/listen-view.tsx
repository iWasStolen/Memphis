"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, getSocket, emitAck } from "@/lib/socket";
import { lsGet, lsSet, getToken } from "@/lib/store";
import { TrackDef } from "@/lib/types";
import { STATIONS, GENRES, MusicEngine, fmtTime } from "@/lib/music-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Music4,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Heart,
  ListPlus,
  ListMusic,
  Search,
  Compass,
  Clock,
  Library,
  Users,
  Send,
  Plus,
  X,
} from "lucide-react";

type Nav = "browse" | "search" | "discover" | "favourites" | "recent" | "queue" | "playlists";

interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

const FAV_KEY = "memphis-music-fav";
const RECENT_KEY = "memphis-music-recent";
const QUEUE_KEY = "memphis-music-queue";
const PLAYLIST_KEY = "memphis-music-playlists";

const NAV_ITEMS: { id: Nav; label: string; icon: typeof Music4 }[] = [
  { id: "browse", label: "Browse", icon: Music4 },
  { id: "search", label: "Search", icon: Search },
  { id: "discover", label: "Discover", icon: Compass },
];

const LIBRARY_ITEMS: { id: Nav; label: string; icon: typeof Music4 }[] = [
  { id: "favourites", label: "Favourites", icon: Heart },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "queue", label: "Queue", icon: ListMusic },
  { id: "playlists", label: "Playlists", icon: ListPlus },
];

function TrackRow({
  track,
  active,
  playing,
  fav,
  onPlay,
  onFav,
  onQueue,
  index,
}: {
  track: TrackDef;
  active: boolean;
  playing: boolean;
  fav: boolean;
  onPlay: () => void;
  onFav: () => void;
  onQueue: () => void;
  index: number;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-md px-2.5 py-2 border transition-colors ${
        active
          ? "border-[#333] bg-[#0d0d0d]"
          : "border-transparent hover:border-[#1f1f1f] hover:bg-[#0a0a0a]"
      }`}
    >
      <button
        onClick={onPlay}
        aria-label={`Play ${track.title}`}
        className="size-8 shrink-0 rounded-full border border-[#262626] flex items-center justify-center hover:bg-white hover:text-black hover:border-white transition-colors text-white"
      >
        {active && playing ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5 ml-0.5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] truncate ${active ? "text-white font-medium" : "text-[#d5d5d5]"}`}>
          {track.title}
        </div>
        <div className="text-[11px] text-[#666] truncate">
          {track.artist} · {track.genre} · {track.bpm} BPM
        </div>
      </div>
      <span className="text-[11px] text-[#555] font-mono hidden sm:block">
        {fmtTime(track.dur)}
      </span>
      <button
        onClick={onFav}
        aria-label={fav ? "Unfavourite" : "Favourite"}
        aria-pressed={fav}
        className={`p-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${
          fav ? "opacity-100" : ""
        }`}
      >
        <Heart className={`size-4 ${fav ? "fill-white text-white" : "text-[#777] hover:text-white"}`} />
      </button>
      <button
        onClick={onQueue}
        aria-label="Add to queue"
        className="p-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#777] hover:text-white"
      >
        <ListPlus className="size-4" />
      </button>
      <span className="w-6 text-right text-[11px] text-[#444] font-mono hidden md:block">
        {index + 1}
      </span>
    </div>
  );
}

export default function ListenView() {
  const { user } = useAuth();
  const [nav, setNav] = useState<Nav>("browse");
  const [genre, setGenre] = useState("All");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<TrackDef | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [fav, setFav] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [addTarget, setAddTarget] = useState<TrackDef | null>(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyJoined, setPartyJoined] = useState(false);
  const [partyMembers, setPartyMembers] = useState(0);
  const [partyState, setPartyState] = useState<{
    trackId: string;
    position: number;
    playing: boolean;
    host: string;
  } | null>(null);
  const [partyChat, setPartyChat] = useState<{ by: string; text: string }[]>([]);
  const [partyInput, setPartyInput] = useState("");
  const [isPartyHost, setIsPartyHost] = useState(false);
  const engineRef = useRef<MusicEngine | null>(null);
  const broadcastRef = useRef(false);

  /* ---------- persistence ---------- */
  useEffect(() => {
    setFav(lsGet<string[]>(FAV_KEY, []));
    setRecent(lsGet<string[]>(RECENT_KEY, []));
    setQueue(lsGet<string[]>(QUEUE_KEY, []));
    setPlaylists(lsGet<Playlist[]>(PLAYLIST_KEY, []));
  }, []);

  useEffect(() => {
    if (!engineRef.current) engineRef.current = new MusicEngine();
  }, []);

  /* position ticker */
  useEffect(() => {
    const t = setInterval(() => {
      const e = engineRef.current;
      if (e && e.playing) {
        setPosition(e.position);
        /* broadcast party state every ~2s if host */
        if (broadcastRef.current && current) {
          const s = getSocket();
          if (s?.connected)
            s.emit("party:state", {
              trackId: current.id,
              position: e.position,
              playing: true,
            });
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [current]);

  /* engine onEnded -> next in queue */
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.onEnded = () => {
      setPlaying(false);
      void playNext(true);
    };
  });

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  /* ---------- playback ---------- */
  const startTrack = useCallback(
    async (track: TrackDef, startAt = 0) => {
      const e = engineRef.current;
      if (!e) return;
      e.load(track, startAt);
      setCurrent(track);
      setPosition(startAt);
      setPlaying(true);
      await e.play();
      /* recent */
      const r = lsGet<string[]>(RECENT_KEY, []).filter((x) => x !== track.id);
      const nextR = [track.id, ...r].slice(0, 60);
      lsSet(RECENT_KEY, nextR);
      setRecent(nextR);
    },
    []
  );

  const playNext = useCallback(
    async (auto = false) => {
      const q = lsGet<string[]>(QUEUE_KEY, []);
      if (!q.length) {
        /* fall through to genre radio: pick a random station */
        const pick = STATIONS[Math.floor(Math.random() * STATIONS.length)];
        if (auto || current) await startTrack(pick);
        return;
      }
      const idx = current ? q.indexOf(current.id) : -1;
      const nextId = q[idx + 1] ?? q[0];
      const track = STATIONS.find((s) => s.id === nextId);
      if (track) {
        await startTrack(track);
        const rest = q.slice(idx + 2);
        lsSet(QUEUE_KEY, rest);
        setQueue(rest);
      }
    },
    [current, startTrack]
  );

  const playPrev = useCallback(async () => {
    if (!current) return;
    const e = engineRef.current;
    if (e && e.position > 3) {
      e.seek(0);
      setPosition(0);
      return;
    }
    const r = lsGet<string[]>(RECENT_KEY, []);
    const idx = r.indexOf(current.id);
    const prevId = r[idx + 1];
    const track = STATIONS.find((s) => s.id === prevId);
    if (track) await startTrack(track);
  }, [current, startTrack]);

  const togglePlay = useCallback(async () => {
    const e = engineRef.current;
    if (!e || !current) {
      /* pick something to play */
      const first =
        STATIONS.find((s) => s.id === queue[0]) ??
        STATIONS.find((s) => genre === "All" || s.genre === genre) ??
        STATIONS[0];
      await startTrack(first);
      return;
    }
    if (e.playing) {
      e.pause();
      setPlaying(false);
    } else {
      if (e.position >= (current?.dur ?? 0) - 0.5) e.load(current, 0);
      await e.play();
      setPlaying(true);
    }
  }, [current, queue, genre, startTrack]);

  const seek = (v: number) => {
    const e = engineRef.current;
    if (!e || !current) return;
    e.seek(v);
    setPosition(v);
  };

  /* ---------- helpers ---------- */
  const toggleFav = (id: string) => {
    const cur = lsGet<string[]>(FAV_KEY, []);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
    lsSet(FAV_KEY, next);
    setFav(next);
  };

  const addToQueue = (id: string) => {
    const cur = lsGet<string[]>(QUEUE_KEY, []);
    if (!cur.includes(id)) {
      const next = [...cur, id];
      lsSet(QUEUE_KEY, next);
      setQueue(next);
    }
  };

  const removeFromQueue = (id: string) => {
    const next = queue.filter((x) => x !== id);
    lsSet(QUEUE_KEY, next);
    setQueue(next);
  };

  const createPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const pl: Playlist = {
      id: "pl-" + Date.now().toString(36),
      name,
      trackIds: addTarget ? [addTarget.id] : [],
      createdAt: Date.now(),
    };
    const next = [pl, ...playlists];
    lsSet(PLAYLIST_KEY, next);
    setPlaylists(next);
    setNewPlaylistName("");
    setAddTarget(null);
    setNewPlaylistOpen(false);
  };

  const addTrackToPlaylist = (plId: string, trackId: string) => {
    const next = playlists.map((p) =>
      p.id === plId && !p.trackIds.includes(trackId)
        ? { ...p, trackIds: [...p.trackIds, trackId] }
        : p
    );
    lsSet(PLAYLIST_KEY, next);
    setPlaylists(next);
    setAddTarget(null);
  };

  /* ---------- listen party ---------- */
  useEffect(() => {
    if (!partyJoined) return;
    const s = getSocket();
    if (!s) return;
    const onMembers = (n: number) => setPartyMembers(n);
    const onState = (st: typeof partyState) => {
      setPartyState(st);
      /* sync playback for non-hosts */
      if (st && !isPartyHost) {
        const track = STATIONS.find((x) => x.id === st.trackId);
        if (track) {
          void (async () => {
            const e = engineRef.current;
            if (!e) return;
            if (current?.id !== track.id || Math.abs(e.position - st.position) > 3) {
              await startTrack(track, st.position);
            } else if (!e.playing && st.playing) {
              await e.play();
              setPlaying(true);
            } else if (e.playing && !st.playing) {
              e.pause();
              setPlaying(false);
            }
          })();
        }
      }
    };
    const onChat = (m: { by: string; text: string }) =>
      setPartyChat((c) => [...c.slice(-80), m]);
    s.on("party:members", onMembers);
    s.on("party:state", onState);
    s.on("party:chat", onChat);
    return () => {
      s.off("party:members", onMembers);
      s.off("party:state", onState);
      s.off("party:chat", onChat);
      s.emit("party:leave");
    };
  }, [partyJoined, isPartyHost, current, startTrack]);

  const joinParty = async (asHost: boolean) => {
    if (!getToken()) return;
    const r = await emitAck<{ trackId: string; members: number }>("party:join");
    if ((r as { error?: string }).error) return;
    setIsPartyHost(asHost);
    setPartyJoined(true);
    setPartyOpen(true);
    broadcastRef.current = asHost;
  };

  const leaveParty = () => {
    setPartyJoined(false);
    setPartyOpen(false);
    broadcastRef.current = false;
    setPartyChat([]);
    setPartyMembers(0);
    setPartyState(null);
    const s = getSocket();
    s?.emit("party:leave");
  };

  const sendPartyChat = () => {
    const text = partyInput.trim();
    if (!text) return;
    getSocket()?.emit("party:chat", text);
    setPartyInput("");
  };

  /* ---------- derived lists ---------- */
  const byGenre = useMemo(
    () => (genre === "All" ? STATIONS : STATIONS.filter((s) => s.genre === genre)),
    [genre]
  );

  const discoverList = useMemo(() => {
    /* deterministic "discover": interleave styles */
    const out: TrackDef[] = [];
    const groups = GENRES.slice(1).map((g) => STATIONS.filter((s) => s.genre === g));
    let i = 0;
    while (out.length < STATIONS.length) {
      for (const g of groups) if (g[i]) out.push(g[i]);
      i++;
      if (i > 50) break;
    }
    return out;
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return STATIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q) ||
        s.style.toLowerCase().includes(q)
    );
  }, [query]);

  const listFor = (n: Nav): TrackDef[] => {
    switch (n) {
      case "favourites":
        return fav.map((id) => STATIONS.find((s) => s.id === id)).filter(Boolean) as TrackDef[];
      case "recent":
        return recent.map((id) => STATIONS.find((s) => s.id === id)).filter(Boolean) as TrackDef[];
      case "queue":
        return queue.map((id) => STATIONS.find((s) => s.id === id)).filter(Boolean) as TrackDef[];
      case "search":
        return searchResults;
      case "discover":
        return discoverList;
      default:
        return byGenre;
    }
  };

  const trackRowProps = (t: TrackDef, i: number) => ({
    track: t,
    active: current?.id === t.id,
    playing,
    fav: fav.includes(t.id),
    index: i,
    onPlay: () => void startTrack(t),
    onFav: () => toggleFav(t.id),
    onQueue: () => addToQueue(t.id),
  });

  /* ---------- render ---------- */
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* sidebar */}
        <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-[#141414]">
          <div className="p-4 border-b border-[#141414] flex items-center gap-2">
            <Music4 className="size-4 text-white" />
            <h1 className="text-sm font-semibold text-white">Music</h1>
          </div>
          <nav className="p-2" aria-label="Music navigation">
            {NAV_ITEMS.map((n) => (
              <button
                key={n.id}
                onClick={() => setNav(n.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                  nav === n.id
                    ? "bg-[#141414] text-white"
                    : "text-[#9a9a9a] hover:bg-[#0d0d0d] hover:text-white"
                }`}
              >
                <n.icon className="size-4" /> {n.label}
              </button>
            ))}
          </nav>
          <div className="px-4 pt-3 pb-1">
            <p className="mono-label">Your library</p>
          </div>
          <nav className="p-2" aria-label="Library">
            {LIBRARY_ITEMS.map((n) => (
              <button
                key={n.id}
                onClick={() => setNav(n.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                  nav === n.id
                    ? "bg-[#141414] text-white"
                    : "text-[#9a9a9a] hover:bg-[#0d0d0d] hover:text-white"
                }`}
              >
                <n.icon className="size-4" /> {n.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto p-3 border-t border-[#141414]">
            <Button
              onClick={() => (partyJoined ? leaveParty() : void joinParty(false))}
              variant="outline"
              size="sm"
              className={`w-full ${
                partyJoined
                  ? "bg-white text-black border-white hover:bg-[#e0e0e0]"
                  : "border-[#2a2a2a] text-white hover:bg-[#101010]"
              }`}
            >
              <Users className="size-4 mr-1.5" />
              {partyJoined ? `Leave party (${partyMembers})` : "Listen party"}
            </Button>
          </div>
        </aside>

        {/* main */}
        <div className="flex-1 min-w-0 overflow-y-auto memphis-scroll">
          {/* mobile nav */}
          <div className="md:hidden sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-[#141414] px-3 py-2 flex gap-1 overflow-x-auto">
            {[...NAV_ITEMS, ...LIBRARY_ITEMS].map((n) => (
              <button
                key={n.id}
                onClick={() => setNav(n.id)}
                className={`px-2.5 py-1 rounded-full text-[12px] whitespace-nowrap border ${
                  nav === n.id
                    ? "border-white text-white"
                    : "border-[#1f1f1f] text-[#888]"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>

          <div className="p-4 pb-32 space-y-6">
            {/* search bar */}
            {nav === "search" && (
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stations, artists, genres…"
                aria-label="Search music"
                className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30"
              />
            )}

            {/* genre chips */}
            {nav === "browse" && (
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={`px-3 py-1 rounded-full text-[12px] border transition-colors ${
                      genre === g
                        ? "border-white text-white bg-[#141414]"
                        : "border-[#1f1f1f] text-[#888] hover:border-[#3a3a3a] hover:text-white"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {/* playlists */}
            {nav === "playlists" && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Playlists</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNewPlaylistOpen(true)}
                    className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                  >
                    <Plus className="size-4 mr-1" /> New playlist
                  </Button>
                </div>
                {playlists.length === 0 ? (
                  <p className="text-[13px] text-[#666]">No playlists yet.</p>
                ) : (
                  <div className="space-y-4">
                    {playlists.map((pl) => (
                      <div key={pl.id} className="border border-[#161616] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-[13px] font-medium text-white">{pl.name}</h3>
                          <button
                            onClick={() => {
                              const next = playlists.filter((p) => p.id !== pl.id);
                              lsSet(PLAYLIST_KEY, next);
                              setPlaylists(next);
                            }}
                            aria-label={`Delete ${pl.name}`}
                            className="text-[#666] hover:text-white p-1"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        {pl.trackIds.length === 0 ? (
                          <p className="text-[12px] text-[#555]">
                            Empty — add tracks from Browse.
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {pl.trackIds
                              .map((id) => STATIONS.find((s) => s.id === id))
                              .filter(Boolean)
                              .map((t, i) => (
                                <TrackRow key={t!.id} {...trackRowProps(t!, i)} />
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* queue with remove */}
            {nav === "queue" && queue.length === 0 && (
              <p className="text-[13px] text-[#666]">
                Queue is empty — hover a station and press the queue icon.
              </p>
            )}

            {/* main list */}
            {nav !== "playlists" && (
              <section aria-label={nav}>
                <h2 className="text-sm font-semibold text-white capitalize mb-3">
                  {nav === "browse"
                    ? genre === "All"
                      ? "All stations"
                      : genre
                    : nav === "search"
                      ? query
                        ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
                        : "Search"
                      : nav}
                </h2>
                {listFor(nav).length === 0 ? (
                  <p className="text-[13px] text-[#666]">
                    {nav === "favourites"
                      ? "No favourites yet — tap the heart on a station."
                      : nav === "recent"
                        ? "Nothing played yet. Pick something to play."
                        : "Nothing here."}
                  </p>
                ) : nav === "queue" ? (
                  <div className="space-y-0.5">
                    {listFor(nav).map((t, i) => (
                      <div key={t.id} className="group relative">
                        <TrackRow {...trackRowProps(t, i)} />
                        <button
                          onClick={() => removeFromQueue(t.id)}
                          aria-label={`Remove ${t.title} from queue`}
                          className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 text-[#666] hover:text-white"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {listFor(nav).map((t, i) => (
                      <TrackRow key={t.id} {...trackRowProps(t, i)} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* how it works note */}
            {nav === "browse" && genre === "All" && (
              <section className="border-t border-[#141414] pt-5">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#666] mb-2">
                  About these stations
                </h3>
                <p className="text-[12px] text-[#777] leading-relaxed max-w-2xl">
                  Every station is synthesized live in your browser by the Memphis
                  generative audio engine — drums, bass, chords and melody are
                  composed on the fly from a seeded pattern, so the music never
                  streams from a server and never repeats exactly the same way.
                  Favourites, recents, queue and playlists are stored on this
                  device.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* now playing bar */}
      <div className="border-t border-[#141414] bg-[#050505] px-3 sm:px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous track"
            onClick={() => void playPrev()}
            className="text-[#9a9a9a] hover:text-white"
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => void togglePlay()}
            className="size-9 rounded-full bg-white text-black hover:bg-[#e0e0e0]"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next track"
            onClick={() => void playNext()}
            className="text-[#9a9a9a] hover:text-white"
          >
            <SkipForward className="size-4" />
          </Button>
        </div>

        <div className="hidden sm:flex items-center gap-2 w-28 shrink-0">
          <Volume2 className="size-4 text-[#777] shrink-0" />
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(v) => setVolume(v[0] ?? 0.8)}
            aria-label="Volume"
          />
        </div>

        <div className="flex-1 min-w-0 max-w-xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12px] text-white truncate">
              {current ? current.title : "Nothing playing"}
            </span>
            <span className="text-[11px] text-[#666] font-mono shrink-0">
              {fmtTime(position)} / {fmtTime(current?.dur ?? 0)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={current?.dur ?? 1}
            step={0.5}
            value={Math.min(position, current?.dur ?? 0)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            className="w-full h-1 appearance-none rounded-full bg-[#1a1a1a] accent-white cursor-pointer"
          />
        </div>

        {current && (
          <button
            onClick={() => toggleFav(current.id)}
            aria-label="Favourite current track"
            aria-pressed={fav.includes(current.id)}
            className="p-2 shrink-0"
          >
            <Heart
              className={`size-4 ${
                fav.includes(current.id)
                  ? "fill-white text-white"
                  : "text-[#777] hover:text-white"
              }`}
            />
          </button>
        )}
        <button
          onClick={() => (partyJoined ? setPartyOpen((o) => !o) : void joinParty(false))}
          aria-label="Listen party"
          className="p-2 shrink-0 relative"
        >
          <Users className={`size-4 ${partyJoined ? "text-white" : "text-[#777] hover:text-white"}`} />
          {partyJoined && partyMembers > 1 && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-white" />
          )}
        </button>
      </div>

      {/* party panel */}
      {partyOpen && partyJoined && (
        <div className="border-t border-[#141414] bg-[#080808] p-3 flex flex-col sm:flex-row gap-3 max-h-56">
          <div className="sm:w-48 shrink-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-[#666]">
              Listen party {isPartyHost ? "· hosting" : ""}
            </p>
            <p className="text-[13px] text-white mt-1">
              {partyMembers} member{partyMembers === 1 ? "" : "s"}
            </p>
            {partyState && (
              <p className="text-[12px] text-[#888] mt-1 truncate">
                {STATIONS.find((s) => s.id === partyState.trackId)?.title ?? "—"}
                {partyState.host ? ` · host ${partyState.host}` : ""}
              </p>
            )}
            <p className="text-[11px] text-[#555] mt-2 leading-relaxed">
              {isPartyHost
                ? "Your playback is synced to everyone in the party."
                : "Playback follows the host."}
            </p>
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-y-auto memphis-scroll space-y-1 max-h-24 pr-1">
              {partyChat.length === 0 && (
                <p className="text-[12px] text-[#555]">Party chat is quiet…</p>
              )}
              {partyChat.map((m, i) => (
                <p key={i} className="text-[12px]">
                  <span className="text-white font-medium">{m.by}</span>{" "}
                  <span className="text-[#999]">{m.text}</span>
                </p>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              <Input
                value={partyInput}
                onChange={(e) => setPartyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendPartyChat()}
                placeholder={getToken() ? "Message the party…" : "Sign in to chat first"}
                disabled={!getToken()}
                aria-label="Party chat"
                className="h-8 bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] text-[12px]"
              />
              <Button
                size="icon"
                aria-label="Send party message"
                onClick={sendPartyChat}
                disabled={!getToken() || !partyInput.trim()}
                className="size-8 shrink-0 bg-white text-black hover:bg-[#e0e0e0]"
              >
                <Send className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* new playlist dialog */}
      <Dialog open={newPlaylistOpen} onOpenChange={setNewPlaylistOpen}>
        <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">New playlist</DialogTitle>
            <DialogDescription className="text-xs text-[#7a7a7a]">
              {addTarget
                ? `Starting with “${addTarget.title}”.`
                : "Give your playlist a name."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
            placeholder="e.g. Late-night study"
            maxLength={40}
            className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNewPlaylistOpen(false);
                setAddTarget(null);
              }}
              className="text-[#9a9a9a] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={createPlaylist}
              disabled={!newPlaylistName.trim()}
              className="bg-white text-black hover:bg-[#e0e0e0]"
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* add-to-playlist dialog */}
      <Dialog open={!!addTarget} onOpenChange={(o) => !o && setAddTarget(null)}>
        <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Add to playlist</DialogTitle>
            <DialogDescription className="text-xs text-[#7a7a7a]">
              “{addTarget?.title}”
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto memphis-scroll">
            {playlists.length === 0 && (
              <p className="text-[13px] text-[#666]">No playlists yet — create one.</p>
            )}
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => addTarget && addTrackToPlaylist(pl.id, addTarget.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-[#d5d5d5] hover:bg-[#101010] hover:text-white text-left"
              >
                <ListMusic className="size-4 text-[#777]" />
                <span className="truncate">{pl.name}</span>
                <span className="ml-auto text-[11px] text-[#555]">
                  {pl.trackIds.length}
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setNewPlaylistOpen(true)}
            className="border-[#2a2a2a] text-white hover:bg-[#101010]"
          >
            <Plus className="size-4 mr-1.5" /> New playlist
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
