/* ============================================================
   Memphis unBLACKed — built-in & open-source games that ship
   with the app. The big external catalog lives in
   data/games.json (see scripts/fetch-games.mjs).
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
  {
    id: "trex",
    name: "T-Rex Runner",
    category: "arcade",
    embedUrl: "https://wayou.github.io/t-rex-runner/",
    desc: "The offline dinosaur runner. Press space to jump.",
  },
  {
    id: "clumsy",
    name: "Clumsy Bird",
    category: "arcade",
    embedUrl: "https://ellisonleao.github.io/clumsy-bird/",
    desc: "Open-source Flappy clone built with melonJS.",
  },
  {
    id: "astray",
    name: "Astray",
    category: "puzzle",
    embedUrl: "https://wwwtyro.github.io/Astray/",
    desc: "Roll the ball through a WebGL maze. Arrows or WASD.",
  },
  {
    id: "2048-classic",
    name: "2048 (Classic)",
    category: "puzzle",
    embedUrl: "https://gabrielecirulli.github.io/2048/",
    desc: "The original 2048 by Gabriele Cirulli.",
  },
  {
    id: "hextris",
    name: "Hextris",
    category: "puzzle",
    embedUrl: "https://hextris.github.io/hextris/",
    desc: "A fast-paced hexagonal puzzle inspired by Tetris.",
  },
  {
    id: "hexgl",
    name: "HexGL",
    category: "action",
    embedUrl: "https://hexgl.bkcore.com/",
    desc: "A WebGL racing game by Thibaut Despoulain.",
  },
];
