#!/usr/bin/env node
/* Sample embed pages to find what fraction host their game on CrazyGames
   (which refuses iframes → those catalog entries are dead). */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
const execFileP = promisify(execFile);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const listing = JSON.parse(readFileSync("/home/z/my-project/data/gameflare-listing.json", "utf8"));
const sample = listing.games.slice(0, 60); // top 60 by plays

async function check(g) {
  try {
    const { stdout } = await execFileP(
      "curl",
      ["-sL", "--compressed", "--max-time", "15", "-A", UA, `https://www.gameflare.com/embed/${g.slug}/`],
      { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    const iframe = /<iframe[^>]*src="([^"]+)"/.exec(stdout)?.[1] || "";
    return { slug: g.slug, plays: g.plays, host: new URL(iframe, "https://x.invalid").hostname || "(none)", iframe: iframe.slice(0, 70) };
  } catch (e) {
    return { slug: g.slug, plays: g.plays, host: "ERROR", iframe: e.message.slice(0, 40) };
  }
}

const out = [];
for (let i = 0; i < sample.length; i += 12) {
  out.push(...(await Promise.all(sample.slice(i, i + 12).map(check))));
}
const hosts = {};
for (const o of out) hosts[o.host] = (hosts[o.host] || 0) + 1;
console.log("inner-iframe host distribution (top 60 by plays):");
for (const [h, n] of Object.entries(hosts).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${h}`);
console.log("\ncrazygames-sourced:");
for (const o of out.filter((o) => o.host.includes("crazygames"))) console.log(`  ${o.slug} (${o.plays.toLocaleString()} plays)`);
