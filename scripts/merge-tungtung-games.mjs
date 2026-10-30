/**
 * Memphis unBLACKed — merge popular games from the tung tung reference
 * (vcsasecrly.365-24-7.de) into data/games.json.
 *
 * The reference's /play section loads 7 JSON lists:
 *   mc4d5af1 = gn-math (809)   — self-hosted "study2/" on the reference domain
 *   m882f408 = seraph  (468)   — self-hosted "study/"  on the reference domain
 *   m8f04680 = hydra   (872)   — PUBLIC jsdelivr CDN (github.com/zennedu/hydra)
 *   mf113660 = 3kh0    (370)   — PUBLIC jsdelivr CDN (github.com/zennedu/3kh)
 *   m630d80d = ports   (107)   — self-hosted "/k/"    on the reference domain
 *   m4d6f852 = (empty)
 *   m576e992 = tglsc   (83)    — self-hosted "/k/"    on the reference domain
 *
 * This script adds a hand-picked popular subset (their FEATURED list +
 * the classic unblocked-games canon + iconic FNF mods), preferring the
 * public jsdelivr CDN when a title exists in both. Every game is
 * build-time verified exactly like the GameFlare batch:
 *   - HTTP 200 on the embed URL
 *   - no X-Frame-Options deny/sameorigin
 *   - no CSP frame-ancestors restricting embedding
 *   - thumbnail checked; empty string if it 404s
 *
 * Entries get "tt-" ids and are inserted after the curated block.
 * Idempotent: re-running rebuilds the tt- batch from the wants list.
 *
 * Run: node scripts/merge-tungtung-games.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REF = "https://vcsasecrly.365-24-7.de";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/* jsdelivr-backed lists first (public CDN > private reference domain) */
const LISTS = [
  { key: "mf113660", name: "3kh0", jsdelivr: true },
  { key: "m8f04680", name: "hydra", jsdelivr: true },
  { key: "mc4d5af1", name: "gn-math", jsdelivr: false },
  { key: "m882f408", name: "seraph", jsdelivr: false },
  { key: "m630d80d", name: "ports", jsdelivr: false },
  { key: "m576e992", name: "tglsc", jsdelivr: false },
];

const norm = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* ---------------------------------------------------------------
   Curated wants.  find  = exact normalized name in a reference list
   title = display name     cat = our taxonomy slug
   --------------------------------------------------------------- */
