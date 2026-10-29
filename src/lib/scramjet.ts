"use client";

/* ============================================================
   Memphis unBLACKed — Scramjet v2 proxy client integration

   Engine: @mercuryworkshop/scramjet 2.0.67-alpha.2
     + scramjet-controller 0.0.14
     + scramjet-utils 0.0.3
   (new architecture: no bare-mux, no SharedWorker — the
   transport object lives in the page and the service worker
   routes requests to it over a MessageChannel RPC)

   Files (all same-origin, served statically):
     /scram2/scramjet.js          core (global $scramjet)
     /scram2/scramjet.wasm        rewriter wasm
     /controller/controller.api.js  page API (global $scramjetController)
     /controller/controller.sw.js   service worker runtime
     /controller/controller.inject.js  in-frame bootstrap
     /utils/scramjet-utils.js     plugins (UrlWatcherPlugin, …)

   Transports (switchable in Settings, live-swappable):
     - epoxy (default)  /epoxy/index.mjs  → new EpoxyTransport({ wisp })
     - libcurl          /libcurl/index.mjs → new LibcurlClient({ wisp })
   Both multiplex TCP through the self-hosted wisp relay on
   port 3001, exposed by the sandbox gateway as
   wss://<host>/wisp/?XTransformPort=3001

   The service worker at /sw.js intercepts /~/sj/<controller>/<frame>/
   URLs and serves the rewritten, same-origin content.

   Version-lock note: controller.api.js asserts the core runtime
   version at construction (2.0.67-alpha.2) — always vendor
   matching builds of scramjet + scramjet-controller together.
   ============================================================ */

import type { ProxyTransport } from "./types";
import { swUnavailableGuidance } from "./proxy-guidance";

/* ---------------- v2 runtime types ---------------- */

interface V2Frame {
  element: HTMLIFrameElement;
  go(url: string): void;
  reload(): void;
  back(): void;
  forward(): void;
}

interface V2Controller {
  wait(): Promise<void>;
  createFrame(element?: HTMLIFrameElement, options?: { plugins?: unknown[] }): V2Frame;
  setTransport(t: unknown): void;
  transport: unknown;
  frames: V2Frame[];
}

interface V2Globals {
  Controller: new (opts: {
    serviceworker: ServiceWorker;
    transport: unknown;
    config?: {
      prefix?: string;
      scramjetPath?: string;
      wasmPath?: string;
      injectPath?: string;
    };
  }) => V2Controller;
}

declare global {
  interface Window {
    $scramjet?: unknown;
    $scramjetController?: V2Globals;
    __memphisProxy?: ProxyHandle;
  }
}

export interface ProxyHandle {
  encodeUrl(url: string): string;
  controller: V2Controller;
}

export type ProxyState = "idle" | "loading" | "ready" | "error";
export type ProxyStage = "engine" | "transport";

/** Error carrying the boot stage it failed at (engine vs transport). */
export interface ProxyError extends Error {
  stage?: ProxyStage;
}

function stageError(stage: ProxyStage, message: string): ProxyError {
  const err = new Error(message) as ProxyError;
  err.stage = stage;
  return err;
}

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

/** Absolute URL for a same-origin path (module imports inside workers
    and dynamic imports resolve against the document — always be explicit). */
function abs(path: string): string {
  return new URL(path, location.href).href;
}

/** Dynamically (re)load a same-origin classic script. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`request for ${src} failed`));
    document.head.appendChild(s);
  });
}

/* ---------------- engine bundles ---------------- */

/* Load order is mandatory: core (scramjet.js) → page API
   (controller.api.js) → utils. The Controller constructor
   version-checks $scramjet, so the core must exist first.
   None of these are statically SSR'd — the v1 engine bundle
   deleted its own <script> tag and broke hydration; every
   engine file here is injected post-hydration instead. */

let bundlesPromise: Promise<void> | null = null;

function ensureEngineBundles(): Promise<void> {
  if (window.$scramjetController) return Promise.resolve();
  if (!bundlesPromise) {
    bundlesPromise = (async () => {
      await loadScript("/scram2/scramjet.js");
      await waitFor(() => !!window.$scramjet, 4000, "scramjet core");
      await loadScript("/controller/controller.api.js");
      await waitFor(() => !!window.$scramjetController, 4000, "scramjet controller API");
      await loadScript("/utils/scramjet-utils.js").catch(() => {});
    })().catch((err) => {
      /* allow Retry to re-inject — a failed <script> never re-runs */
      bundlesPromise = null;
      throw err;
    });
  }
  return bundlesPromise;
}

/* ---------------- transports ---------------- */

