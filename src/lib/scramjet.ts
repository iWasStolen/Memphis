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

/* ---------------- transport ---------------- */

export function transportModule(t: ProxyTransport): string {
  return t === "libcurl" ? "/libcurl/index.mjs" : "/epoxy/index.mjs";
}

export async function setProxyTransport(t: ProxyTransport): Promise<void> {
  await waitFor(() => !!window.BareMux, 8000, "bare-mux client");
  const conn = new window.BareMux!.BareMuxConnection("/baremux/worker.js");
  const mod = transportModule(t);
  const args = t === "libcurl" ? [{ websocket: wispUrl() }] : [{ wisp: wispUrl() }];
  /* always re-apply: the wisp URL depends on location.host and the shared
     worker survives page reloads with stale args */
  await conn.setTransport(mod, args);
}

/* ---------------- boot ---------------- */

let bootPromise: Promise<ProxyHandle> | null = null;

export function bootProxy(): Promise<ProxyHandle> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.__memphisProxy) return Promise.resolve(window.__memphisProxy);
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    /* wait for the vendored scripts (loaded in layout) */
    await waitFor(() => !!window.$scramjetLoadController, 12000, "scramjet controller bundle");

    if (!("serviceWorker" in navigator)) throw new Error("Service workers unsupported");

    /* construct + init the controller FIRST — it creates the $scramjet
       IndexedDB with the full schema. The service worker must find that
       DB already present (official demo ordering). */
    const { ScramjetController } = window.$scramjetLoadController!();
    const controller = new ScramjetController({
      files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js",
      },
    });
    await controller.init();

    /* then make sure the service worker is controlling this page */
    if (!navigator.serviceWorker.controller) {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      /* clients.claim() in sw.js takes over this page without a reload */
    }

    const handle: ProxyHandle = {
      encodeUrl: (url: string) => controller.encodeUrl(url),
      controller,
    };
    window.__memphisProxy = handle;
    return handle;
  })();

  return bootPromise;
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
