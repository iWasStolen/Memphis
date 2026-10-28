"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useSubmitScore } from "./shared";

interface Tile {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  n: number;
}

const LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10, label: "Easy" },
  medium: { cols: 12, rows: 12, mines: 22, label: "Medium" },
  hard: { cols: 16, rows: 14, mines: 40, label: "Hard" },
};
type LevelId = keyof typeof LEVELS;

function build(level: LevelId): Tile[][] {
  const { cols, rows, mines } = LEVELS[level];
  const g: Tile[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, n: 0 }))
  );
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!g[r][c].mine) {
      g[r][c].mine = true;
      placed++;
    }
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && g[nr][nc].mine) n++;
        }
      g[r][c].n = n;
    }
  return g;
}

const NUM_SHADE = ["", "#8f8f8f", "#a6a6a6", "#bdbdbd", "#d4d4d4", "#e0e0e0", "#eeeeee", "#f5f5f5", "#ffffff"];

export default function Minesweeper() {
  const [level, setLevel] = useState<LevelId>("easy");
  const [grid, setGrid] = useState<Tile[][]>(() => build("easy"));
  const [state, setState] = useState<"play" | "won" | "lost">("play");
  const [time, setTime] = useState(0);
  const startedAt = useRef<number | null>(null);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressed = useRef(false);

  const cfg = LEVELS[level];
  const flags = grid.flat().filter((t) => t.flagged).length;

  useEffect(() => {
    if (state !== "play" || startedAt.current === null) return;
    const t = setInterval(() => setTime(Math.floor((Date.now() - startedAt.current!) / 1000)), 500);
    return () => clearInterval(t);
  }, [state, startedAt.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = (lv: LevelId = level) => {
    setLevel(lv);
    setGrid(build(lv));
    setState("play");
    setTime(0);
    startedAt.current = null;
    submitted.current = false;
  };

  const reveal = (r: number, c: number) => {
    if (state !== "play") return;
    if (startedAt.current === null) startedAt.current = Date.now();
    setGrid((g) => {
      const n = g.map((row) => row.map((t) => ({ ...t })));
      if (n[r][c].flagged || n[r][c].revealed) return g;
      if (n[r][c].mine) {
        n.forEach((row) => row.forEach((t) => t.mine && (t.revealed = true)));
        setState("lost");
        return n;
      }
      const stack: [number, number][] = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        const t = n[cr][cc];
        if (t.revealed || t.flagged) continue;
        t.revealed = true;
        if (t.n === 0)
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const nr = cr + dr, nc = cc + dc;
              if (nr >= 0 && nc >= 0 && nr < n.length && nc < n[0].length && !n[nr][nc].mine)
                stack.push([nr, nc]);
            }
      }
      const safe = n.flat().filter((t) => !t.mine);
      if (safe.every((t) => t.revealed)) {
        setState("won");
        setTime(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
      }
      return n;
    });
  };

  const toggleFlag = (r: number, c: number) => {
    if (state !== "play") return;
    setGrid((g) => {
      const n = g.map((row) => row.map((t) => ({ ...t })));
      if (!n[r][c].revealed) n[r][c].flagged = !n[r][c].flagged;
      return n;
    });
  };

  const score = state === "won" ? Math.max(100, 2000 - time * 10) : 0;

  return (
    <GameChrome
      title="Minesweeper"
      scoreLabel="time"
      score={`${time}s`}
      extra={<span className="font-mono text-xs text-[#666]">⚑ {cfg.mines - flags}</span>}
      onRestart={() => restart()}
      over={state !== "play"}
      overTitle={state === "won" ? "Field cleared!" : "Boom."}
      overScore={
        state === "won"
          ? `${time}s on ${cfg.label} · ${score} pts`
          : "You hit a mine"
      }
      onOverSubmit={
        state === "won" && !submitted.current
          ? () => { submitted.current = true; submitScore("minesweeper", score); }
          : undefined
      }
    >
      <div className="w-full flex flex-col items-center">
        <div className="flex gap-1.5 mb-3">
          {(Object.keys(LEVELS) as LevelId[]).map((lv) => (
            <button
              key={lv}
              onClick={() => restart(lv)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                level === lv
                  ? "border-white text-white"
                  : "border-[#262626] text-[#8f8f8f] hover:text-white"
              }`}
            >
              {LEVELS[lv].label}
            </button>
          ))}
        </div>
        <div
          className="grid gap-[3px] select-none"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {grid.map((row, r) =>
            row.map((t, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => {
                  if (suppressed.current) { suppressed.current = false; return; }
                  reveal(r, c);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleFlag(r, c);
                }}
                onTouchStart={() => {
                  longPress.current = setTimeout(() => {
                    toggleFlag(r, c);
                    suppressed.current = true;
                  }, 350);
                }}
                onTouchEnd={() => {
                  if (longPress.current) clearTimeout(longPress.current);
                }}
                aria-label={`Tile ${r + 1},${c + 1}${t.revealed ? (t.mine ? " mine" : ` ${t.n}`) : t.flagged ? " flagged" : " hidden"}`}
                className={`w-[26px] h-[26px] sm:w-[28px] sm:h-[28px] rounded-[4px] border text-xs font-mono font-bold flex items-center justify-center transition-colors ${
                  t.revealed
                    ? t.mine
                      ? "bg-white text-black border-white"
                      : "bg-[#0d0d0d] border-[#161616]"
                    : "bg-[#161616] border-[#242424] hover:border-[#3a3a3a] active:bg-[#1e1e1e]"
                }`}
                style={t.revealed && !t.mine && t.n ? { color: NUM_SHADE[t.n] } : undefined}
              >
                {t.revealed ? (t.mine ? "✕" : t.n || "") : t.flagged ? "⚑" : ""}
              </button>
            ))
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Left-click reveal · right-click / long-press to flag
        </p>
      </div>
    </GameChrome>
  );
}
