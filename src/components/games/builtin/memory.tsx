"use client";

import { useRef, useState } from "react";
import { GameChrome, useSubmitScore } from "./shared";

const SYMBOLS = ["M", "E", "M", "P", "H", "I", "S", "U"];

interface Card {
  sym: string;
  flipped: boolean;
  matched: boolean;
}

function deal(): Card[] {
  const deck = [...SYMBOLS, ...SYMBOLS]
    .map((c) => ({ sym: c, flipped: false, matched: false, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ sym, flipped, matched }) => ({ sym, flipped, matched }));
  return deck;
}

export default function Memory() {
  const [cards, setCards] = useState<Card[]>(deal);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const matched = cards.filter((c) => c.matched).length / 2;
  const total = SYMBOLS.length;
  const won = matched === total;
  const score = won ? Math.max(50, 400 - (moves - 8) * 15) : 0;

  const restart = () => {
    setCards(deal());
    setMoves(0);
    submitted.current = false;
  };

  const flip = (i: number) => {
    if (busy || cards[i].flipped || cards[i].matched || won) return;
    const next = cards.map((c) => ({ ...c }));
    next[i].flipped = true;
    const open = next
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => c.flipped && !c.matched);
    if (open.length === 2) {
      setMoves((m) => m + 1);
      setBusy(true);
      const [a, b] = open;
      if (a.c.sym === b.c.sym) {
        setTimeout(() => {
          setCards((cur) =>
            cur.map((c, idx) =>
              idx === a.idx || idx === b.idx ? { ...c, matched: true, flipped: true } : c
            )
          );
          setBusy(false);
        }, 450);
      } else {
        setTimeout(() => {
          setCards((cur) =>
            cur.map((c, idx) =>
              idx === a.idx || idx === b.idx ? { ...c, flipped: false } : c
            )
          );
          setBusy(false);
        }, 750);
      }
    }
    setCards(next);
  };

  return (
    <GameChrome
      title="Memory Match"
      scoreLabel="pairs"
      score={`${matched}/${total}`}
      extra={<span className="font-mono text-xs text-[#666]">{moves} moves</span>}
      onRestart={restart}
      over={won}
      overTitle="All pairs found!"
      overScore={`${moves} moves · ${score} points`}
      onOverSubmit={
        won && !submitted.current
          ? () => { submitted.current = true; submitScore("memory", score); }
          : undefined
      }
    >
      <div className="w-full max-w-[400px]">
        <div className="grid grid-cols-4 gap-2.5">
          {cards.map((c, i) => (
            <button
              key={i}
              onClick={() => flip(i)}
              aria-label={c.flipped || c.matched ? `Card ${c.sym}` : "Hidden card"}
              className={`aspect-square rounded-lg border text-xl font-semibold transition-all duration-200 ${
                c.matched
                  ? "bg-white text-black border-white"
                  : c.flipped
                    ? "bg-[#1c1c1c] border-[#3a3a3a] text-white"
                    : "bg-[#0a0a0a] border-[#1f1f1f] text-transparent hover:border-[#333]"
              }`}
            >
              {c.sym}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-[#666]">
          Find all 8 pairs — fewer moves, more points
        </p>
      </div>
    </GameChrome>
  );
}
