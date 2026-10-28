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
