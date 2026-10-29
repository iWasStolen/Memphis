/* ============================================================
   Memphis proxy engine — server-side URL relay with rewriting
   Security: SSRF protection, redirect validation, size/time
   limits, rate limiting, cookie isolation.
   ============================================================ */

import { lookup } from "dns/promises";
import { isIP } from "net";

const PROXY_PATH = "/api/proxy";
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 30 * 1024 * 1024;
const JAR_TTL_MS = 30 * 60 * 1000;
const MAX_JARS = 300;

/* ---------------- IP / host security ---------------- */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + parseInt(o, 10), 0) >>> 0;
}

const BLOCKED_V4: [number, number][] = [
  ["0.0.0.0", "255.0.0.0"],
  ["10.0.0.0", "255.0.0.0"],
  ["100.64.0.0", "255.192.0.0"],
  ["127.0.0.0", "255.0.0.0"],
  ["169.254.0.0", "255.255.0.0"],
  ["172.16.0.0", "255.240.0.0"],
  ["192.0.0.0", "255.255.255.0"],
  ["192.168.0.0", "255.255.0.0"],
  ["198.18.0.0", "255.254.0.0"],
  ["224.0.0.0", "240.0.0.0"],
  ["240.0.0.0", "240.0.0.0"],
].map(([net, mask]) => [ipv4ToInt(net), ipv4ToInt(mask)] as [number, number]);

export function ipBlocked(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4.some(([net, mask]) => (n & mask) === (net & mask) >>> 0 || ((net & mask) >>> 0) === (n & mask));
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    const clean = low.replace(/^\[|\]$/g, "");
    if (clean === "::" || clean === "::1") return true;
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true; // unique local
    if (/^fe[89ab]/.test(clean)) return true; // link local
    if (clean.startsWith("ff")) return true; // multicast
    if (clean.startsWith("::ffff:")) {
      const mapped = clean.slice(7);
      if (isIP(mapped) === 4) return ipBlocked(mapped);
      return true;
    }
    return false;
  }
  return true; // not an IP → treat as blocked for direct literals
}

const BLOCKED_HOSTNAMES =
  /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|.*\.corp|metadata\.google\.internal)$/i;

export async function assertPublicHost(hostname: string): Promise<void> {
  if (BLOCKED_HOSTNAMES.test(hostname))
    throw new ProxyError("This destination is not allowed.", 403);
  const ipVer = isIP(hostname);
  if (ipVer) {
    if (ipBlocked(hostname))
      throw new ProxyError("Private and local network addresses are blocked.", 403);
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new ProxyError(`Could not resolve ${hostname}.`, 502);
  }
  if (!addrs.length)
    throw new ProxyError(`Could not resolve ${hostname}.`, 502);
  for (const a of addrs) {
    if (ipBlocked(a.address))
      throw new ProxyError(
        "The destination resolves to a blocked private address.",
        403
      );
  }
}

export class ProxyError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/* ---------------- Cookie jar ---------------- */

interface JarEntry {
  cookies: Map<string, string>; // "domain|path|name" -> "name=value"
  lastUsed: number;
}
const jars = new Map<string, JarEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, j] of jars) if (now - j.lastUsed > JAR_TTL_MS) jars.delete(k);
}, 60_000).unref?.();