const WANTS = [
  /* --- their FEATURED list --- */
  { find: "Coffee Talk", title: "Coffee Talk", cat: "simulation", tags: ["cozy", "coffee"],
    d: "Brew drinks for Seattle's fantasy regulars — vampires, elves and mermaids included — in this cozy late-night coffee shop sim." },
  { find: "Animal Crossing: Population Growing!", title: "Animal Crossing: Population Growing!", cat: "simulation", tags: ["animal-crossing", "life-sim"],
    d: "The GameCube original. Settle into a village of talking animals — fish, dig, decorate and pay off your mortgage to Tom Nook." },
  { find: "A Difficult Game About Climbing", title: "A Difficult Game About Climbing", cat: "arcade", tags: ["rage", "physics"],
    d: "One man, one hammer, one slippery mountain. A rage-inducing physics climb — one mistake and you slide all the way back down." },
  { find: "Tung Tung Horror", title: "Tung Tung Horror", cat: "horror", tags: ["tung-tung-sahur", "meme"],
    d: "Tung Tung Sahur turns horror. Survive the night while the drum-wielding figure hunts you through the dark." },
  { find: "FNAF Sisters Location", title: "FNAF: Sisters Location", cat: "horror", tags: ["fnaf", "animatronics"],
    d: "Run the night shift at Circus Baby's underground party facility. Watch the animatronics, mind the vents, survive until morning." },
  { find: "Drive Mad", title: "Drive Mad", cat: "racing", tags: ["physics", "obstacle"],
    d: "Keep the jeep upright over wobbly obstacle courses. Simple controls, maddening physics — drive fast, land clean." },
  { find: "Geometry Dash", title: "Geometry Dash", cat: "platformer", tags: ["geometry-dash", "rhythm"],
    d: "Jump and fly through rhythm-based obstacle gauntlets. One-touch controls, brutal difficulty, iconic soundtrack." },
  { find: "Geometry Dash Lite", title: "Geometry Dash Lite", cat: "platformer", tags: ["geometry-dash", "rhythm"],
    d: "The free chapter of Geometry Dash — same rhythm, same rage, zero cost." },
  { find: "Minecraft 1.12.2", title: "Minecraft 1.12.2", cat: "sandbox", tags: ["minecraft", "eaglercraft"],
    d: "Full Minecraft in the browser — the classic 1.12.2 world update. Build, mine, craft and survive." },
  { find: "Minecraft 1.8.8", title: "Minecraft 1.8.8", cat: "sandbox", tags: ["minecraft", "eaglercraft", "pvp"],
    d: "The legendary 1.8.8 era of Minecraft — the version PvP players never let go of." },
  { find: "Vex 1", title: "Vex 1", cat: "platformer", tags: ["vex", "stickman", "parkour"],
    d: "Where it all started. Guide the stickman through acts of spikes, saws and traps." },
  { find: "Vex 3", title: "Vex 3", cat: "platformer", tags: ["vex", "stickman", "parkour"],
    d: "More acts, more traps, more wall-jumps — the fan-favorite Vex." },
  { find: "Vex 3 XMAS", title: "Vex 3 XMAS", cat: "platformer", tags: ["vex", "stickman", "christmas"],
    d: "Vex 3 in a winter coat — same brutal parkour, festive decoration." },
  { find: "Vex 6", title: "Vex 6", cat: "platformer", tags: ["vex", "stickman", "parkour"],
    d: "The trickiest acts yet — swing on poles, ride platforms, dodge the newer traps." },
  { find: "Vex 8", title: "Vex 8", cat: "platformer", tags: ["vex", "stickman", "parkour"],
    d: "The newest mainline Vex — the stickman parkour formula at its most polished." },
  { find: "Vex Challenges", title: "Vex Challenges", cat: "platformer", tags: ["vex", "challenge"],
    d: "Vex goes level-based: short, sharp challenge runs against the clock." },

  /* --- more Minecraft eras --- */
  { find: "Minecraft 1.21.4", title: "Minecraft 1.21.4", cat: "sandbox", tags: ["minecraft", "eaglercraft"],
    d: "The newest world update playable in the browser — trial chambers, the breeze and all." },
  { find: "Minecraft 1.5.2", title: "Minecraft 1.5.2", cat: "sandbox", tags: ["minecraft", "eaglercraft"],
    d: "The classic 1.5 Redstone Update era of Minecraft, in your browser." },
  { find: "Minecraft Beta 1.7.3", title: "Minecraft Beta 1.7.3", cat: "sandbox", tags: ["minecraft", "beta", "nostalgia"],
    d: "Old-school Beta — the version nostalgia servers keep alive. No hunger, no sprinting, pure blocks." },
  { find: "Minecraft Alpha 1.2.6", title: "Minecraft Alpha 1.2.6", cat: "sandbox", tags: ["minecraft", "alpha", "nostalgia"],
    d: "Back to Alpha: no beds, no banners, just you and an infinite blocky world." },
  { find: "Minecraft Pocket Edition", title: "Minecraft Pocket Edition", cat: "sandbox", tags: ["minecraft", "pocket"],
    d: "The mobile edition's early build — the whole pocket Minecraft experience in your browser." },
  { find: "Animal Crossing: Wild World", title: "Animal Crossing: Wild World", cat: "simulation", tags: ["animal-crossing", "life-sim"],
    d: "The DS favorite in the browser — same cozy village life, touch-era charm." },

  /* --- popular classics we're missing --- */
  { find: "BitLife", title: "BitLife", cat: "simulation", tags: ["life-sim", "text"],
    d: "Live a whole life from crib to grave — school, jobs, crime, marriage. Every choice writes your obituary." },
  { find: "Among Us", title: "Among Us", cat: "strategy", tags: ["social-deduction", "space"], src: "hydra",
    d: "The social deduction hit. Fix the ship, find the impostor — or lie your way to victory." },
  { find: "Slope 2", title: "Slope 2", cat: "racing", tags: ["slope", "endless", "3d"],
    d: "The endless neon ball-roller returns — faster, steeper, glitchier. Chase high scores down the shifting hill." },
  { find: "Subway Surfers", title: "Subway Surfers", cat: "arcade", tags: ["endless-runner", "dodge"],
    d: "Dash down the tracks, dodge the trains and outrun the inspector. The endless-runner juggernaut." },
  { find: "Getaway Shootout", title: "Getaway Shootout", cat: "two-player", tags: ["ragdoll", "shooting", "race"],
    d: "Two racers, one getaway. Gun, jump and grapple past your friend to the extraction point first." },
  { find: "Soccer Random", title: "Soccer Random", cat: "sports", tags: ["random-series", "two-player", "ragdoll"],
    d: "Ragdoll two-button soccer. Timing is everything — and so is luck." },
  { find: "Stickman Hook", title: "Stickman Hook", cat: "arcade", tags: ["swing", "momentum"],
    d: "Swing through hundreds of short levels Spider-Man style. Tap to attach, release to fly." },
  { find: "Tiny Fishing", title: "Tiny Fishing", cat: "casual", tags: ["fishing", "upgrade"],
    d: "The addictive cast-and-upgrade fisher. Angle for deeper, rarer, weirder fish every run." },
  { find: "Time Shooter 2", title: "Time Shooter 2", cat: "shooter", tags: ["superhot-like", "slow-motion"],
    d: "Time moves only when you do. Dodge bullets in slow motion and plan every single shot." },
  { find: "OvO", title: "OvO", cat: "platformer", tags: ["momentum", "speedrun"], src: "gn-math",
    d: "Momentum platforming with slides, wall-runs and coyote jumps. Built for speedruns." },
  { find: "Bowmasters", title: "Bowmasters", cat: "action", tags: ["aim", "ragdoll", "duel"],
    d: "Aim, angle, annihilate. Ragdoll archery duels with dozens of unlockable characters." },
  { find: "Doodle Jump", title: "Doodle Jump", cat: "arcade", tags: ["endless", "vertical"],
    d: "Bounce up an endless hand-drawn tower. Mind the black holes and broken platforms." },
  { find: "Idle Breakout", title: "Idle Breakout", cat: "idle", tags: ["breakout", "upgrade"],
    d: "The idle-game take on Breakout — buy balls, upgrade damage, break bricks while you sleep." },
  { find: "Clicker Heroes", title: "Clicker Heroes", cat: "idle", tags: ["clicker", "rpg"],
    d: "Click monsters, hire heroes, automate everything. The comfy clicker that fueled a genre." },
  { find: "Learn to Fly", title: "Learn to Fly", cat: "arcade", tags: ["launcher", "penguin"],
    d: "The original: a penguin, a ramp and stubborn physics. Glide farther with every run." },
  { find: "Learn to Fly Idle", title: "Learn to Fly Idle", cat: "idle", tags: ["clicker", "snowball"],
    d: "The Learn to Fly spin on idles — click, upgrade and snowball your way to orbit." },
  { find: "Retro Bowl College", title: "Retro Bowl College", cat: "sports", tags: ["retro-bowl", "football", "management"],
    d: "Retro Bowl on campus — recruit, redshirt and coach your college roster to the championship." },
  { find: "Two Ball 3D", title: "Two Ball 3D", cat: "racing", tags: ["endless", "two-player"],
    d: "Endless 3D runner for one or two players — same track, first to fall loses." },
  { find: "Only Up", title: "Only Up", cat: "platformer", tags: ["vertical", "climb", "no-save"],
    d: "A vertical climb through a sky of floating junk. No saves — one fall is a very long fall." },
  { find: "Suika", title: "Suika", cat: "puzzle", tags: ["merge", "fruit", "physics"],
    d: "The watermelon game: drop and merge fruit, aim for the big melon, never overflow the jar." },
  { find: "Paper.io 3D", title: "Paper.io 3D", cat: "io", tags: ["territory", "3d"],
    d: "Claim territory on a spinning 3D globe. Cut off rivals before they cut you off." },
  { find: "Superfighters", title: "Superfighters", cat: "fighting", tags: ["stickman", "guns", "chaos"],
    d: "Chunky 2D brawls with guns, grenades and brutal physics. Couch-warfare chaos for two." },
  { find: "Tank Trouble 2", title: "Tank Trouble 2", cat: "two-player", tags: ["tanks", "maze", "bullets"],
    d: "Maze-tank duels where your own bullets bounce right back at you. Classic classroom warfare." },
  { find: "Territory War", title: "Territory War", cat: "strategy", tags: ["turn-based", "stickman"],
    d: "Turn-based stickman squad combat — grenades, rifles and carefully placed jumps." },
  { find: "Swords and Sandals", title: "Swords and Sandals", cat: "fighting", tags: ["gladiator", "rpg"],
    d: "Build a gladiator and fight your way up the arena ladder. The classic flash RPG-fighter." },
  { find: "Thing-Thing Arena 3", title: "Thing-Thing Arena 3", cat: "shooter", tags: ["arena", "flash"],
    d: "Fast top-down arena killing fields. Weapons everywhere, cover nowhere." },
  { find: "Zombotron 2", title: "Zombotron 2", cat: "shooter", tags: ["zombies", "flash", "planet"],
    d: "Shoot and loot your way across a zombie-infested mining planet. Flash-era action gold." },
  { find: "Gun Mayhem 2", title: "Gun Mayhem 2", cat: "two-player", tags: ["platform-shooter", "party"],
    d: "Knock your friends off the platform in chaotic gun-battles — dozens of weapons, modes and maps." },
  { find: "Earn Tod Ie 2", title: "Earn to Die 2", cat: "racing", tags: ["zombies", "upgrade", "car"],
    d: "Plow through zombie hordes with an armored car, earn cash, upgrade the wreck, repeat." },
  { find: "Burrito Bison: Launcha Libre", title: "Burrito Bison: Launcha Libre", cat: "arcade", tags: ["launcher", "upgrade"],
    d: "Launch the luchador, squash gummy bears, buy absurd upgrades. The beloved launcher classic." },
  { find: "Boxhead 2 Playrooms", title: "Boxhead: 2Play Rooms", cat: "shooter", tags: ["zombies", "co-op", "flash"],
    d: "Endless zombie waves, one boxhead, upgradeable guns. The co-op flash classic." },
  { find: "Crazy Cattle 3D", title: "Crazy Cattle 3D", cat: "io", tags: ["battle-royale", "cows", "viral"],
    d: "The viral battle royale where everyone rides battle cattle. Bump every cow off the island." },
  { find: "Raft", title: "Raft", cat: "simulation", tags: ["survival", "ocean"],
    d: "Stranded on a tiny raft on an endless ocean — fish, collect, expand, survive." },
  { find: "Tron", title: "Tron", cat: "classic", tags: ["light-cycles", "arcade"],
    d: "Light-cycle duel: draw walls of light, trap your rival, never crash first. The arcade legend." },
  { find: "Dreadhead Parkour", title: "Dreadhead Parkour", cat: "platformer", tags: ["parkour", "rooftops"],
    d: "Flip, slide and wall-run through rooftop courses as a parkour master." },
  { find: "Noob Steve Parkour", title: "Noob Steve Parkour", cat: "platformer", tags: ["minecraft-style", "jumps"],
    d: "Minecraft-styled block parkour — jump from cube to cube, no checkpoints, no mercy." },
  { find: "Block Craft Parkour", title: "Block Craft Parkour", cat: "platformer", tags: ["blocky", "jumps"],
    d: "More blocky parkour runs — time your jumps across floating voxel platforms." },
  { find: "Rainbow Obby", title: "Rainbow Obby", cat: "platformer", tags: ["obby", "roblox-style", "tower"],
    d: "The Roblox-style rainbow tower obby. Climb past colorful traps all the way to the top." },
  { find: "Bob the Robber", title: "Bob the Robber", cat: "puzzle", tags: ["stealth", "heist"],
    d: "Sneak through houses, dodge cameras and steal back the goods. The stealth-puzzle classic." },
  { find: "Bob The Robber 2", title: "Bob the Robber 2", cat: "puzzle", tags: ["stealth", "heist"],
    d: "Bob's back — more guards, more gadgets, more elaborate heists." },
  { find: "Bad Ice Cream 2", title: "Bad Ice Cream 2", cat: "arcade", tags: ["maze", "ice", "co-op"],
    d: "Slick your way through more frosty mazes — tougher monsters, new ice tricks." },
  { find: "Bad Ice Cream 3", title: "Bad Ice Cream 3", cat: "arcade", tags: ["maze", "ice", "co-op"],
    d: "The freeze-'em-all finale: 36 levels and a pile of new mechanics." },
  { find: "Bloons TD", title: "Bloons TD 1", cat: "strategy", tags: ["tower-defense", "monkeys", "balloons"],
    d: "The tower defense that started it all — dart monkeys versus endless balloons." },
  { find: "Bloons TD 2", title: "Bloons TD 2", cat: "strategy", tags: ["tower-defense", "monkeys", "balloons"],
    d: "More towers, more bloon types, more popping. The monkey army grows." },
  { find: "World's Hardest Game 2", title: "World's Hardest Game 2", cat: "arcade", tags: ["rage", "reflex"],
    d: "It's back and it's somehow harder. Move the square, dodge the dots, question your choices." },
  { find: "The World's Hardest Game 3", title: "World's Hardest Game 3", cat: "arcade", tags: ["rage", "reflex"],
    d: "Third round of the infamous reflex torture test." },
  { find: "The World's Hardest Game 4", title: "World's Hardest Game 4", cat: "arcade", tags: ["rage", "reflex"],
    d: "Four times the levels, four times the pain. You asked for this." },
  { find: "Duck Life", title: "Duck Life 1", cat: "casual", tags: ["duck-life", "training", "racing"], src: "gn-math",
    d: "Train your duckling — running, flying, swimming — then race for the championship crown." },
  { find: "Duck Life 2", title: "Duck Life 2", cat: "casual", tags: ["duck-life", "training", "racing"],
    d: "A bigger training grind and the world championship of duck racing." },
  { find: "Duck Life 3", title: "Duck Life 3", cat: "casual", tags: ["duck-life", "evolution"],
    d: "Evolve your duck's specialist class and race the world all over again." },
  { find: "Duck Life Battle", title: "Duck Life Battle", cat: "casual", tags: ["duck-life", "rpg", "battles"],
    d: "The Duck Life spin on RPG battles — train stats and win turn-by-turn fights." },
  { find: "Riddle School", title: "Riddle School", cat: "puzzle", tags: ["escape", "point-and-click"],
    d: "Help Phil escape the world's most escapable school. The point-and-click classic." },
  { find: "Riddle School 2", title: "Riddle School 2", cat: "puzzle", tags: ["escape", "point-and-click"],
    d: "Phil's out… and immediately stuck again. New school, new riddles." },
  { find: "Riddle School 3", title: "Riddle School 3", cat: "puzzle", tags: ["escape", "point-and-click"],
    d: "The biggest, funniest escape of the series." },
  { find: "Riddle School 4", title: "Riddle School 4", cat: "puzzle", tags: ["escape", "point-and-click"],
    d: "Short, weird and legendary. No spoilers." },
  { find: "Riddle School 5", title: "Riddle School 5", cat: "puzzle", tags: ["escape", "point-and-click"],
    d: "The alien-finale of the Riddle School saga." },
  { find: "Fireboy and Watergirl 3", title: "Fireboy and Watergirl 3", cat: "puzzle", tags: ["co-op", "elemental"],
    d: "The elemental duo hits the Ice Temple — light and shadow puzzles built for two." },
  { find: "Fireboy and Watergirl 4", title: "Fireboy and Watergirl 4", cat: "puzzle", tags: ["co-op", "portals"],
    d: "Crystal Temple portal puzzles — solo or with a friend at one keyboard." },
  { find: "Fancy Pants Adventure 2", title: "Fancy Pants Adventure 2", cat: "platformer", tags: ["fancy-pants", "flow"],
    d: "The stickman with the fancy pants returns — flowy slopes, squiggles and spiders." },
  { find: "Fancy Pants Adventure 3", title: "Fancy Pants Adventure 3", cat: "platformer", tags: ["fancy-pants", "flow"],
    d: "The biggest Fancy Pants world yet — golf clubs, pirates and piratical pants." },
  { find: "Moto X3M 2", title: "Moto X3M 2", cat: "racing", tags: ["moto-x3m", "stunts", "checkpoints"],
    d: "More flipping, more spikes, more checkpoints. The sequel cranks everything up." },
  { find: "Moto X3M 3", title: "Moto X3M 3", cat: "racing", tags: ["moto-x3m", "stunts"],
    d: "New stunts, new saws, same glorious flipping death." },
  { find: "Moto X3M Spooky", title: "Moto X3M Spooky", cat: "racing", tags: ["moto-x3m", "halloween"],
    d: "The Halloween level pack — pumpkins, skeletons and headless stunts." },
  { find: "Madalin Stunt Cars 2", title: "Madalin Stunt Cars 2", cat: "racing", tags: ["stunts", "supercars", "sandbox"],
    d: "The sandbox stunt-driving favorite — drift, flip and crash supercars around empty lots." },
  { find: "Bubbles Hooter", title: "Bubble Shooter", cat: "puzzle", tags: ["match-3", "classic"],
    d: "Aim, shoot, pop. The endless color-matching classic — clear the board before it sinks." },

  /* --- iconic FNF mods --- */
  { find: "Friday Night Funkin': vs. Tricky", title: "FNF': vs. Tricky", cat: "rhythm", tags: ["fnf", "mod", "horror"],
    d: "The Clown Violent horror himself steps into the rap ring. Chaotic charts, iconic mod." },
  { find: "Friday Night Funkin': V.S. Whitty", title: "FNF': V.S. Whitty", cat: "rhythm", tags: ["fnf", "mod"],
    d: "The hot-headed bomb mod that lit up the FNF scene." },
  { find: "Friday Night Funkin': vs. Garcello", title: "FNF': vs. Garcello", cat: "rhythm", tags: ["fnf", "mod"],
    d: "Chill, smoky and heartbreaking — the fan-favorite cigarette-smoking challenger." },
  { find: "Friday Night Funkin': Vs. Hex", title: "FNF': Vs. Hex", cat: "rhythm", tags: ["fnf", "mod"],
    d: "The wholesome robot basketballer with smooth original tracks." },
  { find: "Friday Night Funkin vs Tabi", title: "FNF vs Tabi", cat: "rhythm", tags: ["fnf", "mod"],
    d: "The vengeful ex-producer — a mod famous for its aggressive final track." },
  { find: "Friday Night Funkin VS. Sky", title: "FNF VS. Sky", cat: "rhythm", tags: ["fnf", "mod"],
    d: "The pastel stalker-girlfriend mod with cult-favorite songs." },
  { find: "Friday Night Funkin vs Zardy", title: "FNF vs Zardy", cat: "rhythm", tags: ["fnf", "mod", "horror"],
    d: "The scarecrow of Zardy's Farm haunts the charts." },
  { find: "Friday Night Funkin vs Shaggy", title: "FNF vs Shaggy", cat: "rhythm", tags: ["fnf", "mod", "meme"],
    d: "Scooby's snack master goes ultra instinct. Meme charts, zero mercy." },
  { find: "Friday Night Funkin VS. KAPI", title: "FNF VS. KAPI", cat: "rhythm", tags: ["fnf", "mod"],
    d: "The arcade cat behind the keyboard — tight, sync-heavy charts." },
  { find: "Friday Night Funkin': vs. QT", title: "FNF': vs. QT", cat: "rhythm", tags: ["fnf", "mod"],
    d: "Sweet, pastel and surprisingly brutal — the QT mod." },
  { find: "Friday Night Funkin vs Nonsense", title: "FNF vs Nonsense", cat: "rhythm", tags: ["fnf", "mod"],
    d: "The silly-but-serious mod with the self-aware style." },
  { find: "Friday Night Funkin': Indie Cross", title: "FNF': Indie Cross", cat: "rhythm", tags: ["fnf", "mod", "crossover"],
    d: "Cuphead, Sans, Bendy and more indie icons in one massive crossover." },
  { find: "Friday Night Funkin': Mario's Madness", title: "FNF': Mario's Madness", cat: "rhythm", tags: ["fnf", "mod", "creepypasta"],
    d: "The creepypasta Mario universe — horror charts with legendary songs." },
  { find: "Friday Night Funkin': Sonic Legacy", title: "FNF': Sonic Legacy", cat: "rhythm", tags: ["fnf", "mod", "sonic"],
    d: "The Sonic universe roster with speed-metal charts." },
  { find: "Friday Night Funkin': B-Sides", title: "FNF': B-Sides", cat: "rhythm", tags: ["fnf", "mod", "remix"],
    d: "Every official week remixed and recharted — harder, funkier." },
  { find: "Friday Night Funkin' D-Sides", title: "FNF' D-Sides", cat: "rhythm", tags: ["fnf", "mod", "remix"],
    d: "The alternate-universe remix of the entire game." },
  { find: "Friday Night Funkin VS Impostor v4", title: "FNF VS Impostor v4", cat: "rhythm", tags: ["fnf", "mod", "among-us"],
    d: "The full Among Us musical saga — 40+ tracks of sus." },
  { find: "Friday Night Funkin': Sarvente's Mid-Fight Masses", title: "FNF': Mid-Fight Masses", cat: "rhythm", tags: ["fnf", "mod"],
    d: "Church, demons and bangers — the complete Mid-Fight Masses." },
  { find: "Friday Night Funkin': Vs. Hatsune Miku", title: "FNF': Vs. Hatsune Miku", cat: "rhythm", tags: ["fnf", "mod", "vocaloid"],
    d: "The vocaloid superstar takes the mic." },
];

