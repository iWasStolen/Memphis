import { GameDef } from "./types";

/* ============================================================
   Memphis unBLACKed game catalog
   - builtin: games that ship with the app (canvas/DOM)
   - embed:   open-source games loaded from their official pages
   ============================================================ */

export const GAMES: GameDef[] = [
  // ---------- builtin ----------
  {
    id: "2048",
    name: "2048",
    category: "puzzle",
    builtin: true,
    hasScore: true,
    scoreLabel: "points",
    desc: "Slide and merge tiles to reach 2048. Arrows or swipe.",
  },
  {
    id: "snake",
    name: "Snake",
    category: "classic",
    builtin: true,
    hasScore: true,
    scoreLabel: "apples",
    desc: "Eat, grow, don't bite yourself. Arrows or swipe.",
  },
  {
    id: "tetris",
    name: "Tetris",
    category: "classic",
    builtin: true,
    hasScore: true,
    scoreLabel: "points",
    desc: "Stack falling blocks and clear lines. Arrows to move, up to rotate.",
  },
  {
    id: "minesweeper",
    name: "Minesweeper",
    category: "puzzle",
    builtin: true,
    hasScore: true,
    scoreLabel: "seconds (lower is better)",
    desc: "Reveal every safe tile. Right-click or long-press to flag mines.",
  },
  {
    id: "breakout",
    name: "Breakout",
    category: "arcade",
    builtin: true,
    hasScore: true,
    scoreLabel: "points",
    desc: "Bounce the ball, clear the wall. Mouse, touch or arrows.",
  },
  {
    id: "flappy",
    name: "Flappy",
    category: "arcade",
    builtin: true,
    hasScore: true,
    scoreLabel: "pipes",
    desc: "Tap or press space to flap through the gaps.",
  },
  {
    id: "pong",
    name: "Pong",
    category: "classic",
    builtin: true,
    hasScore: true,
    scoreLabel: "rally wins",
    desc: "First paddle to 7 points takes the match. Mouse, touch or W/S.",
  },
  {
    id: "memory",
    name: "Memory Match",
    category: "puzzle",
    builtin: true,
    hasScore: true,
    scoreLabel: "points",
    desc: "Find all eight pairs. Fewer moves, more points.",
  },
  {
    id: "tictactoe",
    name: "Tic-Tac-Toe",
    category: "classic",
    builtin: true,
    hasScore: true,
    scoreLabel: "points",
    desc: "Beat the unbeatable-ish AI three times in a row.",
  },
  {
    id: "simon",
    name: "Simon",
    category: "puzzle",
    builtin: true,
    hasScore: true,
    scoreLabel: "rounds",
    desc: "Repeat the growing light pattern.",
  },
  {
    id: "asteroids",
    name: "Asteroids",
    category: "action",
    builtin: true,
    hasScore: true,
    scoreLabel: "points",
    desc: "Rotate, thrust and blast rocks. Arrows + space, touch controls on mobile.",
  },
  {
    id: "clicker",
    name: "Void Clicker",
    category: "casual",
    builtin: true,
    hasScore: true,
    scoreLabel: "total voids",
    desc: "Click the void. Buy matter. Ascend.",
  },
  // ---------- embedded open-source ----------
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

export const GAME_CATEGORIES: { id: "all" | GameDef["category"] | "favorites" | "recent"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "arcade", label: "Arcade" },
  { id: "puzzle", label: "Puzzle" },
  { id: "classic", label: "Classic" },
  { id: "action", label: "Action" },
  { id: "casual", label: "Casual" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
];

export function getGame(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id);
}