function jarFor(id: string): JarEntry {
  let j = jars.get(id);
  if (!j) {
    if (jars.size >= MAX_JARS) {
      const oldest = [...jars.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (oldest) jars.delete(oldest[0]);
    }
    j = { cookies: new Map(), lastUsed: Date.now() };
    jars.set(id, j);
  }
  j.lastUsed = Date.now();
  return j;
}

function domainMatches(host: string, cookieDomain: string): boolean {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  return host === d || host.endsWith("." + d);
}

function cookieHeader(jar: JarEntry, url: URL): string | null {
  const parts: string[] = [];
  for (const [, value] of jar.cookies) {
    const [domain] = value.split("\u0001");
    if (domainMatches(url.hostname, domain)) parts.push(value.split("\u0001")[2]);
  }
  return parts.length ? parts.join("; ") : null;
}

function storeCookies(jar: JarEntry, url: URL, setCookies: string[]) {
  for (const sc of setCookies) {
    const [pair, ...attrs] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    let domain = url.hostname;
    let path = "/";
    let maxAge = -1;
    for (const a of attrs) {
      const [k, v = ""] = a.split("=");
      const key = k.trim().toLowerCase();
      if (key === "domain") domain = v.trim() || domain;
      else if (key === "path") path = v.trim() || path;
      else if (key === "max-age") maxAge = parseInt(v, 10);
    }
    if (maxAge === 0) {
      jar.cookies.delete(`${domain}|${path}|${name}`);
      continue;
    }
    if (jar.cookies.size > 80) continue; // per-jar cap
    jar.cookies.set(`${domain}|${path}|${name}`, `${domain}\u0001${path}\u0001${name}=${value}`);
  }
}

/* ---------------- URL handling ---------------- */

export function parseTarget(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ProxyError("Invalid URL.", 400);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new ProxyError("Only http and https are supported.", 400);
  return u;
}

export function proxiedUrl(target: string, jarId: string): string {
  return `${PROXY_PATH}?u=${encodeURIComponent(target)}&s=${encodeURIComponent(jarId)}`;
}

/* ---------------- Rewriting ---------------- */

const SKIP_URL = /^(#|javascript:|data:|mailto:|tel:|blob:|about:|sms:|ftp:)/i;

function rewriteAttrUrl(val: string, base: string, jarId: string): string {
  const v = val.trim();
  if (!v || SKIP_URL.test(v)) return v;
  try {
    const abs = new URL(v, base);
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return v;
    return proxiedUrl(abs.href, jarId);
  } catch {
    return v;
  }
}

function rewriteSrcset(val: string, base: string, jarId: string): string {
  return val
    .split(",")
    .map((part) => {
      const t = part.trim().split(/\s+/);
      if (t[0]) t[0] = rewriteAttrUrl(t[0], base, jarId);
      return t.join(" ");
    })
    .join(", ");
}

function rewriteCssUrls(css: string, base: string, jarId: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => {
    if (SKIP_URL.test(u)) return m;
    return `url(${q}${rewriteAttrUrl(u, base, jarId)}${q})`;
  });
}

function runtimeScript(rawUrl: string, jarId: string): string {
  return `<script>(function(){
var RAW=${JSON.stringify(rawUrl)},SESS=${JSON.stringify(jarId)};
function px(u){try{return "/api/proxy?u="+encodeURIComponent(u)+"&s="+SESS;}catch(e){return u;}}
function abs(u){try{return new URL(u,RAW).href;}catch(e){return u;}}
function route(u){if(!u)return u;if(typeof u!=="string")return u;
if(u.indexOf("/api/proxy?")===0)return u;
if(/^(data:|blob:|about:|javascript:)/i.test(u))return u;
try{var a=new URL(u,RAW);if(a.protocol!=="http:"&&a.protocol!=="https:")return u;return px(a.href);}catch(e){return u;}}
window.__MEMPHIS__={raw:RAW,px:px,route:route};
function shim(){var m={};return{getItem:function(k){return k in m?m[k]:null;},setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};},key:function(i){return Object.keys(m)[i]||null;},get length(){return Object.keys(m).length;}};}
try{window.localStorage.getItem("_t");}catch(e){try{Object.defineProperty(window,"localStorage",{value:shim(),configurable:true});}catch(e2){}}
try{window.sessionStorage.getItem("_t");}catch(e){try{Object.defineProperty(window,"sessionStorage",{value:shim(),configurable:true});}catch(e2){}}
try{document.cookie;}catch(e){try{Object.defineProperty(document,"cookie",{get:function(){return "";},set:function(){},configurable:true});}catch(e2){}}
if(navigator.serviceWorker){try{navigator.serviceWorker.register=function(){return Promise.reject(new Error("disabled by memphis proxy"));};}catch(e){}}
var of=window.fetch;
window.fetch=function(input,init){try{
if(typeof input==="string"){input=route(input);}
else if(input&&input.url){input=new Request(route(input.url),input);}}catch(e){}
return of.call(window,input,init);};
var ox=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);try{a[1]=route(String(u));}catch(e){}return ox.apply(this,a);};
var ow=window.open;
window.open=function(u,n,f){try{if(u)u=route(String(u));}catch(e){}return ow.call(window,u,n,f);};
["pushState","replaceState"].forEach(function(k){var o=history[k];history[k]=function(s,t,u){try{if(u)u=px(abs(String(u)));}catch(e){}return o.call(history,s,t,u);};});
function report(){try{parent.postMessage({__memphis:true,type:"location",title:document.title,url:RAW,jar:SESS},"*");}catch(e){}}
if(document.readyState!=="loading")report();else document.addEventListener("DOMContentLoaded",report);
window.addEventListener("load",report);
setInterval(report,2000);
})();</script>`;
}

export function rewriteHtml(html: string, base: string, jarId: string): string {
  let out = html;
  /* drop base tags + CSP/refresh meta + integrity/nonce */
  out = out.replace(/<base\b[^>]*>/gi, "");
  out = out.replace(
    /<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi,
    ""
  );
  out = out.replace(/\sintegrity=(["'])[^"']*\1/gi, "");
  out = out.replace(/\snonce=(["'])[^"']*\1/gi, "");
  /* meta refresh */
  out = out.replace(
    /(<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?)([^"'>]+)/gi,
    (m, pre, content) => {
      const m2 = content.match(/^(\d+)\s*;?\s*url=(.*)$/i);
      if (!m2) return m;
      return pre + `${m2[1]};url=${rewriteAttrUrl(m2[2].replace(/["']/g, ""), base, jarId)}`;
    }
  );
  /* srcset */
  out = out.replace(/\ssrcset=(["'])(.*?)\1/gi, (m, q, v) => ` srcset=${q}${rewriteSrcset(v, base, jarId)}${q}`);
  /* plain url-bearing attributes */
  out = out.replace(
    /\s(href|src|action|poster|data-src|data-href)=(["'])(.*?)\2/gi,
    (m, attr, q, v) => ` ${attr}=${q}${rewriteAttrUrl(v, base, jarId)}${q}`
  );
  /* inline style url() */
  out = out.replace(
    /\sstyle=(["'])(.*?)\1/gi,
    (m, q, v) => ` style=${q}${rewriteCssUrls(v, base, jarId)}${q}`
  );
  /* <style> blocks */
  out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, css) => `<style${attrs}>${rewriteCssUrls(css, base, jarId)}</style>`);
  /* inject runtime first in head, or before first script, or at start */
  const rt = runtimeScript(base, jarId);
  if (/<head[^>]*>/i.test(out))
    out = out.replace(/<head[^>]*>/i, (m) => m + rt);
  else if (/<html[^>]*>/i.test(out))
    out = out.replace(/<html[^>]*>/i, (m) => m + rt);
  else out = rt + out;
  return out;
}

/* ---------------- Main fetch + relay ---------------- */

const HOP_HEADERS = [
  "accept", "accept-language", "user-agent", "referer", "range",
  "content-type", "origin", "if-none-match", "if-modified-since",
];

export interface ProxyResult {
  response: Response;
  finalUrl: string;
  contentType: string;
}

export async function relay(
  rawUrl: string,
  jarId: string,
  req: Request
): Promise<ProxyResult> {
  let url = parseTarget(rawUrl);
  let method = req.method === "HEAD" ? "GET" : req.method;
  if (!["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"].includes(method))
    throw new ProxyError("Method not supported.", 405);

  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await req.arrayBuffer();

  let finalUrl = url.href;
  let res: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);
    const jar = jarFor(jarId);
    const headers: Record<string, string> = {};
    for (const h of HOP_HEADERS) {
      if (h === "origin") continue; /* never leak the proxy origin */
      if (h === "referer") {
        /* only forward same-site referers (sub-resources), else drop */
        const ref = req.headers.get(h);
        if (ref) {
          try {
            const refHost = new URL(ref).hostname;
            if (refHost === url.hostname) headers[h] = ref;
          } catch {
            /* invalid referer — drop */
          }
        }
        continue;
      }
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    headers["user-agent"] =
      req.headers.get("user-agent") ??
      "Mozilla/5.0 (compatible; MemphisProxy/1.0)";
    headers["accept-encoding"] = "identity";
    const cookie = cookieHeader(jar, url);
    if (cookie) headers["cookie"] = cookie;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      res = await fetch(url.href, {
        method,
        headers,
        body: body && body.byteLength ? body : undefined,
        redirect: "manual",
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error && e.name === "AbortError"
        ? `Timed out after ${TIMEOUT_MS / 1000}s.`
        : `Could not reach ${url.hostname}.`;
      throw new ProxyError(msg, 504);
    }
    clearTimeout(timer);

    /* store cookies from target into the jar (never forwarded to client) */
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    if (setCookies.length) storeCookies(jar, url, setCookies);

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) break;
      let next: URL;
      try {
        next = new URL(loc, url);
      } catch {
        throw new ProxyError("Redirect to an invalid URL.", 502);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:")
        throw new ProxyError("Redirect to a non-http protocol blocked.", 403);
      if (hop === MAX_REDIRECTS)
        throw new ProxyError("Too many redirects.", 508);
      url = next;
      finalUrl = url.href;
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST"))
        method = "GET";
      continue;
    }
    break;
  }

  if (!res) throw new ProxyError("No response from destination.", 502);

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  finalUrl = url.href;

  const outHeaders = new Headers();
  outHeaders.set("content-type", contentType);
  if (contentType.startsWith("text/html"))
    outHeaders.set("cache-control", "no-store");
  const cd = res.headers.get("content-disposition");
  if (cd) outHeaders.set("content-disposition", cd);
  const cl = res.headers.get("content-length");
  const ar = res.headers.get("accept-ranges");
  if (ar) outHeaders.set("accept-ranges", ar);
  outHeaders.set("x-memphis-final-url", encodeURIComponent(finalUrl));

  /* HTML / CSS get rewritten (buffered, size-capped) */
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const buf = await readCapped(res);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const html = decoder.decode(buf);
    const rewritten = rewriteHtml(html, finalUrl, jarId);
    outHeaders.set("content-length", String(new TextEncoder().encode(rewritten).byteLength));
    return {
      response: new Response(rewritten, { status: res.status, headers: outHeaders }),
      finalUrl,
      contentType,
    };
  }
  if (contentType.includes("text/css")) {
    const buf = await readCapped(res);
    const css = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const rewritten = rewriteCssUrls(css, finalUrl, jarId);
    return {
      response: new Response(rewritten, { status: res.status, headers: outHeaders }),
      finalUrl,
      contentType,
    };
  }

  /* everything else streams through (with size cap via content-length check) */
  if (cl && parseInt(cl, 10) > MAX_BYTES)
    throw new ProxyError("Response too large.", 413);
  return {
    response: new Response(res.body, {
      status: res.status,
      headers: outHeaders,
    }),
    finalUrl,
    contentType,
  };
}

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      reader.cancel().catch(() => {});
      throw new ProxyError("Response too large.", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/* ---------------- Error page ---------------- */

export function errorPage(message: string, status: number, target?: string): Response {
  const safeTarget = target ? target.replace(/[<>"']/g, "") : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Memphis proxy — error</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#fff;font-family:ui-monospace,monospace}
  body{display:flex;align-items:center;justify-content:center;padding:24px}
  .box{max-width:520px;width:100%;border:1px solid #1f1f1f;border-radius:10px;background:#050505;padding:28px}
  .code{font-size:44px;font-weight:700;letter-spacing:-1px}
  .msg{color:#9a9a9a;font-size:14px;margin:10px 0 18px;line-height:1.5}
  .url{color:#666;font-size:11px;word-break:break-all;margin-bottom:18px}
  a{color:#fff}
  .btn{display:inline-block;border:1px solid #2a2a2a;border-radius:6px;padding:8px 14px;color:#fff;text-decoration:none;font-size:13px;margin-right:8px}
  .btn:hover{background:#101010}
</style></head><body><div class="box">
  <div class="code">${status}</div>
  <div class="msg">${message}</div>
  ${safeTarget ? `<div class="url">${safeTarget}</div>` : ""}
  <a class="btn" href="javascript:history.back()">Go back</a>
  <a class="btn" href="/api/proxy?u=${encodeURIComponent("https://example.com")}">Try example.com</a>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
