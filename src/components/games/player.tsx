"use client";

import { useEffect, useRef, useState } from "react";
import { GameDef } from "@/lib/types";
import { useUI, lsGet, lsSet } from "@/lib/store";
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

function proxify(url: string) {
  return `/api/proxy?u=${encodeURIComponent(url)}`;
}

export function GamePlayer({
  game,
  onClose,
}: {
  game: GameDef;
  onClose: () => void;
}) {
  const { setReportTarget, openModal } = useUI();
  const [embedMode, setEmbedMode] = useState<"direct" | "proxy">("direct");
  const [loadFailed, setLoadFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fav, setFav] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

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

  const Builtin = game.builtin ? BUILTIN[game.id] : null;

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
                onClick={() => window.open(game.embedUrl, "_blank")}
              >
                <ExternalLink className="size-4 mr-2" /> Open source site
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            key={`${embedMode}-${reloadKey}`}
            src={embedMode === "proxy" ? proxify(game.embedUrl!) : game.embedUrl}
            className="w-full h-full border-0 bg-black"
            title={game.name}
            allow="fullscreen; autoplay; gamepad; clipboard-write"
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
