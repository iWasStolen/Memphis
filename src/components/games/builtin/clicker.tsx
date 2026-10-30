"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useSubmitScore } from "./shared";

interface Upgrade {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  cps: number; // voids per second
}

const UPGRADES: Upgrade[] = [
  { id: "dust", name: "Void Dust", desc: "A faint shimmer at the edge. +0.2/s", baseCost: 25, cps: 0.2 },
  { id: "rift", name: "Micro Rift", desc: "A hairline crack in nothing. +1/s", baseCost: 250, cps: 1 },
  { id: "hole", name: "Small Black Hole", desc: "It hums politely. +8/s", baseCost: 2400, cps: 8 },
  { id: "well", name: "Gravity Well", desc: "Matter leans toward it. +45/s", baseCost: 22000, cps: 45 },
  { id: "core", name: "Singularity Core", desc: "Now we're cooking with absence. +260/s", baseCost: 200000, cps: 260 },
];

export default function Clicker() {
  const [voids, setVoids] = useState(0);
  const [total, setTotal] = useState(0);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number; v: number }[]>([]);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();
  const pulseId = useRef(0);

  const cps = UPGRADES.reduce((sum, u) => sum + (owned[u.id] ?? 0) * u.cps, 0);
  const cost = (u: Upgrade) => Math.floor(u.baseCost * Math.pow(1.18, owned[u.id] ?? 0));

  useEffect(() => {
    const t = setInterval(() => {
      setVoids((v) => v + cps / 10);
      setTotal((v) => v + cps / 10);
    }, 100);
    return () => clearInterval(t);
  }, [cps]);

  const click = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const gain = 1 + Math.floor((owned.rift ?? 0) * 0.5);
    setVoids((v) => v + gain);
    setTotal((v) => v + gain);
    const id = pulseId.current++;
    setPulses((p) => [
      ...p.slice(-14),
      { id, x: e.clientX - rect.left, y: e.clientY - rect.top, v: gain },
    ]);
    setTimeout(() => setPulses((p) => p.filter((q) => q.id !== id)), 700);
  };

  const buy = (u: Upgrade) => {
    const c = cost(u);
    if (voids < c) return;
    setVoids((v) => v - c);
    setOwned((o) => ({ ...o, [u.id]: (o[u.id] ?? 0) + 1 }));
  };

  const fmt = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` :
    n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` :
    n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` :
    Math.floor(n).toString();

  return (
    <GameChrome
      title="Void Clicker"
      scoreLabel="total voids"
      score={fmt(total)}
      extra={<span className="font-mono text-xs text-[#666]">{fmt(cps)}/s</span>}
      onRestart={() => {
        setVoids(0); setTotal(0); setOwned({}); submitted.current = false;
      }}
      over={false}
      onOverSubmit={
        total > 100 && !submitted.current
          ? () => { submitted.current = true; submitScore("clicker", Math.floor(total)); }
          : undefined
      }
    >
      <div className="w-full max-w-2xl grid lg:grid-cols-2 gap-6">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="font-mono text-3xl text-white">{fmt(voids)}</div>
          <div className="text-[11px] text-[#666] font-mono">voids · {fmt(cps)}/s</div>
          <button
            onClick={click}
            aria-label="Click the void"
            className="relative size-44 rounded-full border-2 border-[#262626] bg-black overflow-hidden transition-transform active:scale-95 hover:border-[#3d3d3d]"
          >
            <span className="absolute inset-6 rounded-full border border-[#1c1c1c]" />
            <span className="absolute inset-12 rounded-full border border-[#242424]" />
            <span className="absolute inset-[74px] rounded-full bg-[#0e0e0e]" />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-[#555] tracking-[0.3em]">
              VOID
            </span>
            {pulses.map((p) => (
              <span
                key={p.id}
                className="absolute pointer-events-none font-mono text-xs text-white"
                style={{
                  left: p.x,
                  top: p.y,
                  animation: "msg-in 0.1s ease-out",
                  transition: "transform 0.7s ease-out, opacity 0.7s",
                  transform: "translateY(-34px)",
                  opacity: 0,
                }}
              >
                +{p.v}
              </span>
            ))}
          </button>
        </div>
        <div className="space-y-2">
          <div className="mono-label">Upgrades</div>
          {UPGRADES.map((u) => {
            const c = cost(u);
            const can = voids >= c;
            return (
              <button
                key={u.id}
                onClick={() => buy(u)}
                disabled={!can}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                  can
                    ? "border-[#2c2c2c] hover:border-[#4a4a4a] hover:bg-[#0c0c0c]"
                    : "border-[#181818] opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-white flex items-center gap-2">
                    {u.name}
                    {owned[u.id] ? (
                      <span className="font-mono text-[10px] text-[#777]">×{owned[u.id]}</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-[#666] truncate">{u.desc}</div>
                </div>
                <div className={`font-mono text-xs shrink-0 ${can ? "text-white" : "text-[#555]"}`}>
                  {fmt(c)}
                </div>
              </button>
            );
          })}
          <button
            onClick={() => {
              submitted.current = false;
              submitScore("clicker", Math.floor(total));
            }}
            className="w-full mt-2 text-[11px] text-[#666] hover:text-white u-link"
          >
            Save current total to the leaderboard
          </button>
        </div>
      </div>
    </GameChrome>
  );
}
