"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameChrome, useSwipe, useSubmitScore } from "./shared";

type Grid = number[][];
const SIZE = 4;

function empty(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}
function addTile(g: Grid): Grid {
  const spots: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (!g[r][c]) spots.push([r, c]);
  if (!spots.length) return g;
  const [r, c] = spots[Math.floor(Math.random() * spots.length)];
  const n = g.map((row) => [...row]);
  n[r][c] = Math.random() < 0.9 ? 2 : 4;
  return n;
}
function rotate(g: Grid): Grid {
  const n = empty();
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) n[c][SIZE - 1 - r] = g[r][c];
  return n;
}
function collapseLeft(g: Grid): { grid: Grid; gained: number } {
  let gained = 0;
  const grid = g.map((row) => {
    const f = row.filter((v) => v);
    const out: number[] = [];
    for (let i = 0; i < f.length; i++) {
      if (f[i] === f[i + 1]) {
        out.push(f[i] * 2);
        gained += f[i] * 2;
        i++;
      } else out.push(f[i]);
    }
    while (out.length < SIZE) out.push(0);
    return out;
  });
  return { grid, gained };
}
function same(a: Grid, b: Grid) {
  return a.every((row, r) => row.every((v, c) => v === b[r][c]));
}
function canMove(g: Grid) {
  for (let i = 0; i < 4; i++) {
    const { grid } = collapseLeft(g);
    if (!same(grid, g)) return true;
    g = rotate(g);
  }
  return false;
}

const TILE_STYLES: Record<number, string> = {
  0: "bg-[#0a0a0a] border-[#161616] text-transparent",
  2: "bg-[#141414] border-[#222] text-[#bbb]",
  4: "bg-[#1c1c1c] border-[#2c2c2c] text-[#ccc]",
  8: "bg-[#262626] border-[#3a3a3a] text-white",
  16: "bg-[#333] border-[#484848] text-white",
  32: "bg-[#414141] border-[#565656] text-white",
  64: "bg-[#515151] border-[#666] text-white",
  128: "bg-[#626262] border-[#777] text-white",
  256: "bg-[#747474] border-[#888] text-black",
  512: "bg-[#8a8a8a] border-[#999] text-black",
  1024: "bg-[#a8a8a8] border-[#bbb] text-black",
  2048: "bg-white border-white text-black",
};

export default function Game2048() {
  const [grid, setGrid] = useState<Grid>(() => addTile(addTile(empty())));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const submitted = useRef(false);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const wrapRef = useRef<HTMLDivElement>(null);
  const submitScore = useSubmitScore();

  const restart = () => {
    setGrid(addTile(addTile(empty())));
    setScore(0);
    setOver(false);
    setWon(false);
    submitted.current = false;
  };

  const move = useCallback(
    (dir: "left" | "right" | "up" | "down") => {
      if (over) return;
      let g = gridRef.current;
      const turns = { left: 0, up: 1, right: 2, down: 3 }[dir];
      for (let i = 0; i < turns; i++) g = rotate(g);
      const { grid: collapsed, gained } = collapseLeft(g);
      g = collapsed;
      for (let i = 0; i < (4 - turns) % 4; i++) g = rotate(g);
      if (same(g, gridRef.current)) return;
      const withTile = addTile(g);
      setGrid(withTile);
      const ns = score + gained;
      setScore(ns);
      setBest((b) => Math.max(b, ns));
      if (withTile.flat().includes(2048)) setWon(true);
      if (!canMove(withTile)) setOver(true);
    },
    [over, score]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener("keydown", handler, { passive: false });
    return () => window.removeEventListener("keydown", handler);
  }, [move]);

  useSwipe(
    wrapRef,
    useCallback(
      (d) => move(d),
      [move]
    )
  );

  return (
    <GameChrome
      title="2048"
      scoreLabel="score"
      score={score.toLocaleString()}
      extra={<span className="font-mono text-xs text-[#666]">best {best.toLocaleString()}</span>}
      onRestart={restart}
      over={over || won}
      overTitle={won ? "You reached 2048!" : "No moves left"}
      overScore={`Score: ${score.toLocaleString()}`}
      onOverSubmit={
        score > 0 && !submitted.current
          ? () => {
              submitted.current = true;
              submitScore("2048", score);
            }
          : undefined
      }
    >
      <div ref={wrapRef} className="w-full max-w-[380px]" aria-label="2048 board">
        <div className="grid grid-cols-4 gap-2 select-none">
          {grid.flatMap((row, r) =>
            row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className={`aspect-square rounded-md border flex items-center justify-center font-semibold transition-all duration-100 ${
                  TILE_STYLES[v] ?? TILE_STYLES[2048]
                } ${v > 999 ? "text-base sm:text-lg" : "text-lg sm:text-2xl"}`}
                role="gridcell"
                aria-label={v ? `${v} tile` : "empty tile"}
              >
                {v || "·"}
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Arrow keys / WASD / swipe to move
        </p>
      </div>
    </GameChrome>
  );
}
