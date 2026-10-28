/* ============================================================
   Memphis unBLACKed — Scramjet service worker
   Intercepts scramjet-encoded URLs (prefix /scramjet/) and
   serves them through the configured transport (epoxy or
   libcurl over the self-hosted wisp relay). Everything else
   passes straight through to the network.
   ============================================================ */

importScripts("/scram/scramjet.all.js");

/* ------------------------------------------------------------
   IndexedDB hardening (recurrence prevention)
   ScramjetServiceWorker opens its "$scramjet" database at
   version 1 WITHOUT an upgrade handler. If the worker wakes
   up before the page controller has ever initialized (e.g.
   the registration survived while site data was cleared),
   it creates an EMPTY database — and because the engine
   always re-opens version 1, its own upgrade never re-runs:
   every later transaction fails with "One of the specified
   object stores was not found".

   Patch: whenever the worker opens "$scramjet" at version 1,
   attach the full-schema upgrade ourselves. If the database
   already exists with the stores, upgradeneeded never fires
   and this is a no-op.
   ------------------------------------------------------------ */
(() => {
  const DB_NAME = "$scramjet";
  const STORES = [
    "config",
    "cookies",
    "redirectTrackers",
    "referrerPolicies",
    "publicSuffixList",
  ];
  const nativeOpen = indexedDB.open.bind(indexedDB);
  indexedDB.open = function (name, version) {
    const req = nativeOpen(name, version);
    if (name === DB_NAME && version === 1) {
      req.addEventListener("upgradeneeded", (event) => {
        const db = event.target.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
      });
    }
    return req;
  };
})();

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

/* URL shapes this worker must serve through the engine.
   Everything else goes straight to the network — without
   touching the engine's database first (a broken $scramjet
   DB must never take down the site's own assets). */
const SCRAM_PREFIX = "/scramjet/";
const WASM_PATH = "/scram/scramjet.wasm.wasm";

function shouldProxy(request) {
  try {
    const { pathname } = new URL(request.url);
    return pathname.startsWith(SCRAM_PREFIX) || pathname === WASM_PATH;
  } catch {
    return false;
  }
}

async function handleRequest(event) {
  if (!shouldProxy(event.request)) {
    return fetch(event.request);
  }
  try {
    await scramjet.loadConfig();
    if (scramjet.route(event)) {
      return await scramjet.fetch(event);
    }
  } catch (err) {
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Memphis proxy error</title>` +
        `<style>body{background:#000;color:#fff;font-family:ui-monospace,monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}` +
        `.box{max-width:480px;border:1px solid #222;border-radius:10px;padding:24px;background:#050505}` +
        `code{color:#999;font-size:11px;display:block;margin-top:12px;word-break:break-all}</style></head>` +
        `<body><div class="box"><h2 style="margin:0 0 8px">Proxy error</h2>` +
        `<p style="color:#aaa;font-size:13px">The Scramjet engine failed to serve this page. ` +
        `Reload the page — if it persists, switch the transport in Settings.</p>` +
        `<code>${String(err && err.message ? err.message : err).replace(/[<>&]/g, "")}</code>` +
        `</div></body></html>`,
      { status: 502, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  return fetch(event.request);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
