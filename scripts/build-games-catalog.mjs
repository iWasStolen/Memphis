/**
 * Memphis unBLACKed — POPULAR games catalog builder
 *
 * Replaces the old GameMonetize hypercasual feed (2,817 mobile-slop titles)
 * with a hand-curated catalog of genuinely popular web games. Every entry is
 * verified live at build time:
 *   - HTTP 200 (following redirects)
 *   - no X-Frame-Options blocking iframe embedding
 *   - no CSP frame-ancestors restricting embedding
 *   - page <title> captured for sanity (a spam/parked title fails the build)
 *
 * Sources:
 *   - official game sites (classic.minecraft.net, krunker.io, slither.io …)
 *   - KBHgames (classic Flash-era favorites, embeddable)
 *   - Scratch official /embed endpoints (Paper Minecraft, MMP)
 *   - GitHub Pages / jsDelivr open-source classics (Hextris, Astray …)
 *   - dedicated mirror sites for headline titles (retrobowl.me, slopegame.io …)
 *
 * Output: data/games.json  (format: id, t, d, u, px, c, g, th, w, h, b)
 * Run: node scripts/build-games-catalog.mjs
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/* ---------------- candidates ---------------- */

const CANDIDATES = [
  /* --- Minecraft / sandbox --- */
  { id: "minecraft-classic", t: "Minecraft Classic", u: "https://classic.minecraft.net/", c: "sandbox", g: ["minecraft", "3d", "build"], d: "The official browser version of Minecraft Classic — place blocks and build in the original 2019 Mojang release." },
  { id: "paper-minecraft", t: "Paper Minecraft", u: "https://scratch.mit.edu/projects/10128407/embed", c: "sandbox", g: ["minecraft", "2d", "griffpatch"], d: "griffpatch's legendary 2D Minecraft — the most-played Scratch game ever made. Mine, craft and survive." },

  /* --- FPS / shooter --- */
  { id: "krunker", t: "Krunker.io", u: "https://krunker.io/", c: "shooter", g: ["fps", "multiplayer", "pixel"], d: "The most popular browser FPS — pixelated fast-paced matches against real players. No download needed." },
  { id: "shell-shockers", t: "Shell Shockers", u: "https://shellshock.io/", c: "shooter", g: ["fps", "eggs", "multiplayer"], d: "Egg-based multiplayer FPS. Crack the enemy before they crack you." },
  { id: "voxiom", t: "Voxiom.io", u: "https://voxiom.io/", c: "shooter", g: ["fps", "battle-royale", "voxel"], d: "Voxel battle royale with a Minecraft look — last player standing wins." },
  { id: "repuls", t: "Repuls.io", u: "https://repuls.io/", c: "shooter", g: ["fps", "sci-fi", "multiplayer"], d: "Sci-fi arena FPS with jetpacks and laser rifles, straight in the browser." },
  { id: "kour", t: "Kour.io", u: "https://kour.io/", c: "shooter", g: ["fps", "multiplayer"], d: "Fast free-for-all FPS with clean movement and instant matches." },
  { id: "1v1-lol", t: "1v1.LOL", u: "https://www.gameflare.com/embed/1v1-lol/", c: "shooter", g: ["1v1", "build", "fortnite-like"], d: "Fortnite-style build-and-blast duels — place walls, ramps and take the high ground. The full 1v1.lol experience." },

  /* --- io / multiplayer arena --- */
  { id: "slither-io", t: "Slither.io", u: "https://slither.io/", c: "io", g: ["snake", "multiplayer"], d: "The game that started the io craze — grow the longest snake in the arena." },
  { id: "diep-io", t: "Diep.io", u: "https://diep.io/", c: "io", g: ["tanks", "multiplayer"], d: "Shoot shapes, level up your tank and destroy everyone in the arena." },
  { id: "arras-io", t: "Arras.io", u: "https://arras.io/", c: "io", g: ["tanks", "diep"], d: "Diep.io's ambitious sequel — hundreds of tank classes and upgrades." },
  { id: "bonk-io", t: "Bonk.io", u: "https://bonk.io/", c: "io", g: ["physics", "multiplayer"], d: "Physics-based battle — push your friends off the map in custom arenas." },
  { id: "zombs-royale", t: "Zombs Royale", u: "https://zombsroyale.io/", c: "io", g: ["battle-royale", "2d"], d: "100-player 2D battle royale — drop in, loot up, be the last one standing." },
  { id: "smash-karts", t: "Smash Karts", u: "https://smashkarts.io/", c: "io", g: ["karts", "3d", "multiplayer"], d: "3D kart battles with rockets and machine guns. Chaotic fun with friends." },
  { id: "taming-io", t: "Taming.io", u: "https://taming.io/", c: "io", g: ["pets", "survival"], d: "Tame wild creatures and level them up in this Pokemon-flavored arena." },
  { id: "starblast", t: "Starblast.io", u: "https://starblast.io/", c: "io", g: ["space", "ships"], d: "Mine asteroids, upgrade your ship and duel other pilots in deep space." },
  { id: "territorial-io", t: "Territorial.io", u: "https://territorial.io/", c: "io", g: ["strategy", "conquest"], d: "Real-time territory conquest against hundreds of players on a world map." },
  { id: "skribbl-io", t: "Skribbl.io", u: "https://skribbl.io/", c: "io", g: ["drawing", "party"], d: "Draw and guess with friends — the classic free multiplayer pictionary." },
  { id: "paper-io-2", t: "Paper.io 2", u: "https://paper-io.com/", c: "io", g: ["territory", "multiplayer"], d: "Claim territory by drawing loops — cut enemies off before they cut you." },
  { id: "deeeep-io", t: "Deeeep.io", u: "https://deeeep.io/", c: "io", g: ["ocean", "fish"], d: "Eat your way up the ocean food chain, from tiny fish to apex predator." },
  { id: "mope-io", t: "Mope.io", u: "https://mope.io/", c: "io", g: ["animals", "survival"], d: "Survive as an animal — eat berries, level up, evolve into stronger beasts." },
  { id: "wormate-io", t: "Wormate.io", u: "https://wormate.io/", c: "io", g: ["snake", "candy"], d: "Sweet-themed slither — eat candy, grow huge, trap other worms." },
  { id: "splix-io", t: "Splix.io", u: "https://splix.io/", c: "io", g: ["territory"], d: "Capture grid cells one loop at a time while defending your borders." },
  { id: "powerline-io", t: "Powerline.io", u: "https://powerline.io/", c: "io", g: ["snake", "neon"], d: "Neon snake with a boost mechanic — near-misses charge your speed." },
  { id: "brutal-io", t: "Brutal.io", u: "https://brutal.io/", c: "io", g: ["flail", "physics"], d: "Swing a heavy flail and smash other players off the arena." },
  { id: "wings-io", t: "Wings.io", u: "https://wings.io/", c: "io", g: ["planes", "dogfight"], d: "2D dogfights — grab power-ups and rule the skies." },
  { id: "little-big-snake", t: "Little Big Snake", u: "https://littlebigsnake.com/", c: "io", g: ["snake", "quests"], d: "Slither with quests, skins and a beetle mode — the deepest snake io game." },
  { id: "sploop-io", t: "Sploop.io", u: "https://sploop.io/", c: "io", g: ["turrets", "survival"], d: "Build turrets, farm resources and raid enemies in top-down survival battles." },

  /* --- sports --- */
  { id: "retro-bowl", t: "Retro Bowl", u: "https://retrobowl.me/", c: "sports", g: ["football", "management"], d: "The retro football phenomenon — draft your roster, call the plays, win the Bowl." },

  /* --- arcade / endless --- */
  { id: "slope", t: "Slope", u: "https://slopegame.io/", c: "arcade", g: ["3d", "endless", "neon"], d: "Roll a ball down a neon slope that keeps getting faster. How far can you go?" },
  { id: "run-3", t: "Run 3", u: "https://www.gameflare.com/embed/run-3/", c: "arcade", g: ["platformer", "space", "endless"], d: "Sprint through tunnels in outer space — rotate the world and dodge the gaps." },
  { id: "tunnel-rush", t: "Tunnel Rush", u: "https://www.gameflare.com/embed/tunnel-rush/", c: "arcade", g: ["3d", "reflex", "speed"], d: "Dodge walls at full speed through an endless neon tunnel." },
  { id: "crossy-road", t: "Crossy Road", u: "https://crossy-road.io/", c: "arcade", g: ["endless", "retro"], d: "Why did the chicken cross the road? Cars, trains and rivers say: carefully." },
  { id: "moto-x3m", t: "Moto X3M", u: "https://motox3m.io/", c: "arcade", g: ["motorcycle", "levels", "stunts"], d: "The definitive motorbike stunt game — 22 levels of flips, explosions and checkpoints." },
  { id: "drift-boss", t: "Drift Boss", u: "https://driftboss.io/", c: "arcade", g: ["drift", "one-button"], d: "One-button drifting — steer left, steer right, don't fall off the platform." },
  { id: "chrome-dino", t: "Chrome Dino Runner", u: "https://wayou.github.io/t-rex-runner/", c: "arcade", g: ["endless", "offline"], d: "The hidden Chrome offline game — jump cacti and dodge pterodactyls." },
  { id: "clumsy-bird", t: "Clumsy Bird", u: "https://ellisonleao.github.io/clumsy-bird/", c: "arcade", g: ["flappy", "open-source"], d: "The open-source Flappy Bird — tap to flap through the pipes." },

  /* --- platformer --- */
  { id: "vex-7", t: "Vex 7", u: "https://www.gameflare.com/embed/vex-7/", c: "platformer", g: ["stickman", "levels"], d: "The stickman platforming saga — wall-jump and slide through deadly obstacle courses." },
  { id: "fireboy-watergirl-2", t: "Fireboy & Watergirl 2", u: "https://kbhgames.com/game/fireboy-and-watergirl-2-light-temple", c: "platformer", g: ["co-op", "puzzle"], d: "Two-player temple puzzles — fire and water must work together or fail together." },
  { id: "temple-of-boom", t: "Temple of Boom", u: "https://kbhgames.com/game/temple-of-boom", c: "platformer", g: ["guns", "monsters"], d: "Fight monsters across collapsing temple floors — solo or with a friend." },
  { id: "mmp-scratch", t: "Massive Multiplayer Platformer", u: "https://scratch.mit.edu/projects/612229554/embed", c: "platformer", g: ["griffpatch", "mmo", "levels"], d: "griffpatch's MMO platformer — run levels built by thousands of players." },

  /* --- Flash-era classics (KBHgames) --- */
  { id: "happy-wheels", t: "Happy Wheels", u: "https://kbhgames.com/game/happy-wheels", c: "classic", g: ["ragdoll", "bloody", "levels"], d: "The infamous ragdoll physics game — dangerously unsafe vehicles, gloriously so." },
  { id: "age-of-war", t: "Age of War", u: "https://www.gameflare.com/embed/age-of-war/", c: "classic", g: ["strategy", "tower-defense"], d: "Evolve through five ages of warfare and crush the enemy base." },
  { id: "impossible-quiz", t: "The Impossible Quiz", u: "https://www.gameflare.com/embed/the-impossible-quiz/", c: "classic", g: ["trivia", "troll"], d: "110 questions designed to troll you. Splapp-me-do's masterpiece of frustration." },
  { id: "escaping-the-prison", t: "Escaping the Prison", u: "https://www.gameflare.com/embed/escaping-the-prison/", c: "classic", g: ["henry-stickmin", "choices"], d: "Henry Stickmin's prison break — pick the right tools, laugh at the wrong ones." },
  { id: "fnf", t: "Friday Night Funkin'", u: "https://www.gameflare.com/embed/friday-night-funkin/", c: "rhythm", g: ["rhythm", "music", "mods"], d: "The rhythm phenomenon — arrow keys on the beat, win rap battles, kiss the girlfriend." },
  { id: "baldis-basics", t: "Baldi's Basics", u: "https://kbhgames.com/game/baldis-basics-classic-remastered", c: "classic", g: ["horror", "school", "math"], d: "Answer math questions. Get them wrong. RUN. The cult horror-parody hit." },
  { id: "bloxorz", t: "Bloxorz", u: "https://kbhgames.com/game/bloxorz", c: "classic", g: ["puzzle", "rolling"], d: "Roll the block, bridge the gaps, fall through the right hole. Pure logic." },
  { id: "duck-life-4", t: "Duck Life 4", u: "https://www.gameflare.com/embed/duck-life-4/", c: "classic", g: ["racing", "training"], d: "Train your duck, race your duck, become the duck. The beloved series continues." },

  /* --- classic / puzzle --- */
  { id: "pacman", t: "Pac-Man", u: "https://masonicgit.github.io/pacman/", c: "classic", g: ["arcade", "1980"], d: "Waka waka — the arcade original, faithfully rebuilt in HTML5." },
  { id: "minesweeper-online", t: "Minesweeper", u: "https://minesweeper.online/", c: "puzzle", g: ["logic", "windows"], d: "The Windows classic — beginner to expert boards, no downloads." },
  { id: "solitr", t: "Solitaire", u: "https://solitr.com/", c: "puzzle", g: ["cards", "klondike"], d: "Klondike solitaire, the way the office intended it." },
  { id: "hextris", t: "Hextris", u: "https://cdn.jsdelivr.net/gh/Hextris/Hextris@master/index.html", c: "puzzle", g: ["tetris-like", "hexagon"], d: "Tetris on a hexagon — rotate the board, stack the blocks. Fast and addictive." },
  { id: "astray", t: "Astray", u: "https://wwwtyro.github.io/Astray/", c: "puzzle", g: ["3d", "maze", "webgl"], d: "Guide a marble through gorgeous WebGL mazes with realistic physics." },
  { id: "hexgl", t: "HexGL", u: "https://hexgl.bkcore.com/", c: "racing", g: ["3d", "futuristic", "webgl"], d: "A Wipeout-inspired WebGL racer — blistering anti-gravity speeds." },

  /* --- idle / clicker --- */
  { id: "cookie-clicker", t: "Cookie Clicker", u: "https://orteil.dashnet.org/cookieclicker/", c: "idle", g: ["clicker", "cookies"], d: "Orteil's legendary cookie empire — bake, upgrade, ascend, repeat." },
  { id: "doge-miner-2", t: "Doge Miner 2", u: "https://dogeminer2.com/", c: "idle", g: ["clicker", "doge", "space"], d: "Much mine. Very doge. Wow — build a space rig with the goodest coin." },
  { id: "a-dark-room", t: "A Dark Room", u: "https://doublespeakgames.github.io/adarkroom/", c: "idle", g: ["text", "mystery"], d: "A minimalist text adventure that slowly reveals its secrets. A cult classic." },
  { id: "universal-paperclips", t: "Universal Paperclips", u: "https://www.decisionproblem.com/paperclips/index2.html", c: "idle", g: ["ai", "strategy"], d: "You are an AI that makes paperclips. It does not end well for humanity." },

  /* --- racing --- */
  { id: "slow-roads", t: "Slow Roads", u: "https://slowroads.io/", c: "racing", g: ["relaxing", "endless", "3d"], d: "Endless procedurally-generated driving with cruise control — pure zen." },
  { id: "dashcraft", t: "DashCraft.io", u: "https://dashcraft.io/", c: "racing", g: ["trackmania", "community", "3d"], d: "Trackmania-style time trials on player-built tracks." },

  /* --- trivia --- */
  { id: "google-feud", t: "Google Feud", u: "https://googlefeud.com/", c: "trivia", g: ["guessing", "family-feud"], d: "Family Feud, but the answers are real Google autocomplete searches." },
];

