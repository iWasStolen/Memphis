"use client";

/* ============================================================
   Memphis unBLACKed — Scramjet proxy client integration

   Engine: Scramjet 1.1.0 (Mercury Workshop) served from /scram/
   Transports (switchable in Settings):
     - epoxy   (default)  /epoxy/index.mjs   { wisp }
     - libcurl            /libcurl/index.mjs { websocket }
   Both multiplex TCP through the self-hosted wisp relay on
   port 3001, exposed by the sandbox gateway as
   wss://<host>/wisp/?XTransformPort=3001

   The service worker at /sw.js intercepts scramjet-encoded
   URLs and serves the rewritten, same-origin content.

   Browser support notes:
   - Safari/iOS: /sharedworker-shim.js polyfills SharedWorker
     with a dedicated Worker + synthetic `connect` event.
   - "Block all cookies" Chrome: in-memory localStorage shim
     (same preload script).
   - Transport URLs passed to setTransport() must be ABSOLUTE —
     bare-mux builds `import("<url>")` inside the (possibly
     blob-based) worker, where relative resolution fails.
   ============================================================ */

import type { ProxyTransport } from "./types";

interface ScramjetControllerI {
  init(): Promise<void> | void;
  encodeUrl(url: string): string;
}

interface ScramjetLoadController {
  ScramjetController: new (opts: {
    files: { wasm: string; all: string; sync: string };
  }) => ScramjetControllerI;
}

interface BareMuxConnectionI {
  getTransport(): Promise<string>;
  setTransport(url: string, args: unknown[]): Promise<void>;
}

declare global {
  interface Window {
    $scramjetLoadController?: () => ScramjetLoadController;
    BareMux?: {
      BareMuxConnection: new (workerUrl: string) => BareMuxConnectionI;
    };
    __memphisProxy?: ProxyHandle;
  }
}

export interface ProxyHandle {
  encodeUrl(url: string): string;
  controller: ScramjetControllerI;
}

export type ProxyState = "idle" | "loading" | "ready" | "error";
export type ProxyStage = "engine" | "transport";

/* ---------------- wisp URL ---------------- */

export function wispUrl(): string {
  const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
  /* the URL must end with "/" — the wisp server switches to wsproxy mode
     otherwise; the bare "&/" keeps the gateway port param intact */
  return `${proto}://${location.host}/wisp/?XTransformPort=3001&/`;
}

/* ---------------- helpers ---------------- */

function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (cond()) return resolve();
    const started = Date.now();
    const t = setInterval(() => {
      if (cond()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(t);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 100);
  });
}

/** Absolute URL for a same-origin path (workers may not resolve relative URLs). */
function abs(path: string): string {
  return new URL(path, location.href).href;
}

/** Dynamically (re)load a same-origin script — used when the static head tag
    was blocked by an extension or a flaky network. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`request for ${src} failed`));
    document.head.appendChild(s);
  });
}

/** Make sure the scramjet controller bundle is present; re-inject if the
    static tag failed (Retry path — a failed <script> never re-runs). */
let scramjetWaited = false;
async function ensureScramjetBundle(): Promise<void> {
  if (window.$scramjetLoadController) return;
  if (!scramjetWaited) {
    /* first attempt: give the static defer tag a fair chance
       (longer while the page is still loading) */
    scramjetWaited = true;
    const grace = document.readyState === "complete" ? 6000 : 12000;
    await waitFor(() => !!window.$scramjetLoadController, grace, "scramjet controller bundle").catch(() => {});
    if (window.$scramjetLoadController) return;
  }
  /* static tag failed or a later retry — load it ourselves */
  await loadScript("/scram/scramjet.all.js");
  await waitFor(() => !!window.$scramjetLoadController, 4000, "scramjet controller bundle");
}

/** Make sure the bare-mux client is present; re-inject if needed. */
let baremuxWaited = false;
async function ensureBareMux(): Promise<void> {
  if (window.BareMux) return;
  if (!baremuxWaited) {
    baremuxWaited = true;
    const grace = document.readyState === "complete" ? 3000 : 8000;
    await waitFor(() => !!window.BareMux, grace, "bare-mux client").catch(() => {});
    if (window.BareMux) return;
  }
  await loadScript("/baremux/index.js");
  await waitFor(() => !!window.BareMux, 4000, "bare-mux client");
}

/* ---------------- transport ---------------- */

/** single BareMuxConnection for the page — avoids piling up getPort listeners */
let muxConn: BareMuxConnectionI | null = null;

export function transportModule(t: ProxyTransport): string {
  return t === "libcurl" ? "/libcurl/index.mjs" : "/epoxy/index.mjs";
}

export async function setProxyTransport(t: ProxyTransport): Promise<void> {
  await ensureBareMux();
  if (!muxConn) muxConn = new window.BareMux!.BareMuxConnection(abs("/baremux/worker.js"));
  const mod = abs(transportModule(t));
  const args = t === "libcurl" ? [{ websocket: wispUrl() }] : [{ wisp: wispUrl() }];
  /* always re-apply: the wisp URL depends on location.host and the worker
     may survive page reloads with stale args */
  await muxConn.setTransport(mod, args);
}

