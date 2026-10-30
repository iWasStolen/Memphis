/* ============================================================
   Memphis unBLACKed — canvas games that ship with the app and
   render natively inside the player (no external site needed).
   External games live in data/games.json, built and verified
   by scripts/build-games-catalog.mjs.
   ============================================================ */

export interface BuiltinGameDef {
  id: string;
  name: string;
  category: "arcade" | "puzzle" | "classic" | "action" | "casual";
  builtin?: boolean;
  embedUrl?: string;
  desc: string;
}

export const BUILTIN_GAMES: BuiltinGameDef[] = [
  {
    id: "2048",
    name: "2048",
    category: "puzzle",
    builtin: true,
    desc: "Slide and merge tiles to reach 2048. Arrows or swipe.",
  },
  {
    id: "snake",
    name: "Snake",
    category: "classic",
    builtin: true,
    desc: "Eat, grow, don't bite yourself. Arrows or swipe.",
  },
  {
    id: "tetris",
    name: "Tetris",
    category: "classic",
    builtin: true,
    desc: "Stack falling blocks and clear lines. Arrows to move, up to rotate.",
  },
  {
    id: "minesweeper",
    name: "Minesweeper",
    category: "puzzle",
    builtin: true,
    desc: "Reveal every safe tile. Right-click or long-press to flag mines.",
  },
  {
    id: "breakout",
    name: "Breakout",
    category: "arcade",
    builtin: true,
    desc: "Bounce the ball, clear the wall. Mouse, touch or arrows.",
  },
  {
    id: "flappy",
    name: "Flappy",
    category: "arcade",
    builtin: true,
    desc: "Tap or press space to flap through the gaps.",
  },
  {
    id: "pong",
    name: "Pong",
    category: "classic",
    builtin: true,
    desc: "First paddle to 7 points takes the match. Mouse, touch or W/S.",
  },
  {
    id: "memory",
    name: "Memory Match",
    category: "puzzle",
    builtin: true,
    desc: "Find all eight pairs. Fewer moves, more points.",
  },
  {
    id: "tictactoe",
    name: "Tic-Tac-Toe",
    category: "classic",
    builtin: true,
    desc: "Beat the unbeatable-ish AI three times in a row.",
  },
  {
    id: "simon",
    name: "Simon",
    category: "puzzle",
    builtin: true,
    desc: "Repeat the growing light pattern.",
  },
  {
    id: "asteroids",
    name: "Asteroids",
    category: "action",
    builtin: true,
    desc: "Rotate, thrust and blast rocks. Arrows + space, touch controls on mobile.",
  },
  {
    id: "clicker",
    name: "Void Clicker",
    category: "casual",
    builtin: true,
    desc: "Click the void. Buy matter. Ascend.",
  },
];
