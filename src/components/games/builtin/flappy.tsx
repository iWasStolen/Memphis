"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useRaf, useSubmitScore, fitCanvas } from "./shared";

const W = 360;
const H = 480;

export default function Flappy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const bird = useRef({ y: H / 2, vy: 0 });
  const pipes = useRef<{ x: number; gapY: number; passed: boolean }[]>([]);
  const t = useRef(0);
  const scoreRef = useRef(0);
  const alive = useRef(true);

  const reset = () => {
    bird.current = { y: H / 2, vy: 0 };
    pipes.current = [];
    t.current = 0;
    scoreRef.current = 0;
    alive.current = true;
    setScore(0); setOver(false); setStarted(false);
    submitted.current = false;
  };

  const flap = () => {
    if (over) return;
    if (!started) setStarted(true);
    bird.current.vy = -5.4;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", handler, { passive: false });
    return () => window.removeEventListener("keydown", handler);
  }, [over, started]);

  useRaf((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!canvas.width) fitCanvas(canvas, W, H);
    const f = dt / 16.67;

    if (started && alive.current) {
      t.current += dt;
      bird.current.vy += 0.28 * f;
      bird.current.y += bird.current.vy * f;

      if (t.current > 1400) {
        t.current = 0;
        pipes.current.push({
          x: W + 40,
          gapY: 90 + Math.random() * (H - 260),
          passed: false,
        });
      }
      const gap = 130;
      pipes.current.forEach((p) => (p.x -= 2.2 * f));
      pipes.current = pipes.current.filter((p) => p.x > -70);

      for (const p of pipes.current) {
        if (!p.passed && p.x + 56 < 70) {
          p.passed = true;
          scoreRef.current++;
          setScore(scoreRef.current);
        }
        const inX = 70 + 12 > p.x && 70 - 12 < p.x + 56;
        const hitGap = bird.current.y - 12 < p.gapY || bird.current.y + 12 > p.gapY + gap;
        if (inX && hitGap) {
          alive.current = false;
          setOver(true);
        }
      }
      if (bird.current.y > H - 10 || bird.current.y < 0) {
        alive.current = false;
        setOver(true);
      }
    }

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#111";
    for (let y = 0; y < H; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, H - 10, W, 10);

    const gap = 130;
    pipes.current.forEach((p) => {
      const shade = 190;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(p.x, 0, 56, p.gapY);
      ctx.fillRect(p.x, p.gapY + gap, 56, H - p.gapY - gap);
      ctx.fillStyle = "#000";
      ctx.fillRect(p.x + 4, p.gapY - 8, 48, 8);
      ctx.fillRect(p.x + 4, p.gapY + gap, 48, 8);
    });

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(70, bird.current.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.fillRect(76, bird.current.y - 6, 4, 4);

    if (!started && !over) {
      ctx.fillStyle = "#8f8f8f";
      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("tap / click / space to flap", W / 2, H / 2 + 60);
      ctx.fillText(`score: ${scoreRef.current}`, W / 2, 30);
    }
  }, true);

  return (
    <GameChrome
      title="Flappy"
      scoreLabel="pipes"
      score={score}
      onRestart={reset}
      over={over}
      overScore={`${score} pipes cleared`}
      onOverSubmit={
        score > 0 && !submitted.current
          ? () => { submitted.current = true; submitScore("flappy", score); }
          : undefined
      }
    >
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-[#1a1a1a] max-w-full touch-none"
          aria-label="Flappy game"
          onMouseDown={flap}
          onTouchStart={(e) => { e.preventDefault(); flap(); }}
        />
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Click / tap / space to flap
        </p>
      </div>
    </GameChrome>
  );
}
