"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useRaf, useSubmitScore, fitCanvas } from "./shared";

const W = 560;
const H = 340;
const PH = 70;
const TARGET = 7;

export default function Pong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const py = useRef(H / 2 - PH / 2);
  const ay = useRef(H / 2 - PH / 2);
  const ball = useRef({ x: W / 2, y: H / 2, vx: 4, vy: 2.2 });
  const keys = useRef<Record<string, boolean>>({});
  const rally = useRef(0);
  const winsRef = useRef(0);
  const serveDelay = useRef(60);

  const resetBall = (toPlayer: boolean) => {
    ball.current = {
      x: W / 2,
      y: H / 2,
      vx: (toPlayer ? -1 : 1) * (3.4 + Math.random()),
      vy: (Math.random() - 0.5) * 4,
    };
    rally.current = 0;
    serveDelay.current = 45;
  };

  const restart = () => {
    winsRef.current = 0;
    setPlayerScore(0); setAiScore(0); setOver(false); setWon(false);
    submitted.current = false;
    py.current = H / 2 - PH / 2;
    ay.current = H / 2 - PH / 2;
    resetBall(true);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (["ArrowUp", "ArrowDown", "w", "s"].includes(e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const movePaddle = (clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = ((clientY - rect.top) / rect.height) * H;
    py.current = Math.max(0, Math.min(H - PH, y - PH / 2));
  };

  useRaf((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!canvas.width) fitCanvas(canvas, W, H);
    const f = dt / 16.67;

    if (!over && !won) {
      if (keys.current["arrowup"] || keys.current["w"]) py.current -= 6.5 * f;
      if (keys.current["arrowdown"] || keys.current["s"]) py.current += 6.5 * f;
      py.current = Math.max(0, Math.min(H - PH, py.current));

      /* AI: tracks ball with capped speed, slight error */
      const target = ball.current.vx > 0 ? ball.current.y - PH / 2 + Math.sin(Date.now() / 400) * 18 : H / 2 - PH / 2;
      const aiSpeed = Math.min(5.2 + winsRef.current * 0.6, 7.8);
      if (ay.current < target - 4) ay.current += aiSpeed * f;
      else if (ay.current > target + 4) ay.current -= aiSpeed * f;
      ay.current = Math.max(0, Math.min(H - PH, ay.current));

      const b = ball.current;
      if (serveDelay.current > 0) {
        serveDelay.current -= f;
      } else {
        b.x += b.vx * f;
        b.y += b.vy * f;
        if (b.y < 6 || b.y > H - 6) b.vy *= -1;

        if (b.vx < 0 && b.x < 26 && b.x > 14 && b.y > py.current - 6 && b.y < py.current + PH + 6) {
          b.vx = Math.min(11, Math.abs(b.vx) * 1.06);
          b.vy += ((b.y - (py.current + PH / 2)) / (PH / 2)) * 2.4;
          rally.current++;
        }
        if (b.vx > 0 && b.x > W - 26 && b.x < W - 14 && b.y > ay.current - 6 && b.y < ay.current + PH + 6) {
          b.vx = -Math.min(11, Math.abs(b.vx) * 1.06);
          b.vy += ((b.y - (ay.current + PH / 2)) / (PH / 2)) * 2.4;
          rally.current++;
        }
        if (b.x < -10) {
          setAiScore((s) => {
            const ns = s + 1;
            if (ns >= TARGET) setOver(true);
            return ns;
          });
          resetBall(false);
        }
        if (b.x > W + 10) {
          setPlayerScore((s) => {
            const ns = s + 1;
            winsRef.current++;
            if (ns >= TARGET) setWon(true);
            return ns;
          });
          resetBall(true);
        }
      }
    }

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(16, py.current, 8, PH);
    ctx.fillRect(W - 24, ay.current, 8, PH);
    ctx.font = "40px monospace";
    ctx.fillStyle = "#222";
    ctx.textAlign = "center";
    ctx.fillText(String(playerScore), W / 2 - 50, 50);
    ctx.fillText(String(aiScore), W / 2 + 50, 50);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.current.x, ball.current.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }, true);

  const wins = Math.max(playerScore, 0);
  return (
    <GameChrome
      title="Pong"
      scoreLabel="you vs ai"
      score={`${playerScore} – ${aiScore}`}
      extra={<span className="font-mono text-xs text-[#666] hidden sm:inline">first to {TARGET}</span>}
      onRestart={restart}
      over={over || won}
      overTitle={won ? "You win the match!" : "AI wins the match"}
      overScore={`${playerScore} – ${aiScore}`}
      onOverSubmit={
        won && !submitted.current
          ? () => { submitted.current = true; submitScore("pong", wins * 100 + playerScore); }
          : undefined
      }
    >
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-[#1a1a1a] max-w-full touch-none"
          aria-label="Pong court"
          onMouseMove={(e) => movePaddle(e.clientY)}
          onTouchMove={(e) => movePaddle(e.touches[0].clientY)}
        />
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Mouse / touch / W/S or arrows · first to {TARGET}
        </p>
      </div>
    </GameChrome>
  );
}
