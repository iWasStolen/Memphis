"use client";

/* ============================================================
   Shared helpers for in-house games
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trophy } from "lucide-react";

/** requestAnimationFrame loop with delta time */
export function useRaf(cb: (dt: number) => void, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      ref.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/** keyboard state */
export function useKeys() {
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key))
        e.preventDefault();
    };
    const up = (e: KeyboardEvent) => (keys.current[e.key] = false);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return keys;
}

/** touch swipe detection on an element */
export function useSwipe(
  ref: React.RefObject<HTMLElement | null>,
  onSwipe: (dir: "up" | "down" | "left" | "right") => void
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0,
      sy = 0;
    const start = (e: TouchEvent) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const end = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
      else onSwipe(dy > 0 ? "down" : "up");
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
    };
  }, [ref, onSwipe]);
}

export function useSubmitScore() {
  return useCallback(async (game: string, score: number) => {
    const res = await api<{ ok: boolean }>("/api/games/scores", {
      method: "POST",
      body: JSON.stringify({ game, score }),
    });
    if (res.ok) toast.success(`Score saved: ${score.toLocaleString()}`);
    else if (res.status === 429) toast.error("Slow down — too many submissions.");
  }, []);
}

/** Chrome for canvas games: scoreboard header + game-over overlay */
export function GameChrome({
  title,
  scoreLabel,
  score,
  extra,
  onRestart,
  over,
  overTitle = "Game over",
  overScore,
  onOverSubmit,
  children,
}: {
  title: string;
  scoreLabel?: string;
  score?: React.ReactNode;
  extra?: React.ReactNode;
  onRestart: () => void;
  over?: boolean;
  overTitle?: string;
  overScore?: React.ReactNode;
  onOverSubmit?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col h-full w-full">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#141414]">
        <span className="text-sm font-semibold text-white truncate">{title}</span>
        <div className="flex items-center gap-3">
          {extra}
          {score !== undefined && (
            <span className="font-mono text-xs text-[#9a9a9a]">
              {scoreLabel}: <span className="text-white">{score}</span>
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
            onClick={onRestart}
          >
            <RotateCcw className="size-3" />
            <span className="hidden sm:inline ml-1.5">Restart</span>
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3 game-stage">
        {children}
      </div>
      {over && (
        <div className="absolute inset-x-0 top-14 bottom-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
          <div className="text-xl font-semibold text-white">{overTitle}</div>
          {overScore && (
            <div className="font-mono text-sm text-[#9a9a9a]">{overScore}</div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={onRestart}
              className="bg-white text-black hover:bg-[#e0e0e0]"
            >
              <RotateCcw className="size-4 mr-2" /> Play again
            </Button>
            {onOverSubmit && (
              <Button
                variant="outline"
                className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                onClick={onOverSubmit}
              >
                <Trophy className="size-4 mr-2" /> Save score
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** setup canvas with device pixel ratio */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number
): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = "100%";
  canvas.style.maxWidth = `${w}px`;
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