/* v2 transports are classes with a default export, loaded as
   ES modules and instantiated with the wisp URL. They run in
   the PAGE (no SharedWorker → Safari/iOS works natively). */

interface V2Transport {
  ready: boolean;
  init(): Promise<void>;
}

interface TransportModule {
  default: new (opts: { wisp: string }) => V2Transport;
}

export function transportModule(t: ProxyTransport): string {
  return t === "libcurl" ? "/libcurl/index.mjs" : "/epoxy/index.mjs";
}

/** Instantiate + eagerly init a transport (idempotent per instance). */
async function makeTransport(t: ProxyTransport): Promise<V2Transport> {
  /* both bundler directives needed: Next dev runs Turbopack, the
     production build may run webpack — neither may resolve these
     fully-dynamic engine-internal imports at build time */
  const mod = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */
    abs(transportModule(t))
  )) as TransportModule;
  const transport = new mod.default({ wisp: wispUrl() });
  if (!transport.ready) {
    await transport.init();
  }
  return transport;
}

/* ---------------- $controller IndexedDB self-heal ---------------- */

/* v2 stores cookies in `__scramjet_controller` (v1: $scramjet).
   Only the page-side api.js opens it (with a proper upgrade
   handler creating the "state" store), so the v1 SW race cannot
   recur — but a half-created database from an aborted first run
   would still break every boot. Delete it and let the engine
   recreate the full schema. */

const CONTROLLER_DB_NAME = "__scramjet_controller";
const CONTROLLER_DB_STORES = ["state"];

function deleteControllerDB(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(CONTROLLER_DB_NAME);
    req.onsuccess = req.onerror = () => resolve();
    /* v2 keeps no IDB connection in the SW — a blocked delete is
       practically impossible; resolve regardless after a wait */
    req.onblocked = () => setTimeout(resolve, 2000);
  });
}

export async function ensureControllerDB(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === CONTROLLER_DB_NAME)) return;
    }
    const info = await new Promise<{ version: number; stores: string[] } | null>((resolve) => {
      const req = indexedDB.open(CONTROLLER_DB_NAME); /* versionless — never upgrades */
      req.onsuccess = () => {
        const db = req.result;
        const info = { version: db.version, stores: [...db.objectStoreNames] };
        db.close();
        resolve(info);
      };
      req.onerror = () => resolve(null);
    });
    if (!info) return;
    const missing = CONTROLLER_DB_STORES.filter((s) => !info.stores.includes(s));
    if (info.version === 1 && missing.length === 0) return; /* healthy */
    await deleteControllerDB();
  } catch {
    /* inspection failed — let the engine surface a proper error */
  }
}

/* ---------------- diagnostics ---------------- */

/* proxyDiagnostics / diagnosticsLine / swUnavailableGuidance live in
   ./proxy-guidance (pure, node-testable) — re-exported here for the
   existing import sites (app-shell, browse-view). */
export { proxyDiagnostics, diagnosticsLine, swUnavailableGuidance } from "./proxy-guidance";
export type { ProxyDiagnostics, SwGuidance } from "./proxy-guidance";

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

/**
 * Boot the v2 engine with the given transport.
 * Order (per the official wiring):
 *   1. register /sw.js, wait for a controlling service worker
 *   2. load core → controller API → utils
 *   3. instantiate the transport (epoxy | libcurl) against wisp
 *   4. new Controller({ serviceworker, transport, config })
 *   5. await controller.wait()  (SW handshake + wasm + cookies)
 *   6. keepalive pings so the SW is not terminated mid-session
 */