/* ---------------- builtins (ship with the app) ---------------- */

const BUILTINS = [
  ["2048", "2048", "puzzle", "Slide and merge tiles to reach 2048."],
  ["snake", "Snake", "classic", "Eat, grow, don't bite yourself."],
  ["tetris", "Tetris", "classic", "Stack falling blocks and clear lines."],
  ["minesweeper", "Minesweeper (built-in)", "puzzle", "Reveal every safe tile."],
  ["breakout", "Breakout", "arcade", "Bounce the ball, clear the wall."],
  ["flappy", "Flappy Bird", "arcade", "Tap to flap through pipes."],
  ["pong", "Pong", "classic", "The original rally, vs AI or a friend."],
  ["memory", "Memory", "puzzle", "Flip cards, find the pairs."],
  ["tictactoe", "Tic-Tac-Toe", "classic", "Three in a row, vs AI or a friend."],
  ["simon", "Simon", "classic", "Repeat the pattern — how far can you go?"],
  ["asteroids", "Asteroids", "arcade", "The vector arcade classic."],
  ["clicker", "Void Clicker", "idle", "Click the void. Fill the void."],
];

/* ---------------- verification ---------------- */

/* Node's fetch TLS/headers fingerprint triggers WAFs (Cloudflare etc.)
   that real browsers and curl pass — verify with curl instead. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

async function verify(game) {
  const problems = [];
  let finalUrl = game.u;
  let title = "";
  try {
    /* pass 1 — headers */
    const { stdout: head } = await execFileP(
      "curl",
      [
        "-sIL", game.u, "--max-time", "15",
        "-A", UA,
        "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "-H", "Accept-Language: en-US,en;q=0.9",
      ],
      { timeout: 20000 }
    );
    const code = [...head.matchAll(/^HTTP\/[\d.]+\s+(\d+)/gim)].map((m) => m[1]).pop() || "0";
    if (code !== "200") problems.push(`HTTP ${code}`);
    const xfo = /^x-frame-options:\s*(.+)$/im.exec(head)?.[1]?.trim();
    if (xfo && /deny|sameorigin/i.test(xfo)) problems.push(`X-Frame-Options: ${xfo}`);
    const csp = /^content-security-policy:\s*(.+)$/im.exec(head)?.[1] || "";
    const fa = /frame-ancestors[^;]*/i.exec(csp)?.[0] || "";
    if (fa && !fa.includes("*")) problems.push(`CSP ${fa.trim()}`);
    const loc = /^location:\s*(\S+)$/im.exec(head)?.[1];
    if (loc) finalUrl = new URL(loc, game.u).href;

    /* pass 2 — body (title + spam scan) */
    const { stdout: body } = await execFileP(
      "curl",
      ["-sL", finalUrl, "--max-time", "15", "-A", UA, "-H", "Accept-Language: en-US,en;q=0.9"],
      { timeout: 20000, maxBuffer: 20 * 1024 * 1024 }
    );
    title = (/<title[^>]*>([^<]*)/i.exec(body)?.[1] || "").trim().slice(0, 120);
    const lower = (title + " " + body.slice(0, 4000)).toLowerCase();
    /* spam/parked detection — mirrors get taken over by junk sites */
    if (/slot gacor|bandar|casino|judi|daftar login|rtp tertinggi|trực tiếp bóng|parked domain|buy this domain|site ready/.test(lower)) {
      problems.push("SPAM/PARKED content detected");
    }
  } catch (err) {
    problems.push(`fetch failed: ${err.message.slice(0, 80)}`);
  }
  return { ...game, finalUrl, title, problems };
}

