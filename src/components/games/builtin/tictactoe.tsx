"use client";

import { useRef, useState } from "react";
import { GameChrome, useSubmitScore } from "./shared";

type Cell = "X" | "O" | null;

function winner(b: Cell[]): { win: Cell; line: number[] } | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const l of lines) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { win: b[a], line: l };
  }
  return null;
}

function minimax(b: Cell[], me: "O", turn: Cell, depth = 0): { score: number; move: number } {
  const w = winner(b);
  if (w) return { score: w.win === me ? 10 - depth : depth - 10, move: -1 };
  if (b.every(Boolean)) return { score: 0, move: -1 };
  let best = { score: turn === me ? -99 : 99, move: -1 };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const r = minimax(b, me, turn === "X" ? "O" : "X", depth + 1);
    b[i] = null;
    if (turn === me ? r.score > best.score : r.score < best.score)
      best = { score: r.score, move: i };
  }
  return best;
}

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [stats, setStats] = useState({ w: 0, l: 0, d: 0 });
  const [done, setDone] = useState(false);
  const submitted = useRef(false);
  const submitScore = useSubmitScore();

  const w = winner(board);
  const full = board.every(Boolean);
  const finished = !!w || full;
  const aiLevel = useRef(0.85); // 85% perfect moves

  const restart = () => {
    setBoard(Array(9).fill(null));
    setTurn("X");
    setDone(false);
    submitted.current = false;
  };

  const aiMove = (b: Cell[]) => {
    const open = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!open.length) return b;
    const idx =
      Math.random() < aiLevel.current
        ? minimax([...b], "O", "O").move
        : open[Math.floor(Math.random() * open.length)];
    const next = [...b];
    next[idx] = "O";
    return next;
  };

  const play = (i: number) => {
    if (board[i] || finished) return;
    let next = [...board];
    next[i] = "X";
    if (winner(next) || next.every(Boolean)) {
      setBoard(next);
      finish(next);
      return;
    }
    next = aiMove(next);
    setBoard(next);
    if (winner(next) || next.every(Boolean)) {
      finish(next);
      return;
    }
    setTurn("X");
  };

  const finish = (b: Cell[]) => {
    setDone(true);
    const res = winner(b);
    setStats((s) => ({
      w: s.w + (res?.win === "X" ? 1 : 0),
      l: s.l + (res?.win === "O" ? 1 : 0),
      d: s.d + (!res ? 1 : 0),
    }));
  };

  const score = stats.w * 100 + stats.d * 25 - stats.l * 10;

  return (
    <GameChrome
      title="Tic-Tac-Toe"
      scoreLabel="record"
      score={`${stats.w}W ${stats.l}L ${stats.d}D`}
      extra={<span className="font-mono text-xs text-[#666] hidden sm:inline">AI plays O</span>}
      onRestart={restart}
      over={done}
      overTitle={
        w ? (w.win === "X" ? "You win!" : "AI wins!") : "Draw"
      }
      overScore={`Session: ${stats.w}W ${stats.l}L ${stats.d}D · ${Math.max(0, score)} pts`}
      onOverSubmit={
        !submitted.current && score > 0
          ? () => { submitted.current = true; submitScore("tictactoe", Math.max(0, score)); }
          : undefined
      }
    >
      <div className="w-full max-w-[320px]">
        <div className="grid grid-cols-3 gap-2">
          {board.map((c, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              disabled={!!c || done}
              aria-label={`Cell ${Math.floor(i / 3) + 1},${(i % 3) + 1}${c ? ` ${c}` : ""}`}
              className={`aspect-square rounded-lg border text-3xl font-semibold transition-colors ${
                w?.line.includes(i)
                  ? "bg-white text-black border-white"
                  : "bg-[#0a0a0a] border-[#1f1f1f] hover:border-[#333]"
              } ${c === "X" ? "text-white" : "text-[#8f8f8f]"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-[#666]">
          You are X · win rounds, keep the streak going
        </p>
      </div>
    </GameChrome>
  );
}
