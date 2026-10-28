"use client";

import { useEffect, useRef, useState } from "react";
import { GameChrome, useSubmitScore } from "./shared";

/* Web Audio tones for the four pads */
function tone(freq: number, dur = 0.28) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!(window as unknown as { __simonAC?: AudioContext }).__simonAC)
      (window as unknown as { __simonAC?: AudioContext }).__simonAC = new AC();
    const ac = (window as unknown as { __simonAC: AudioContext }).__simonAC;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  } catch { /* audio unavailable */ }
}

const FREQS = [329.6, 261.6, 220, 164.8];
const BASE_SHADE = ["#181818", "#101010", "#0c0c0c", "#080808"];
const LIT = ["#ffffff", "#d4d4d4", "#a8a8a8", "#7c7c7c"];

export default function Simon() {
  const [seq, setSeq] = useState<number[]>([]);
  const [userIdx, setUserIdx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "showing" | "input" | "over">("idle");
  const [litPad, setLitPad] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const restart = () => {
    clearTimers();
    submitted.current = false;
    const first = [Math.floor(Math.random() * 4)];
    setSeq(first);
    setUserIdx(0);
    setPhase("showing");
    show(first);
  };

  const show = (s: number[]) => {
    clearTimers();
    setPhase("showing");
    s.forEach((pad, i) => {
      timers.current.push(
        setTimeout(() => {
          setLitPad(pad);
          tone(FREQS[pad]);
          timers.current.push(setTimeout(() => setLitPad(null), 380));
        }, 650 + i * 620)
      );
    });
    timers.current.push(
      setTimeout(() => {
        setPhase("input");
        setUserIdx(0);
      }, 650 + s.length * 620)
    );
  };

  const press = (pad: number) => {
    if (phase !== "input") return;
    setLitPad(pad);
    tone(FREQS[pad]);
    setTimeout(() => setLitPad(null), 180);
    if (seq[userIdx] === pad) {
      if (userIdx === seq.length - 1) {
        /* round complete */
        const next = [...seq, Math.floor(Math.random() * 4)];
        setSeq(next);
        setTimeout(() => show(next), 700);
      } else {
        setUserIdx((i) => i + 1);
      }
    } else {
      setPhase("over");
    }
  };

  const round = seq.length;

  return (
    <GameChrome
      title="Simon"
      scoreLabel="round"
      score={phase === "idle" ? 0 : round}
      extra={
        <span className="font-mono text-xs text-[#666]">
          {phase === "showing" ? "watch…" : phase === "input" ? "repeat" : phase === "over" ? "wrong pad" : ""}
        </span>
      }
      onRestart={restart}
      over={phase === "over"}
      overTitle="Wrong pad"
      overScore={`You reached round ${round}`}
      onOverSubmit={
        phase === "over" && round - 1 > 0 && !submitted.current
          ? () => { submitted.current = true; submitScore("simon", round - 1); }
          : undefined
      }
    >
      <div className="w-full max-w-[340px]">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              onClick={() => press(i)}
              disabled={phase !== "input"}
              aria-label={`Pad ${i + 1}`}
              className={`aspect-square rounded-xl border transition-all duration-100 ${
                litPad === i ? "scale-[1.02]" : ""
              }`}
              style={{
                background: litPad === i ? LIT[i] : BASE_SHADE[i],
                borderColor: litPad === i ? "#fff" : "#1f1f1f",
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-[#666]">
          {phase === "idle"
            ? "Press restart to begin — watch the pattern, then repeat it"
            : "Watch the pattern, then click the pads in order"}
        </p>
      </div>
    </GameChrome>
  );
}
