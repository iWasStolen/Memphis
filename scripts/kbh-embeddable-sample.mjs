#!/usr/bin/env node
/* Sample the KBH /embed endpoint's embeddable flag for the top N slugs */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);
import { readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const html = readFileSync("/tmp/kbh-best.html", "utf8");
const slugs = [...html.matchAll(/<a class="tile" href="https:\/\/kbhgames\.com\/game\/([^"]+)"/g)].map((m) => m[1]);

async function check(slug) {
  try {
    const { stdout } = await execFileP(
      "curl",
      ["-sL", "--max-time", "15", "-A", UA, `https://kbhgames.com/game/${slug}/embed`],
      { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    const m = /"embeddable":(true|false)/.exec(stdout);
    const src = /"src":"([^"]*)"/.exec(stdout)?.[1]?.replace(/\\\//g, "/");
    return { slug, embeddable: m?.[1] === "true", hasSrc: !!src };
  } catch (e) {
    return { slug, embeddable: null, err: e.message.slice(0, 60) };
  }
}

const out = [];
for (let i = 0; i < slugs.length; i += 10) {
  const batch = slugs.slice(i, i + 10);
  out.push(...(await Promise.all(batch.map(check))));
  process.stdout.write(`checked ${Math.min(i + 10, slugs.length)}/${slugs.length}\n`);
}
const yes = out.filter((o) => o.embeddable).length;
console.log(`\nembeddable TRUE: ${yes}/${out.length}`);
for (const o of out.filter((o) => o.embeddable)) console.log("  YES:", o.slug);
console.log(`embeddable FALSE: ${out.length - yes}/${out.length}`);