/** Forget the transport connection (used when retrying after a failure). */
export function resetTransport(): void {
  muxConn = null;
}

/* ---------------- $scramjet IndexedDB self-heal ---------------- */

/* The vendored Scramjet opens its database at version 1 and only creates
   object stores inside `onupgradeneeded`. A database that already exists at
   version 1 with a DIFFERENT store set (left behind by an earlier build, or
   created empty by the service worker winning a first-visit race) therefore
   never gets repaired — every db.transaction(...) then throws
   "Failed to execute 'transaction' on 'IDBDatabase': One of the specified
   object stores was not found."

   Repair = delete the broken database; the controller recreates it with the
   full schema moments later. (Bumping the version instead would break the
   engine, which insists on opening version 1.) */

const SCRAMJET_DB_NAME = "$scramjet";
const SCRAMJET_REQUIRED_STORES = [
  "config",
  "cookies",
  "redirectTrackers",
  "referrerPolicies",
  "publicSuffixList",
];
const IDB_REPAIR_RELOAD_FLAG = "memphis-idb-repair";

interface DBInfo {
  version: number;
  stores: string[];
}

/** Inspect the existing $scramjet database without changing its version. */
function inspectScramjetDB(): Promise<DBInfo | null> {
  return new Promise((resolve) => {
    /* open WITHOUT a version: never triggers our own upgrade, never blocks */
    const req = indexedDB.open(SCRAMJET_DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      const info: DBInfo = { version: db.version, stores: [...db.objectStoreNames] };
      db.close(); /* release before any later deleteDatabase */
      resolve(info);
    };
    req.onerror = () => resolve(null);
  });
}

/** Delete $scramjet, recovering from a stale service worker holding it
    open (deletion is "blocked" until every connection closes). */
function deleteScramjetDB(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const req = indexedDB.deleteDatabase(SCRAMJET_DB_NAME);
    req.onsuccess = finish;
    req.onerror = finish;
    req.onblocked = async () => {
      /* usually the old service worker — drop its registration so the
         browser terminates it and releases the connection */
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.unregister();
      } catch {
        /* registration lookup blocked — the wait below is the fallback */
      }
      /* give the idle worker time to die, then resolve so boot continues
         (a still-queued delete completes on its own once it lets go) */
      setTimeout(finish, 8000);
      /* one-time reload: the next boot retries the deletion with the
         service worker out of the way (guarded → cannot loop) */
      try {
        if (!sessionStorage.getItem(IDB_REPAIR_RELOAD_FLAG)) {
          sessionStorage.setItem(IDB_REPAIR_RELOAD_FLAG, "1");
          setTimeout(() => location.reload(), 200);
        }
      } catch {
        /* storage blocked — in-page wait is the only recovery */
      }
    };
  });
}

/** Make sure the $scramjet database is either absent or healthy (version 1
    with every required store) before the engine opens it. */
export async function ensureScramjetDB(): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  /* fast path — nothing to heal if the database doesn't exist yet */
  try {
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === SCRAMJET_DB_NAME)) return;
    }
  } catch {
    /* databases() unsupported or blocked — fall through to inspection */
  }

  const info = await inspectScramjetDB();
  if (!info) return; /* unreadable — let the engine surface a proper error */

  const missing = SCRAMJET_REQUIRED_STORES.filter((s) => !info.stores.includes(s));
  if (info.version === 1 && missing.length === 0) return; /* healthy */

  /* broken schema (or unexpected version) — delete and let the controller
     recreate it with the complete store set */
  await deleteScramjetDB();
}

/* ---------------- diagnostics ---------------- */

export interface ProxyDiagnostics {
  ua: string;
  sharedWorker: boolean;
  serviceWorker: boolean;
  controlled: boolean;
  isolated: boolean;
  scramjetGlobal: boolean;
  bareMuxGlobal: boolean;
  localStorage: boolean;
}

/** Environment snapshot rendered on the proxy error screen. */
export function proxyDiagnostics(): ProxyDiagnostics {
  if (typeof window === "undefined") {
    return {
      ua: "", sharedWorker: false, serviceWorker: false, controlled: false,
      isolated: false, scramjetGlobal: false, bareMuxGlobal: false, localStorage: false,
    };
  }
  let storageOk = false;
  try {
    window.localStorage.getItem("__probe__");
    storageOk = true;
  } catch { /* blocked */ }
  return {
    ua: navigator.userAgent,
    sharedWorker: typeof SharedWorker !== "undefined",
    serviceWorker: "serviceWorker" in navigator,
    controlled: !!navigator.serviceWorker?.controller,
    isolated: !!window.crossOriginIsolated,
    scramjetGlobal: !!window.$scramjetLoadController,
    bareMuxGlobal: !!window.BareMux,
    localStorage: storageOk,
  };
}

