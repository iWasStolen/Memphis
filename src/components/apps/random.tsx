"use client";

import { useState } from "react";
import { Dices } from "lucide-react";

export default function RandomPicker() {
  const [diceCount, setDiceCount] = useState(2);
  const [diceResult, setDiceResult] = useState<number[] | null>(null);
  const [coin, setCoin] = useState<string | null>(null);
  const [coinFlips, setCoinFlips] = useState(0);
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("100");
  const [numberResult, setNumberResult] = useState<number | null>(null);
  const [listText, setListText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const rollDice = () => {
    setDiceResult(Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * 6)));
  };

  const flipCoin = () => {
    setCoin(Math.random() < 0.5 ? "HEADS" : "TAILS");
    setCoinFlips((f) => f + 1);
  };

  const drawNumber = () => {
    const lo = parseInt(min, 10);
    const hi = parseInt(max, 10);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return;
    setNumberResult(Math.floor(Math.random() * (hi - lo + 1)) + lo);
  };

  const drawFromList = () => {
    const items = listText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!items.length) return;
    setPicked(items[Math.floor(Math.random() * items.length)]);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 grid sm:grid-cols-2 gap-4">
      {/* dice */}
      <section className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Dices className="size-4" /> Dice
        </h2>
        <div className="flex items-center gap-2 mb-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setDiceCount(n)}
              className={`size-8 rounded-md border text-xs font-mono transition-colors ${
                diceCount === n
                  ? "bg-white text-black border-white"
                  : "border-[#262626] text-[#9a9a9a] hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 min-h-16" aria-live="polite">
          {diceResult ? (
            <>
              {diceResult.map((d, i) => (
                <span
                  key={i}
                  className="size-12 rounded-lg border border-[#3a3a3a] bg-[#0a0a0a] flex items-center justify-center font-mono text-xl text-white"
                >
                  {d}
                </span>
              ))}
              <span className="ml-2 font-mono text-xs text-[#8f8f8f]">
                = {diceResult.reduce((a, b) => a + b, 0)}
              </span>
            </>
          ) : (
            <span className="text-xs text-[#555]">Roll to begin</span>
          )}
        </div>
        <button
          onClick={rollDice}
          className="mt-3 w-full py-2.5 rounded-md bg-white text-black text-sm font-medium hover:bg-[#e0e0e0]"
        >
          Roll {diceCount} die{diceCount > 1 ? "s" : ""}
        </button>
      </section>

      {/* coin */}
      <section className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Coin flip</h2>
        <div className="flex items-center justify-center min-h-16" aria-live="polite">
          {coin ? (
            <span
              className={`size-16 rounded-full flex items-center justify-center text-[11px] font-mono tracking-wider border-2 ${
                coin === "HEADS"
                  ? "bg-white text-black border-white"
                  : "bg-black text-white border-[#3a3a3a]"
              }`}
            >
              {coin}
            </span>
          ) : (
            <span className="text-xs text-[#555]">Flip to begin</span>
          )}
        </div>
        <button
          onClick={flipCoin}
          className="mt-3 w-full py-2.5 rounded-md border border-[#2a2a2a] text-sm text-white hover:bg-[#0e0e0e]"
        >
          Flip ({coinFlips})
        </button>
      </section>

      {/* number */}
      <section className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Random number</h2>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={min}
            onChange={(e) => setMin(e.target.value)}
            inputMode="numeric"
            aria-label="Minimum"
            className="w-20 bg-black border border-[#262626] rounded-md px-2.5 py-2 font-mono text-sm text-white outline-none focus:border-[#3a3a3a]"
          />
          <span className="text-[#555]">to</span>
          <input
            value={max}
            onChange={(e) => setMax(e.target.value)}
            inputMode="numeric"
            aria-label="Maximum"
            className="w-20 bg-black border border-[#262626] rounded-md px-2.5 py-2 font-mono text-sm text-white outline-none focus:border-[#3a3a3a]"
          />
        </div>
        <div className="min-h-10 flex items-center font-mono text-2xl text-white" aria-live="polite">
          {numberResult ?? <span className="text-sm text-[#555] font-sans">Draw to begin</span>}
        </div>
        <button
          onClick={drawNumber}
          className="mt-3 w-full py-2.5 rounded-md border border-[#2a2a2a] text-sm text-white hover:bg-[#0e0e0e]"
        >
          Draw number
        </button>
      </section>

      {/* list picker */}
      <section className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Pick from list</h2>
        <textarea
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          placeholder={"One entry per line\nAna\nBen\nCleo"}
          aria-label="List entries"
          className="w-full h-20 rounded-md border border-[#262626] bg-black p-2.5 text-sm text-[#d4d4d4] outline-none focus:border-[#3a3a3a] resize-none"
        />
        <div className="min-h-8 mt-3 text-center font-mono text-lg text-white" aria-live="polite">
          {picked ?? ""}
        </div>
        <button
          onClick={drawFromList}
          disabled={!listText.trim()}
          className="mt-2 w-full py-2.5 rounded-md border border-[#2a2a2a] text-sm text-white hover:bg-[#0e0e0e] disabled:opacity-40"
        >
          Pick one
        </button>
      </section>
    </div>
  );
}
