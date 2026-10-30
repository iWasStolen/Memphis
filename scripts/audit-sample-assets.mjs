/**
 * audit-sample-assets.mjs — fetch sampled game pages, extract the external
 * assets they load (scripts / build files), and report which hosts 403/404.
 * Used to quantify how many imported games have dead payload hosts.
 */
import { readFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const sample = JSON.parse(await readFile("/tmp/sample-ref.json", "utf8"));

const hostStats = {}; // host → {ok, dead, urls:Set sample}
const gameDeps = [];

for (const g of sample) {
  try {
    const res = await fetch(g.u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    // extract script srcs, link hrefs, and jsdelivr build refs in inline JS
    const urls = new Set();
    for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) urls.add(m[1]);
    for (const m of html.matchAll(/["'](https?:\/\/[^"']*(?:Build|build|\.wasm|\.data|loader\.js|\.unityweb)[^"']*)["']/g)) urls.add(m[1]);
    const abs = [...urls].filter((u) => /^https?:\/\//.test(u) && !/googletagmanager|google-analytics|gtag/.test(u)).slice(0, 6);
    const deps = [];
    for (const u of abs) {
      const host = new URL(u).host;
      hostStats[host] ??= { ok: 0, dead: 0 };
      try {
        const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
        if (r.ok) { hostStats[host].ok++; deps.push({ u, s: r.status }); }
        else { hostStats[host].dead++; deps.push({ u, s: r.status }); }
      } catch (e) {
        hostStats[host].dead++; deps.push({ u, s: String(e).slice(0, 30) });
      }
    }
    gameDeps.push({ id: g.id, t: g.t, deps });
    process.stdout.write(".");
  } catch (e) {
    gameDeps.push({ id: g.id, t: g.t, error: String(e).slice(0, 50) });
    process.stdout.write("x");
  }
}
console.log("\n");
console.log("host stats:");
for (const [h, s] of Object.entries(hostStats).sort((a, b) => b[1].dead - a[1].dead)) {
  console.log(`  ${h}: ok=${s.ok} dead=${s.dead}`);
}
const broken = gameDeps.filter((g) => g.deps?.some((d) => d.s >= 400 || typeof d.s === "string"));
console.log(`\ngames with dead deps: ${broken.length}/${sample.length}`);
for (const g of broken.slice(0, 15)) console.log(`  ✗ ${g.t}: ${g.deps.filter((d) => d.s >= 400 || typeof d.s === "string").map((d) => `${new URL(d.u).host}→${d.s}`).join(", ")}`);
