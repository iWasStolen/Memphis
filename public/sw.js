/* ============================================================
   Memphis unBLACKed — Scramjet service worker
   Intercepts scramjet-encoded URLs (prefix /scramjet/) and
   serves them through the configured transport (epoxy or
   libcurl over the self-hosted wisp relay). Everything else
   passes straight through to the network.
   ============================================================ */

importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

async function handleRequest(event) {
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
        `Check the transport setting in Settings, then reload.</p>` +
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