/* ---------------- main ---------------- */

const results = [];
for (const game of CANDIDATES) {
  const r = await verify(game);
  const ok = r.problems.length === 0;
  results.push(r);
  console.log(`${ok ? "OK  " : "FAIL"} ${game.id.padEnd(22)} ${r.problems.join(" ; ") || (r.title || "").slice(0, 60)}`);
}

const okGames = results.filter((r) => r.problems.length === 0);
const failed = results.filter((r) => r.problems.length > 0);
if (failed.length > 0) {
  console.log(`\nDROPPED ${failed.length} broken/blocked/spam entries:`);
  for (const f of failed) console.log(`  - ${f.id}: ${f.problems.join(" ; ")}`);
}

/* thumbnails: Google's public favicon service for recognizable brands */
const thumbFor = (r) => {
  try {
    const host = new URL(r.finalUrl).hostname;
    if (host.endsWith("github.io") || host.includes("jsdelivr.net") || host.includes("scratch.mit.edu")) return "";
    return `https://www.google.com/s2/favicons?sz=128&domain=${host}`;
  } catch {
    return "";
  }
};

/* natural aspect ratios per category */
const SIZES = {
  arcade: [960, 600], shooter: [960, 600], io: [960, 640], sports: [960, 640],
  platformer: [960, 640], classic: [960, 640], puzzle: [960, 640],
  idle: [960, 600], racing: [960, 540], sandbox: [960, 540], trivia: [960, 600],
  rhythm: [960, 640],
};