/* --------------------------------------------------------------- */

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** STRICT embed verification — same rules as build-games-catalog.
 *  Content-type is recorded: jsdelivr serves .html as text/plain, which
 *  the player handles via its srcdoc mode (fetch + <base> inject), so
 *  text/plain is NOT a failure — but anything that's neither html nor
 *  plain text (e.g. binaries) is rejected. */
async function verifyEmbed(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (res.status !== 200) return `HTTP ${res.status}`;
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if (xfo.includes("deny") || xfo.includes("sameorigin")) return `XFO ${xfo}`;
    const csp = (res.headers.get("content-security-policy") || "").toLowerCase();
    const fa = csp.match(/frame-ancestors([^;]*)/);
    if (fa && !fa[1].includes("*")) return `CSP frame-ancestors${fa[1]}`;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("text/plain"))
      return `content-type ${ct}`;
    return null; // ok
  } catch (e) {
    return e.name === "TimeoutError" ? "timeout" : String(e).slice(0, 60);
  }
}

async function checkThumb(url) {
  if (!url) return "";
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    return res.ok ? url : "";
  } catch {
    return "";
  }
}

/* --- load reference lists --- */
console.log("Fetching reference game lists…");
const lists = [];
for (const l of LISTS) {
  const data = await fetchJson(`${REF}/${l.key}.json`);
  lists.push({ ...l, games: Array.isArray(data) ? data : [] });
  console.log(`  ${l.name.padEnd(7)} ${String(data.length).padStart(4)} games`);
}

