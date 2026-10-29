"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameDef } from "@/lib/types";
import { useUI, lsGet, lsSet } from "@/lib/store";
import { proxiedHref } from "@/lib/scramjet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  X,
  Star,
  Flag,
  Maximize2,
  Minimize,
  RotateCw,
  ExternalLink,
  Loader2,
  Trophy,
} from "lucide-react";

import Game2048 from "./builtin/game-2048";
import Snake from "./builtin/snake";
import Tetris from "./builtin/tetris";
import Minesweeper from "./builtin/minesweeper";
import Breakout from "./builtin/breakout";
import Flappy from "./builtin/flappy";
import Pong from "./builtin/pong";
import Memory from "./builtin/memory";
import TicTacToe from "./builtin/tictactoe";
import Simon from "./builtin/simon";
import Asteroids from "./builtin/asteroids";
import Clicker from "./builtin/clicker";

const BUILTIN: Record<string, React.ComponentType> = {
  "2048": Game2048,
  snake: Snake,
  tetris: Tetris,
  minesweeper: Minesweeper,
  breakout: Breakout,
  flappy: Flappy,
  pong: Pong,
  memory: Memory,
  tictactoe: TicTacToe,
  simon: Simon,
  asteroids: Asteroids,
  clicker: Clicker,
};

interface ScoreRow {
  id: string;
  name: string;
  score: number;
  createdAt: string;
}

