"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useRaf, useSubmitScore, fitCanvas } from "./shared";

const W = 520;
const H = 400;

interface Rock {
  x: number; y: number; vx: number; vy: number; r: number; level: number;
}
interface Bullet {
  x: number; y: number; vx: number; vy: number; life: number;
}
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number;
}

export default function Asteroids() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const ship = useRef({ x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, inv: 120 });
  const rocks = useRef<Rock[]>([]);
  const bullets = useRef<Bullet[]>([]);
  const particles = useRef<Particle[]>([]);
  const keys = useRef<Record<string, boolean>>({});
  const scoreRef = useRef(0);
  const alive = useRef(true);
  const fireCd = useRef(0);
  const touch = useRef({ left: false, right: false, thrust: false, fire: false });

  const spawnRocks = () => {
    rocks.current = [];
    for (let i = 0; i < 4; i++) {
      const edge = Math.floor(Math.random() * 4);
      const x = edge === 0 ? Math.random() * W : edge === 1 ? W - 10 : edge === 2 ? Math.random() * W : 10;
      const y = edge === 0 ? 10 : edge === 1 ? Math.random() * H : edge === 2 ? H - 10 : Math.random() * H;
      rocks.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 1.6,
        r: 26, level: 3,
      });
    }
  };

  const restart = () => {
    ship.current = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, inv: 120 };
    bullets.current = [];
    particles.current = [];
    scoreRef.current = 0;
    setScore(0);
    setOver(false);
    alive.current = true;
    submitted.current = false;
    spawnRocks();
  };

  useEffect(() => {
    restart();
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

  const boom = (x: number, y: number, n = 10) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 2.5 + 0.5;
      particles.current.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 20 });
    }
  };

  useRaf((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!canvas.width) fitCanvas(canvas, W, H);
    const f = dt / 16.67;
    const s = ship.current;

    if (alive.current) {
      const left = keys.current["ArrowLeft"] || keys.current["a"] || touch.current.left;
      const right = keys.current["ArrowRight"] || keys.current["d"] || touch.current.right;
      const thrust = keys.current["ArrowUp"] || keys.current["w"] || touch.current.thrust;
      const fire = keys.current[" "] || keys.current["ArrowDown"] || touch.current.fire;
      if (left) s.a -= 0.09 * f;
      if (right) s.a += 0.09 * f;
      if (thrust) {
        s.vx += Math.cos(s.a) * 0.09 * f;
        s.vy += Math.sin(s.a) * 0.09 * f;
      }
      s.vx *= Math.pow(0.992, f);
      s.vy *= Math.pow(0.992, f);
      s.x = (s.x + s.vx * f + W) % W;
      s.y = (s.y + s.vy * f + H) % H;
      if (s.inv > 0) s.inv -= f;
      fireCd.current -= f;
      if (fire && fireCd.current <= 0) {
        fireCd.current = 9;
        bullets.current.push({
          x: s.x + Math.cos(s.a) * 12,
          y: s.y + Math.sin(s.a) * 12,
          vx: Math.cos(s.a) * 6 + s.vx,
          vy: Math.sin(s.a) * 6 + s.vy,
          life: 60,
        });
      }

      bullets.current.forEach((b) => {
        b.x = (b.x + b.vx * f + W) % W;
        b.y = (b.y + b.vy * f + H) % H;
        b.life -= f;
      });
      bullets.current = bullets.current.filter((b) => b.life > 0);

      rocks.current.forEach((r) => {
        r.x = (r.x + r.vx * f + W) % W;
        r.y = (r.y + r.vy * f + H) % H;
      });

      /* bullets vs rocks */
      for (const b of bullets.current) {
        for (const r of rocks.current) {
          if (Math.hypot(b.x - r.x, b.y - r.y) < r.r) {
            b.life = 0;
            r.level = -1;
            scoreRef.current += r.level === 3 ? 20 : r.level === 2 ? 50 : 100;
            boom(r.x, r.y, r.level * 4);
            setScore(scoreRef.current);
            if (r.r > 12) {
              for (let i = 0; i < 2; i++) {
                rocks.current.push({
                  x: r.x, y: r.y,
                  vx: (Math.random() - 0.5) * 3,
                  vy: (Math.random() - 0.5) * 3,
                  r: r.r / 2, level: r.level - 1,
                });
              }
            }
            break;
          }
        }
      }
      rocks.current = rocks.current.filter((r) => r.level >= 0);
      if (!rocks.current.length) spawnRocks();

      /* ship vs rocks */
      if (s.inv <= 0) {
        for (const r of rocks.current) {
          if (Math.hypot(s.x - r.x, s.y - r.y) < r.r + 8) {
            alive.current = false;
            setOver(true);
            boom(s.x, s.y, 24);
            break;
          }
        }
      }
    }

    particles.current.forEach((p) => {
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.life -= f;
    });
    particles.current = particles.current.filter((p) => p.life > 0);

    /* draw */
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    rocks.current.forEach((r) => {
      ctx.beginPath();
      for (let i = 0; i <= 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rr = r.r * (0.82 + 0.18 * Math.sin(i * 3 + r.x));
        const px = r.x + Math.cos(a) * rr;
        const py = r.y + Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.fillStyle = "#ffffff";
    bullets.current.forEach((b) => ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3));
    particles.current.forEach((p) => {
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    });
    ctx.globalAlpha = 1;
    if (alive.current && (s.inv <= 0 || Math.floor(s.inv / 8) % 2 === 0)) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, -8);
      ctx.closePath();
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      if (keys.current["ArrowUp"] || keys.current["w"] || touch.current.thrust) {
        ctx.beginPath();
        ctx.moveTo(-8, 4);
        ctx.lineTo(-15 - Math.random() * 6, 0);
        ctx.lineTo(-8, -4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, true);

  const TouchBtn = ({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) => (
    <button
      className="size-14 rounded-full border border-[#2a2a2a] bg-[#0a0a0a] text-white text-lg select-none active:bg-[#1c1c1c] touch-none"
      onPointerDown={(e) => { e.preventDefault(); onDown(); }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  );

  return (
    <GameChrome
      title="Asteroids"
      scoreLabel="score"
      score={score.toLocaleString()}
      onRestart={restart}
      over={over}
      overScore={`Score: ${score.toLocaleString()}`}
      onOverSubmit={
        score > 0 && !submitted.current
          ? () => { submitted.current = true; submitScore("asteroids", score); }
          : undefined
      }
    >
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-[#1a1a1a] max-w-full touch-none"
          aria-label="Asteroids field"
        />
        <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
          <TouchBtn label="⟲" onDown={() => (touch.current.left = true)} onUp={() => (touch.current.left = false)} />
          <TouchBtn label="⟳" onDown={() => (touch.current.right = true)} onUp={() => (touch.current.right = false)} />
          <TouchBtn label="▲" onDown={() => (touch.current.thrust = true)} onUp={() => (touch.current.thrust = false)} />
          <TouchBtn label="●" onDown={() => (touch.current.fire = true)} onUp={() => (touch.current.fire = false)} />
        </div>
        <p className="mt-2 hidden sm:block text-center text-[11px] text-[#666]">
          Arrows / WASD to turn and thrust · space to shoot
        </p>
      </div>
    </GameChrome>
  );
}