/* index by normalized name (first entry per name per list) */
const index = new Map(); // norm → [{list, game}]
for (const l of lists) {
  for (const g of l.games) {
    const n = norm(g.name);
    if (!n) continue;
    if (!index.has(n)) index.set(n, []);
    const bucket = index.get(n);
    if (!bucket.some((b) => b.list.name === l.name)) bucket.push({ list: l, game: g });
  }
}

/* --- load existing catalog --- */
const dataDir = path.join(process.cwd(), "data");
const existing = JSON.parse(await readFile(path.join(dataDir, "games.json"), "utf8"));
/* idempotency: the tt- batch is fully rebuilt on every run, so previous
   tt- entries must NOT count as "already have" (that would drop them) */
const preexisting = existing.games.filter((g) => !g.id.startsWith("tt-"));
const haveNorm = new Set(preexisting.map((g) => norm(g.t)));
const haveIds = new Set(preexisting.map((g) => g.id));
const CAT_LABELS = Object.fromEntries(existing.categories.map((c) => [c.slug, c.label]));

/* --- resolve wants --- */
const added = [];
const skipped = [];
const notFound = [];
const failed = [];

const queue = [...WANTS];
const CONCURRENCY = 12;
async function worker() {
  while (queue.length) {
    const w = queue.shift();
    const n = norm(w.find);
    const tn = norm(w.title);
    if (haveNorm.has(n) || haveNorm.has(tn)) {
      skipped.push(`${w.title} — already in catalog`);
      continue;
    }
    const hits = index.get(n);
    if (!hits || !hits.length) {
      notFound.push(w.find);
      continue;
    }
    /* prefer jsdelivr-backed lists, then gn-math → seraph → ports → tglsc;
       w.src overrides for games whose jsdelivr upload is broken */
    const hit = w.src
      ? hits.find((h) => h.list.name === w.src) || hits[0]
      : hits[0];
    const url = hit.game.url.startsWith("http")
      ? hit.game.url
      : new URL(hit.game.url, `${REF}/`).href;
    const thumb = hit.game.image && hit.game.image.startsWith("http")
      ? hit.game.image
      : hit.game.image
        ? new URL(hit.game.image, `${REF}/`).href
        : "";

    const err = await verifyEmbed(url);
    if (err) {
      failed.push(`${w.title} [${hit.list.name}] — ${err}`);
      continue;
    }
    const th = await checkThumb(thumb);
    let id = `tt-${slugify(w.title)}`;
    let k = 2;
    while (haveIds.has(id)) id = `tt-${slugify(w.title)}-${k++}`;
    haveIds.add(id);
    haveNorm.add(n);
    haveNorm.add(tn);
    added.push({
      id,
      t: w.title,
      d: w.d,
      u: url,
      px: 0,
      c: w.cat,
      g: w.tags,
      th,
      w: 960,
      h: 600,
      b: 0,
    });
    console.log(`  ✓ ${w.title}  [${hit.list.name}${hit.list.jsdelivr ? " · jsdelivr" : ""}]`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

/* --- assemble: curated → tt (this batch, in wants order) → gf → builtins --- */
const curated = existing.games.filter((g) => !g.b && !g.id.startsWith("gf-") && !g.id.startsWith("tt-"));
const gf = existing.games.filter((g) => g.id.startsWith("gf-"));
const builtins = existing.games.filter((g) => g.b);
const games = [...curated, ...added, ...gf, ...builtins];

const counts = new Map();
for (const g of games) counts.set(g.c, (counts.get(g.c) || 0) + 1);
const categories = [...counts.entries()]
  .map(([slug, count]) => ({ slug, label: CAT_LABELS[slug] || slug, count }))
  .sort((a, b) => b.count - a.count);

const catalog = {
  generatedAt: new Date().toISOString(),
  source:
    "hand-curated popular games + tung tung reference picks (verified embeddable) + GameFlare most-played catalog (verified embeddable) + built-in",
  total: games.length,
  categories,
  games,
};

const out = path.join(dataDir, "games.json");
await writeFile(out, JSON.stringify(catalog, null, 1));

console.log(`\nWrote ${games.length} games (${curated.length} curated + ${added.length} tung-tung + ${gf.length} GameFlare + ${builtins.length} built-in) → ${out}`);
console.log(`size: ${(JSON.stringify(catalog).length / 1024).toFixed(0)} KB`);
console.log(`categories: ${categories.map((c) => `${c.slug}=${c.count}`).join(" ")}`);
if (skipped.length) console.log(`\nskipped (already have):\n  ${skipped.join("\n  ")}`);
if (notFound.length) console.log(`\nNOT FOUND in reference lists:\n  ${notFound.join("\n  ")}`);
if (failed.length) console.log(`\nFAILED verification:\n  ${failed.join("\n  ")}`);
