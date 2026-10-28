"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameChrome, useRaf, useSwipe, useSubmitScore, fitCanvas } from "./shared";

const CELL = 20;
const COLS = 24;
const ROWS = 24;
const W = COLS * CELL;
const H = ROWS * CELL;

interface P {
  x: number;
  y: number;
}

export default function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(true);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const snake = useRef<P[]>([{ x: 12, y: 12 }]);
  const dir = useRef<P>({ x: 1, y: 0 });
  const pendingDir = useRef<P>({ x: 1, y: 0 });
  const food = useRef<P>({ x: 18, y: 12 });
  const acc = useRef(0);
  const alive = useRef(true);
  const scoreRef = useRef(0);

  const placeFood = () => {
    let p: P;
    do {
      p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.current.some((s) => s.x === p.x && s.y === p.y));
    food.current = p;
  };

  const restart = () => {
    snake.current = [{ x: 12, y: 12 }];
    dir.current = { x: 1, y: 0 };
    pendingDir.current = { x: 1, y: 0 };
    alive.current = true;
    acc.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setOver(false);
    setRunning(true);
    submitted.current = false;
    placeFood();
  };

  const setDir = useCallback((d: "up" | "down" | "left" | "right") => {
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const nd = map[d];
    if (nd.x === -dir.current.x && nd.y === -dir.current.y) return;
    pendingDir.current = nd;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
      };
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        setDir(d);
      }
    };
    window.addEventListener("keydown", handler, { passive: false });
    return () => window.removeEventListener("keydown", handler);
  }, [setDir]);

  useSwipe(wrapRef, setDir);

  useRaf(
    (dt) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      if (!canvas.width) fitCanvas(canvas, W, H);

      if (alive.current && running) {
        acc.current += dt;
        const speed = Math.max(70, 150 - scoreRef.current * 2);
        while (acc.current >= speed) {
          acc.current -= speed;
          dir.current = pendingDir.current;
          const head = snake.current[0];
          const nh = { x: head.x + dir.current.x, y: head.y + dir.current.y };
          if (
            nh.x < 0 || nh.y < 0 || nh.x >= COLS || nh.y >= ROWS ||
            snake.current.some((s) => s.x === nh.x && s.y === nh.y)
          ) {
            alive.current = false;
            setOver(true);
            setRunning(false);
            break;
          }
          snake.current.unshift(nh);
          if (nh.x === food.current.x && nh.y === food.current.y) {
            scoreRef.current++;
            setScore(scoreRef.current);
            placeFood();
          } else {
            snake.current.pop();
          }
        }
      }

      /* draw */
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#0e0e0e";
      for (let i = 1; i < COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(food.current.x * CELL + 4, food.current.y * CELL + 4, CELL - 8, CELL - 8);
      snake.current.forEach((s, i) => {
        const v = Math.max(0.25, 1 - i / (snake.current.length + 6));
        ctx.fillStyle = `rgba(255,255,255,${v})`;
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });
    },
    true
  );

  return (
    <GameChrome
      title="Snake"
      scoreLabel="apples"
      score={score}
      onRestart={restart}
      over={over}
      overScore={`${score} apples`}
      onOverSubmit={
        score > 0 && !submitted.current
          ? () => { submitted.current = true; submitScore("snake", score); }
          : undefined
      }
    >
      <div ref={wrapRef} className="w-full flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-[#1a1a1a] max-w-full"
          aria-label="Snake game board"
        />
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Arrows / WASD / swipe · eat white squares
        </p>
      </div>
    </GameChrome>
  );
}