/** One-line summary for the error screen / bug reports. */
export function diagnosticsLine(d: ProxyDiagnostics): string {
  const browser = /Edg\//.test(d.ua)
    ? "Edge"
    : /OPR\//.test(d.ua)
      ? "Opera"
      : /Chrome\//.test(d.ua) && !/Chromium|Edg|OPR/.test(d.ua)
        ? "Chrome"
        : /Firefox\//.test(d.ua)
          ? "Firefox"
          : /Safari\//.test(d.ua)
            ? "Safari"
            : "Unknown";
  return [
    browser,
    `SW:${d.serviceWorker ? "y" : "n"}`,
    `ctl:${d.controlled ? "y" : "n"}`,
    `SharedWorker:${d.sharedWorker ? "y" : "n"}`,
    `storage:${d.localStorage ? "y" : "n"}`,
    `engine:${d.scramjetGlobal ? "y" : "n"}`,
  ].join(" · ");
}

/* ---------------- boot ---------------- */

let bootPromise: Promise<ProxyHandle> | null = null;
const SW_RELOAD_FLAG = "memphis-sw-reloaded";

/** Install the controllerchange → reload-once recovery (stale SW takeover). */
let swReloaded = false;
function armControllerReload(wasControlled: boolean) {
  if (!wasControlled) return; /* fresh install: nothing stale to recover from */
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    try {
      if (sessionStorage.getItem(SW_RELOAD_FLAG)) return;
      sessionStorage.setItem(SW_RELOAD_FLAG, "1");
    } catch { /* storage blocked — the module flag above guards the loop */ }
    location.reload();
  });
}

export function bootProxy(): Promise<ProxyHandle> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.__memphisProxy) return Promise.resolve(window.__memphisProxy);
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    /* stage 1 — wait for the vendored bundles; re-inject if the static tag
       was blocked (ad-blocker, filter, flaky network) so Retry can recover */
    try {
      await ensureScramjetBundle();
    } catch (err) {
      throw new Error(
        "The Scramjet engine scripts did not load. This is usually an ad-blocker, " +
        "a school filter, or an old service worker from a previous visit. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    if (!("serviceWorker" in navigator)) {
      throw new Error(
        "This browser does not support service workers, which the proxy needs. " +
        "Try Chrome, Edge or Firefox over HTTPS."
      );
    }

    /* stage 1.5 — self-heal the engine's IndexedDB. A $scramjet database
       left at version 1 with missing object stores (earlier build or an
       SW first-visit race) can never be upgraded by the engine itself;
       delete it so the controller recreates the full schema */
    try {
      await ensureScramjetDB();
    } catch (err) {
      throw new Error(
        "A leftover proxy database from an earlier visit could not be cleared. " +
        "Clear this site's data in your browser settings and try again. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 2 — construct + init the controller FIRST (official demo order):
       it creates the $scramjet IndexedDB with the full schema so the
       service worker finds a complete database */
    let controller: ScramjetControllerI;
    try {
      const { ScramjetController } = window.$scramjetLoadController!();
      controller = new ScramjetController({
        files: {
          wasm: "/scram/scramjet.wasm.wasm",
          all: "/scram/scramjet.all.js",
          sync: "/scram/scramjet.sync.js",
        },
      });
      await controller.init();
    } catch (err) {
      throw new Error(
        "The Scramjet engine could not initialize its local database. " +
        "Private-browsing restrictions or blocked site data can cause this. " +
        "Clearing this site's data in your browser settings usually fixes it. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 3 — service worker. ALWAYS register: the call is idempotent and
       triggers the update check that replaces any stale worker from an
       earlier deployment; skipWaiting + clients.claim take over the page */
    const wasControlled = !!navigator.serviceWorker.controller;
    armControllerReload(wasControlled);
    try {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        /* fresh install — wait briefly for claim() to take effect */
        await waitFor(
          () => !!navigator.serviceWorker.controller,
          5000,
          "service worker takeover"
        ).catch(() => {});
      }
    } catch (err) {
      throw new Error(
        "The proxy service worker could not register. Make sure the page is " +
        "loaded over HTTPS (not an insecure iframe) and site data is allowed. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    const handle: ProxyHandle = {
      encodeUrl: (url: string) => controller.encodeUrl(url),
      controller,
    };
    window.__memphisProxy = handle;
    return handle;
  })().catch((err) => {
    /* do not cache failures — the Retry button re-runs the whole boot */
    bootPromise = null;
    throw err;
  });

  return bootPromise;
}

/** Full reset — used by the Retry button after an error. */
export function resetProxy(): void {
  bootPromise = null;
  if (typeof window !== "undefined" && window.__memphisProxy) {
    delete window.__memphisProxy;
  }
  resetTransport();
}

/* ---------------- convenience ---------------- */

/** Turn a human URL/search into a proxied (scramjet-encoded) href. */
export async function proxiedHref(rawUrl: string): Promise<string> {
  const handle = await bootProxy();
  return handle.encodeUrl(rawUrl);
}

/** Check the wisp relay health (used by the status pill). */
export async function wispHealth(): Promise<boolean> {
  try {
    const res = await fetch("/wisp/?XTransformPort=3001", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
