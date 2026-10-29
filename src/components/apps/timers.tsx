"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw } from "lucide-react";

function beep(freq = 880, dur = 0.25) {
  try {
    const AC = window.AudioContext;
    const ac = new AC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
    setTimeout(() => ac.close(), (dur + 0.1) * 1000);
  } catch { /* no audio */ }
}

/* ---------------- Stopwatch ---------------- */

function Stopwatch() {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const raf = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    if (!running) return;
    last.current = performance.now();
    const loop = (t: number) => {
      setMs((m) => m + (t - last.current));
      last.current = t;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [running]);

  const fmt = (m: number) => {
    const cs = Math.floor(m / 10) % 100;
    const s = Math.floor(m / 1000) % 60;
    const min = Math.floor(m / 60000);
    return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  return (
    <div>
      <div className="text-center text-5xl font-mono text-white py-8 tabular-nums">
        {fmt(ms)}
      </div>
      <div className="flex justify-center gap-2">
        <Button
          onClick={() => setRunning((r) => !r)}
          className="bg-white text-black hover:bg-[#e0e0e0] w-24"
        >
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white w-24"
          onClick={() => setLaps((l) => [ms, ...l])}
          disabled={!running}
        >
          Lap
        </Button>
        <Button
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white w-24"
          onClick={() => {
            setRunning(false);
            setMs(0);
            setLaps([]);
          }}
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
      {laps.length > 0 && (
        <ol className="mt-4 max-h-40 overflow-y-auto text-[13px] font-mono text-[#9a9a9a]">
          {laps.map((l, i) => (
            <li key={i} className="flex justify-between px-3 py-1.5 border-b border-[#141414]">
              <span className="text-[#555]">Lap {laps.length - i}</span>
              <span>{fmt(l)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------- Countdown ---------------- */

function Countdown() {
  const [total, setTotal] = useState(5 * 60);
  const [left, setLeft] = useState(5 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false);
          setDone(true);
          beep(880);
          setTimeout(() => beep(660), 350);
          setTimeout(() => beep(990), 700);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const pct = total > 0 ? ((total - left) / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-center gap-2 mb-6 flex-wrap">
        {[
          ["1 min", 60],
          ["5 min", 300],
          ["10 min", 600],
          ["25 min", 1500],
          ["45 min", 2700],
        ].map(([label, secs]) => (
          <button
            key={label as string}
            onClick={() => {
              setTotal(secs as number);
              setLeft(secs as number);
              setRunning(false);
              setDone(false);
            }}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              total === secs
                ? "border-white text-white"
                : "border-[#262626] text-[#9a9a9a] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="text-center text-5xl font-mono text-white py-6 tabular-nums">
        {fmt(left)}
      </div>
      <div className="mx-auto max-w-xs h-1 bg-[#141414] rounded-full overflow-hidden mb-6">
        <div className="h-full bg-white transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-center gap-2">
        <Button
          onClick={() => {
            if (left === 0) setLeft(total);
            setDone(false);
            setRunning((r) => !r);
          }}
          className="bg-white text-black hover:bg-[#e0e0e0] w-24"
        >
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white w-24"
          onClick={() => {
            setRunning(false);
            setLeft(total);
            setDone(false);
          }}
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
      {done && (
        <p className="text-center text-sm text-white mt-4" role="status">
          Time is up.
        </p>
      )}
    </div>
  );
}

/* ---------------- Pomodoro ---------------- */

const PHASES = {
  focus: { label: "Focus", mins: 25 },
  short: { label: "Short break", mins: 5 },
  long: { label: "Long break", mins: 15 },
} as const;
type Phase = keyof typeof PHASES;

function Pomodoro() {
  const [phase, setPhase] = useState<Phase>("focus");
  const [left, setLeft] = useState(PHASES.focus.mins * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l > 1) return l - 1;
        beep(phase === "focus" ? 990 : 660);
        setTimeout(() => beep(phase === "focus" ? 740 : 880), 400);
        if (phase === "focus") {
          const n = completed + 1;
          setCompleted(n);
          const next: Phase = n % 4 === 0 ? "long" : "short";
          setPhase(next);
          return PHASES[next].mins * 60;
        }
        setPhase("focus");
        return PHASES.focus.mins * 60;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, phase, completed]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex justify-center gap-1.5 mb-6">
        {(Object.keys(PHASES) as Phase[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPhase(p);
              setLeft(PHASES[p].mins * 60);
              setRunning(false);
            }}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              phase === p
                ? "bg-white text-black border-white"
                : "border-[#262626] text-[#9a9a9a] hover:text-white"
            }`}
          >
            {PHASES[p].label}
          </button>
        ))}
      </div>
      <div className="text-center text-5xl font-mono text-white py-6 tabular-nums">
        {fmt(left)}
      </div>
      <p className="text-center text-xs text-[#666] mb-6">
        {completed} focus session{completed === 1 ? "" : "s"} completed · long
        break every 4
      </p>
      <div className="flex justify-center gap-2">
        <Button
          onClick={() => setRunning((r) => !r)}
          className="bg-white text-black hover:bg-[#e0e0e0] w-24"
        >
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white w-24"
          onClick={() => {
            setRunning(false);
            setLeft(PHASES[phase].mins * 60);
          }}
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */

export default function Timers() {
  const [tab, setTab] = useState<"stopwatch" | "countdown" | "pomodoro">("stopwatch");
  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex gap-1.5 mb-2">
        {(
          [
            ["stopwatch", "Stopwatch"],
            ["countdown", "Timer"],
            ["pomodoro", "Pomodoro"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              tab === id
                ? "bg-white text-black border-white"
                : "border-[#262626] text-[#9a9a9a] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-6 mt-3">
        {tab === "stopwatch" && <Stopwatch />}
        {tab === "countdown" && <Countdown />}
        {tab === "pomodoro" && <Pomodoro />}
      </div>
    </div>
  );
}
