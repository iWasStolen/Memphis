"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useRaf, useSubmitScore, fitCanvas } from "./shared";

const W = 480;
const H = 360;

export default function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const paddle = useRef({ x: W / 2 - 40, w: 80 });
  const ball = useRef({ x: W / 2, y: H - 60, vx: 3, vy: -3.4, r: 6 });
  const bricks = useRef<{ x: number; y: number; alive: boolean; pts: number }[]>([]);
  const keys = useRef<Record<string, boolean>>({});
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const launched = useRef(false);

  const initBricks = () => {
    const out: typeof bricks.current = [];
    const rows = 6;
    const cols = 10;
    const bw = (W - 40) / cols;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push({ x: 20 + c * bw, y: 40 + r * 22, alive: true, pts: (rows - r) * 10 });
    bricks.current = out;
  };

  const restart = () => {
    paddle.current = { x: W / 2 - 40, w: 80 };
    ball.current = { x: W / 2, y: H - 60, vx: 3, vy: -3.4, r: 6 };
    launched.current = false;
    scoreRef.current = 0;
    livesRef.current = 3;
    setScore(0); setLives(3); setOver(false); setWon(false);
    submitted.current = false;
    initBricks();
  };

  useEffect(() => {
    restart();
    const down = (e: KeyboardEvent) => {
      keys.current[e.key] = true;
      if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (e.key === " ") launched.current = true;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.key] = false);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const movePaddleTo = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    paddle.current.x = Math.max(0, Math.min(W - paddle.current.w, x - paddle.current.w / 2));
  };

  useRaf((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!canvas.width) fitCanvas(canvas, W, H);
    const f = dt / 16.67;

    if (!over && !won) {
      if (keys.current["ArrowLeft"]) paddle.current.x -= 7 * f;
      if (keys.current["ArrowRight"]) paddle.current.x += 7 * f;
      paddle.current.x = Math.max(0, Math.min(W - paddle.current.w, paddle.current.x));

      const b = ball.current;
      if (!launched.current) {
        b.x = paddle.current.x + paddle.current.w / 2;
        b.y = H - 46;
      } else {
        b.x += b.vx * f;
        b.y += b.vy * f;
        if (b.x < b.r || b.x > W - b.r) b.vx *= -1;
        if (b.y < b.r) b.vy *= -1;
        if (b.y > H + 20) {
          livesRef.current--;
          setLives(livesRef.current);
          launched.current = false;
          b.vx = 3; b.vy = -3.4;
          if (livesRef.current <= 0) setOver(true);
        }
        const p = paddle.current;
        if (
          b.vy > 0 &&
          b.y + b.r >= H - 24 &&
          b.y < H - 12 &&
          b.x > p.x - 4 &&
          b.x < p.x + p.w + 4
        ) {
          const hit = (b.x - (p.x + p.w / 2)) / (p.w / 2);
          const speed = Math.min(7.5, Math.hypot(b.vx, b.vy) * 1.02);
          const angle = hit * 1.05;
          b.vx = Math.sin(angle) * speed;
          b.vy = -Math.abs(Math.cos(angle) * speed);
          b.y = H - 24 - b.r;
        }
        for (const br of bricks.current) {
          if (!br.alive) continue;
          if (
            b.x > br.x - b.r && b.x < br.x + 48 + b.r &&
            b.y > br.y - b.r && b.y < br.y + 18 + b.r
          ) {
            br.alive = false;
            scoreRef.current += br.pts;
            setScore(scoreRef.current);
            const ox = Math.min(Math.abs(b.x - br.x), Math.abs(b.x - br.x - 48));
            const oy = Math.min(Math.abs(b.y - br.y), Math.abs(b.y - br.y - 18));
            if (ox < oy) b.vx *= -1;
            else b.vy *= -1;
            break;
          }
        }
        if (bricks.current.every((br) => !br.alive)) {
          setWon(true);
          scoreRef.current += 200;
          setScore(scoreRef.current);
        }
      }
    }

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    bricks.current.forEach((br, i) => {
      if (!br.alive) return;
      const shade = 0.35 + (i % 6) * 0.11;
      ctx.fillStyle = `rgba(255,255,255,${shade})`;
      ctx.fillRect(br.x, br.y, 46, 16);
    });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(paddle.current.x, H - 24, paddle.current.w, 8);
    ctx.beginPath();
    ctx.arc(ball.current.x, ball.current.y, ball.current.r, 0, Math.PI * 2);
    ctx.fill();
    if (!launched.current && !over && !won) {
      ctx.fillStyle = "#8f8f8f";
      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("click / tap / space to launch", W / 2, H / 2 + 40);
    }
  }, true);

  return (
    <GameChrome
      title="Breakout"
      scoreLabel="score"
      score={score.toLocaleString()}
      extra={<span className="font-mono text-xs text-[#666]">lives {Math.max(0, lives)}</span>}
      onRestart={restart}
      over={over || won}
      overTitle={won ? "Wall cleared!" : "Game over"}
      overScore={`Score: ${score.toLocaleString()}`}
      onOverSubmit={
        score > 0 && !submitted.current
          ? () => { submitted.current = true; submitScore("breakout", score); }
          : undefined
      }
    >
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-[#1a1a1a] max-w-full touch-none"
          aria-label="Breakout board"
          onMouseMove={(e) => movePaddleTo(e.clientX)}
          onTouchMove={(e) => movePaddleTo(e.touches[0].clientX)}
          onClick={() => (launched.current = true)}
          onTouchStart={() => (launched.current = true)}
        />
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Mouse / touch / arrows to move · click or space to launch
        </p>
      </div>
    </GameChrome>
  );
}