export function GamePlayer({
  game,
  onClose,
}: {
  game: GameDef;
  onClose: () => void;
}) {
  const { setReportTarget, openModal } = useUI();
  /* sites that refuse iframes (px flag in the catalog) start proxied */
  const [embedMode, setEmbedMode] = useState<"direct" | "proxy">(game.proxy ? "proxy" : "direct");
  const [proxySrc, setProxySrc] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fav, setFav] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /* leaderboard (built-in games with scores) */
  const [showScores, setShowScores] = useState(false);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  /* iframes never fire `error` for X-Frame-Options/CSP refusals — track
     whether the load event arrived so the timeout heuristic can tell
     "still nothing after 9s" (dead server / hard block) from "loaded" */
  const iframeLoadedRef = useRef(false);

  useEffect(() => {
    setFav(lsGet<string[]>("memphis-fav-games", []).includes(game.id));
    const recent = lsGet<string[]>("memphis-recent-games", []).filter((x) => x !== game.id);
    recent.unshift(game.id);
    lsSet("memphis-recent-games", recent.slice(0, 50));
  }, [game.id]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) document.exitFullscreen();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleFav = () => {
    const favs = lsGet<string[]>("memphis-fav-games", []);
    const next = favs.includes(game.id)
      ? favs.filter((x) => x !== game.id)
      : [...favs, game.id];
    lsSet("memphis-fav-games", next);
    setFav(next.includes(game.id));
    toast(next.includes(game.id) ? "Added to favorites" : "Removed from favorites");
  };

  const goFullscreen = async () => {
    if (!overlayRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else {
      await overlayRef.current.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  };

  const switchToProxy = () => {
    setEmbedMode("proxy");
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  };

  /* encode the game url through the scramjet engine when proxy mode is on */
  useEffect(() => {
    if (embedMode !== "proxy" || !game.url) return;
    let cancelled = false;
    proxiedHref(game.url)
      .then((href) => {
        if (!cancelled) setProxySrc(href);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [embedMode, game.url]);

  /* embed-failure heuristic: direct embeds that produce NO load event
     within 9s are treated as failed (down / blocked). Refusals that DO
     fire load stay on the manual "not working?" path — browsers give
     no signal to tell them apart from a successful cross-origin load. */
  const embedKey = `${embedMode}-${reloadKey}`;
  useEffect(() => {
    iframeLoadedRef.current = false;
    if (game.builtin || !game.url) return;
    const t = setTimeout(() => {
      if (!iframeLoadedRef.current) setLoadFailed(true);
    }, 9000);
    return () => clearTimeout(t);
  }, [embedKey, game.builtin, game.url]);

  /* ---------- leaderboard ---------- */
  const loadScores = useCallback(async () => {
    if (!game.builtin || !game.hasScore) return;
    setScoresLoading(true);
    try {
      const r = await fetch(`/api/games/scores?game=${encodeURIComponent(game.id)}`);
      const data = (await r.json().catch(() => ({}))) as { scores?: ScoreRow[] };
      setScores(data.scores ?? []);
    } catch {
      setScores([]);
    } finally {
      setScoresLoading(false);
    }
  }, [game.id, game.builtin, game.hasScore]);

  useEffect(() => {
    if (showScores) void loadScores();
  }, [showScores, loadScores]);

  /* switching games (catalog → player) resets the mode from the flag */
  useEffect(() => {
    setEmbedMode(game.proxy ? "proxy" : "direct");
    setProxySrc("");
    setLoadFailed(false);
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const Builtin = game.builtin ? BUILTIN[game.id] : null;
  const scoresOpen = showScores && game.builtin && game.hasScore;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      role="dialog"
      aria-label={`${game.name} player`}
    >
      {/* player chrome */}
      <div className="flex items-center justify-between gap-2 px-3 h-12 border-b border-[#141414] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-[#141414] size-8"
            onClick={onClose}
            aria-label="Close game"
          >
            <X className="size-4" />
          </Button>
          <span className="text-sm font-semibold text-white truncate">
            {game.name}
          </span>
          <span className="hidden sm:inline text-[11px] text-[#666] truncate">
            {game.desc}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#141414] size-8"
            onClick={toggleFav}
            aria-label={fav ? "Remove from favorites" : "Add to favorites"}
            title="Favorite"
          >
            <Star className={`size-4 ${fav ? "fill-white text-white" : ""}`} />
          </Button>
          {game.builtin && game.hasScore && (
            <Button
              variant="ghost"
              size="icon"
              className={`size-8 hover:bg-[#141414] ${showScores ? "text-white" : "text-[#9a9a9a] hover:text-white"}`}
              onClick={() => setShowScores((s) => !s)}
              aria-label="Toggle top scores"
              aria-pressed={showScores}
              title="Top scores"
            >
              <Trophy className="size-4" />
            </Button>
          )}
          {!game.builtin && (
            <Button
              variant="ghost"
              size="icon"
              className="text-[#9a9a9a] hover:text-white hover:bg-[#141414] size-8"
              onClick={() => setReloadKey((k) => k + 1)}
              aria-label="Reload game"
              title="Reload"
            >
              <RotateCw className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#141414] size-8"
            onClick={goFullscreen}
            aria-label="Toggle fullscreen"
            title="Fullscreen"
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#141414] size-8"
            onClick={() => {
              setReportTarget({ kind: "game", target: game.name });
              openModal("report");
            }}
            aria-label="Report game not working"
            title="Game not working?"
          >
            <Flag className="size-4" />
          </Button>
        </div>
      </div>

      {/* stage */}
      <div className="flex-1 min-h-0 relative bg-black">
        {scoresOpen && (
          <div className="absolute right-2 top-2 z-20 w-64 max-h-[75%] overflow-y-auto bg-black border border-[#262626] rounded-md p-3 shadow-2xl memphis-scroll">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Trophy className="size-3.5" /> Top scores
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-[#888] hover:text-white"
                  onClick={() => void loadScores()}
                  aria-label="Refresh scores"
                  title="Refresh"
                >
                  <RotateCw className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-[#888] hover:text-white"
                  onClick={() => setShowScores(false)}
                  aria-label="Close scores"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            {scoresLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-white" />
              </div>
            ) : scores.length === 0 ? (
              <p className="text-[11px] text-[#777]">No scores yet — be the first.</p>
            ) : (
              <ol className="space-y-1">
                {scores.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-[#aaa] truncate">
                      <span className="text-[#555] mr-1">{i + 1}.</span>
                      {s.name}
                    </span>
                    <span className="text-white shrink-0">{s.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-2 pt-2 border-t border-[#1a1a1a] text-[10px] text-[#555]">
              {game.scoreLabel ?? "points"} · top 15 · {game.name}
            </p>
          </div>
        )}
        {Builtin ? (
          <Builtin />
        ) : loadFailed ? (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm text-white max-w-md">
              {game.name} would not load — its server may refuse embedding.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {embedMode === "direct" && (
                <Button
                  onClick={switchToProxy}
                  className="bg-white text-black hover:bg-[#e0e0e0]"
                >
                  Load through Memphis proxy
                </Button>
              )}
              <Button
                variant="outline"
                className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                onClick={() => {
                  setReportTarget({ kind: "game", target: game.name });
                  openModal("report");
                }}
              >
                <Flag className="size-4 mr-2" /> Report it
              </Button>
              <Button
                variant="outline"
                className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                onClick={() => window.open(game.url, "_blank")}
              >
                <ExternalLink className="size-4 mr-2" /> Open source site
              </Button>
            </div>
          </div>
        ) : embedMode === "proxy" && !proxySrc ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="size-6 animate-spin text-white" />
            <p className="text-xs font-mono text-[#777] boot-pulse">routing through scramjet…</p>
          </div>
        ) : (
          <iframe
            key={embedKey}
            src={embedMode === "proxy" ? proxySrc : game.url}
            className="w-full h-full border-0 bg-black"
            title={game.name}
            allow="fullscreen; autoplay; gamepad; clipboard-write"
            onLoad={() => {
              iframeLoadedRef.current = true;
            }}
            onError={() => setLoadFailed(true)}
          />
        )}
      </div>

      {/* bottom bar for embedded games */}
      {!game.builtin && !loadFailed && (
        <div className="flex items-center justify-between gap-2 px-3 h-9 border-t border-[#141414] shrink-0">
          <span className="text-[10px] text-[#555] font-mono truncate">
            {embedMode === "proxy" ? "via Memphis proxy" : "direct embed"} · {elapsed}s
          </span>
          <div className="flex gap-3 shrink-0">
            <button
              className="text-[10px] text-[#777] hover:text-white u-link"
              onClick={() =>
                embedMode === "proxy"
                  ? (setEmbedMode("direct"), setReloadKey((k) => k + 1))
                  : switchToProxy()
              }
            >
              {embedMode === "proxy" ? "try direct embed" : "load via proxy"}
            </button>
            <button
              className="text-[10px] text-[#777] hover:text-white u-link"
              onClick={() => setLoadFailed(true)}
            >
              not working?
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