const games = [];

for (const r of okGames) {
  const [w, h] = SIZES[r.c] || [960, 600];
  games.push({
    id: r.id,
    t: r.t,
    d: r.d,
    u: r.u,
    px: 0,
    c: r.c,
    g: r.g,
    th: thumbFor(r),
    w,
    h,
    b: 0,
  });
}

for (const [id, name, cat, desc] of BUILTINS) {
  games.push({
    id,
    t: name,
    d: desc,
    u: "",
    px: 0,
    c: cat,
    g: [],
    th: "",
    w: 960,
    h: 600,
    b: 1,
    bi: id,
  });
}

/* category meta with live counts */
const catLabels = {
  sandbox: "Sandbox", shooter: "Shooter", io: ".io Arena", arcade: "Arcade",
  platformer: "Platformer", classic: "Classics", puzzle: "Puzzle", idle: "Idle",
  racing: "Racing", sports: "Sports", trivia: "Trivia", rhythm: "Rhythm",
};
const counts = new Map();
for (const g of games) counts.set(g.c, (counts.get(g.c) || 0) + 1);
const categories = [...counts.entries()]
  .map(([slug, count]) => ({ slug, label: catLabels[slug] || slug, count }))
  .sort((a, b) => b.count - a.count);

const catalog = {
  generatedAt: new Date().toISOString(),
  source: "hand-curated popular games (official sites, KBHgames, Scratch, GitHub Pages) + built-in",
  total: games.length,
  categories,
  games,
};

const out = path.join(process.cwd(), "data", "games.json");
await writeFile(out, JSON.stringify(catalog, null, 2));
console.log(`\nWrote ${games.length} games (${okGames.length} verified external + ${BUILTINS.length} built-in) → ${out}`);
