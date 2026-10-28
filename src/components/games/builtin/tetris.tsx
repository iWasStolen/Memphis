"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useRaf, useSubmitScore, fitCanvas } from "./shared";

const COLS = 10;
const ROWS = 20;
const CELL = 26;
const W = COLS * CELL;
const H = ROWS * CELL;

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],                        // I
  [[1, 1], [1, 1]],                      // O
  [[0, 1, 0], [1, 1, 1]],                // T
  [[1, 0, 0], [1, 1, 1]],                // L
  [[0, 0, 1], [1, 1, 1]],                // J
  [[0, 1, 1], [1, 1, 0]],                // S
  [[1, 1, 0], [0, 1, 1]],                // Z
];
const GRAYS = ["#ffffff", "#c8c8c8", "#a0a0a0", "#787878", "#5c5c5c", "#484848", "#3a3a3a"];

interface Piece {
  shape: number[][];
  x: number;
  y: number;
  kind: number;
}

function rotate(m: number[][]): number[][] {
  return m[0].map((_, i) => m.map((row) => row[i]).reverse());
}

export default function Tetris() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [over, setOver] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const board = useRef<number[][]>(
    Array.from({ length: ROWS }, () => Array(COLS).fill(-1))
  );
  const piece = useRef<Piece | null>(null);
  const acc = useRef(0);
  const alive = useRef(true);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);

  const spawn = () => {
    const kind = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[kind];
    const p: Piece = {
      shape,
      kind,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: 0,
    };
    if (collides(p.shape, p.x, p.y)) {
      alive.current = false;
      setOver(true);
    } else {
      piece.current = p;
    }
  };

  const collides = (shape: number[][], px: number, py: number) => {
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = px + c;
        const y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board.current[y][x] >= 0) return true;
      }
    return false;
  };

  const lock = () => {
    const p = piece.current;
    if (!p) return;
    p.shape.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v && p.y + r >= 0) board.current[p.y + r][p.x + c] = p.kind;
      })
    );
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board.current[r].every((v) => v >= 0)) {
        board.current.splice(r, 1);
        board.current.unshift(Array(COLS).fill(-1));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      linesRef.current += cleared;
      setLines(linesRef.current);
      scoreRef.current += [0, 100, 300, 500, 800][cleared] * levelRef.current;
      setScore(scoreRef.current);
      const nl = Math.floor(linesRef.current / 10) + 1;
      if (nl !== levelRef.current) {
        levelRef.current = nl;
        setLevel(nl);
      }
    }
    spawn();
  };

  const step = () => {
    const p = piece.current;
    if (!p) return;
    if (!collides(p.shape, p.x, p.y + 1)) p.y++;
    else lock();
  };

  const restart = () => {
    board.current = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    piece.current = null;
    alive.current = true;
    acc.current = 0;
    scoreRef.current = 0;
    linesRef.current = 0;
    levelRef.current = 1;
    setScore(0); setLines(0); setLevel(1); setOver(false);
    submitted.current = false;
    spawn();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const p = piece.current;
      if (!p || !alive.current) return;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(e.key))
        e.preventDefault();
      if (e.key === "ArrowLeft" && !collides(p.shape, p.x - 1, p.y)) p.x--;
      else if (e.key === "ArrowRight" && !collides(p.shape, p.x + 1, p.y)) p.x++;
      else if (e.key === "ArrowDown") step();
      else if (e.key === "ArrowUp" || e.key === "w") {
        const r = rotate(p.shape);
        let kick = 0;
        while (collides(r, p.x + kick, p.y) && Math.abs(kick) < 3)
          kick = kick >= 0 ? -(kick + 1) : -kick;
        if (!collides(r, p.x + kick, p.y)) {
          p.shape = r;
          p.x += kick;
        }
      } else if (e.key === " ") {
        while (!collides(p.shape, p.x, p.y + 1) && piece.current) piece.current.y++;
        lock();
      }
    };
    window.addEventListener("keydown", handler, { passive: false });
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useRaf((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!canvas.width) fitCanvas(canvas, W, H);

    if (alive.current) {
      if (!piece.current) spawn();
      acc.current += dt;
      const interval = Math.max(90, 600 - (levelRef.current - 1) * 55);
      while (acc.current >= interval && alive.current) {
        acc.current -= interval;
        step();
      }
    }

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#0d0d0d";
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
    }
    const drawCell = (x: number, y: number, kind: number, alpha = 1) => {
      if (y < 0) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = GRAYS[kind];
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      ctx.globalAlpha = 1;
    };
    board.current.forEach((row, r) =>
      row.forEach((v, c) => v >= 0 && drawCell(c, r, v))
    );
    const p = piece.current;
    if (p && alive.current) {
      p.shape.forEach((row, r) =>
        row.forEach((v, c) => v && drawCell(p.x + c, p.y + r, p.kind))
      );
      let gy = p.y;
      while (!collides(p.shape, p.x, gy + 1)) gy++;
      p.shape.forEach((row, r) =>
        row.forEach((v, c) => v && drawCell(p.x + c, gy + r, p.kind, 0.18))
      );
    }
  }, true);

  return (
    <GameChrome
      title="Tetris"
      scoreLabel="score"
      score={score.toLocaleString()}
      extra={
        <span className="font-mono text-xs text-[#666] hidden sm:inline">
          L{level} · {lines} lines
        </span>
      }
      onRestart={restart}
      over={over}
      overScore={`Score: ${score.toLocaleString()} · ${lines} lines`}
      onOverSubmit={
        score > 0 && !submitted.current
          ? () => { submitted.current = true; submitScore("tetris", score); }
          : undefined
      }
    >
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-[#1a1a1a] max-w-full"
          aria-label="Tetris board"
        />
        <p className="mt-3 text-center text-[11px] text-[#666]">
          ← → move · ↑ rotate · ↓ soft drop · space hard drop
        </p>
      </div>
    </GameChrome>
  );
}