export function bootProxy(transport: ProxyTransport = "epoxy"): Promise<ProxyHandle> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.__memphisProxy) return Promise.resolve(window.__memphisProxy);
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    if (!("serviceWorker" in navigator)) {
      /* the API is environment-gated (iOS in-app browsers, Safari
         Private Browsing, plain HTTP…) and the proxy can never start
         here — produce platform-correct recovery guidance */
      const guidance = swUnavailableGuidance();
      throw stageError("engine", `${guidance.cause} ${guidance.steps.join(" ")}`);
    }

    /* stage 1 — service worker must exist FIRST: the Controller
       constructor needs the controlling ServiceWorker handle for
       its MessageChannel handshake */
    const wasControlled = !!navigator.serviceWorker.controller;
    armControllerReload(wasControlled);
    let sw: ServiceWorker | null = null;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      sw = navigator.serviceWorker.controller ?? reg.active ?? null;
      if (!sw && !wasControlled) {
        /* fresh install — wait briefly for claim() to take effect */
        await waitFor(() => !!navigator.serviceWorker.controller, 5000, "service worker takeover").catch(() => {});
        sw = navigator.serviceWorker.controller;
      }
      if (!sw) {
        throw new Error("the service worker did not become active");
      }
    } catch (err) {
      const iosHint = /iP(?:hone|ad|od)/.test(navigator.userAgent)
        ? " On iPhone / iPad also make sure this is a normal window (not a Private one) " +
          "and that the link wasn't opened inside another app."
        : "";
      throw stageError(
        "engine",
        "The proxy service worker could not register. Make sure the page is " +
        "loaded over HTTPS (not an insecure iframe) and site data is allowed." +
        iosHint +
        ` (${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 2 — self-heal the controller cookie database */
    try {
      await ensureControllerDB();
    } catch (err) {
      throw stageError(
        "engine",
        "A leftover proxy database from an earlier visit could not be cleared. " +
        "Clear this site's data in your browser settings and try again. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 3 — engine bundles (core → api → utils) */
    try {
      await ensureEngineBundles();
    } catch (err) {
      throw stageError(
        "engine",
        "The Scramjet engine scripts did not load. This is usually an ad-blocker, " +
        "a school filter, or an old service worker from a previous visit. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 4 — transport (epoxy default / libcurl) over wisp */
    let transportObj: V2Transport;
    try {
      transportObj = await makeTransport(transport);
    } catch (err) {
      throw stageError(
        "transport",
        "The proxy transport could not start (epoxy/libcurl over the wisp relay). " +
        "The relay may be down or WebSockets may be blocked on this network. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 5 — Controller + wait() */
    let controller: V2Controller;
    try {
      const { Controller } = window.$scramjetController!;
      controller = new Controller({
        serviceworker: sw,
        transport: transportObj,
        config: {
          prefix: "/~/sj/",
          scramjetPath: "/scram2/scramjet.js",
          wasmPath: "/scram2/scramjet.wasm",
          injectPath: "/controller/controller.inject.js",
        },
      });
      await controller.wait();
    } catch (err) {
      throw stageError(
        "engine",
        "The Scramjet v2 engine could not initialize. " +
        "Private-browsing restrictions or blocked site data can cause this. " +
        `(${err instanceof Error ? err.message : String(err)})`
      );
    }

    /* stage 6 — keepalive: the SW routes every proxied request back to
       this page's controller; if the browser terminates the idle SW the
       proxy dies. A 15s ping keeps it warm (official wiring pattern). */
    setInterval(() => {
      navigator.serviceWorker.controller?.postMessage("keepalive");
    }, 15000);

    const handle: ProxyHandle = {
      /* v2 has no public encodeUrl — see proxiedHref() below for the
         detached-frame technique that keeps our href-based UI working */
      encodeUrl: (url: string) => proxiedHrefSync(controller, url),
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

/* ---------------- URL encoding (detached-frame technique) ---------------- */

/* v2 routes by per-frame prefix (/~/sj/<controller>/<frame>/…). A Frame's
   go(url) encodes the target and sets element.src. We keep one DETACHED
   encoder frame per encoded URL: the SW serves anything under its prefix
   (the element never has to be in the DOM — routing is URL-prefix based),
   so a pooled detached frame gives us a stable encoded href for our
   src-driven iframes while the engine handles the actual rewriting. */

const encoderFrames = new Map<string, V2Frame>();

function proxiedHrefSync(controller: V2Controller, url: string): string {
  const cached = encoderFrames.get(url);
  if (cached) return cached.element.src;
  const frame = controller.createFrame();
  frame.go(url);
  encoderFrames.set(url, frame);
  return frame.element.src;
}

/* ---------------- transport switching ---------------- */

/** Live-switch the transport (Settings → epoxy/libcurl). Takes effect
    for new requests — the official demo's setTransport semantics. */
export async function setProxyTransport(t: ProxyTransport): Promise<void> {
  const handle = window.__memphisProxy;
  if (!handle) return; /* not booted — bootProxy(transport) covers it */
  const transportObj = await makeTransport(t);
  handle.controller.setTransport(transportObj);
}

/** Forget the boot (used by the Retry button after a failure). */
export function resetProxy(): void {
  bootPromise = null;
  encoderFrames.clear();
  if (typeof window !== "undefined" && window.__memphisProxy) {
    delete window.__memphisProxy;
  }
}

/* ---------------- convenience ---------------- */

/** Turn a human URL/search into a proxied (scramjet-encoded) href. */
export async function proxiedHref(rawUrl: string): Promise<string> {
  const handle = window.__memphisProxy ?? (await bootProxy());
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
