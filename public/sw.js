/* ============================================================
   Memphis unBLACKed — Scramjet v2 service worker

   The v2 controller.sw.js registers per-controller routes via
   the $controller$init MessageChannel handshake (each page that
   boots a Controller claims a /~/sj/<id>/… prefix). Our wrapper
   only has to ask it whether a request belongs to a registered
   controller and, if so, let it route.

   Everything else (the app's own assets, the engine bundles,
   the wisp relay upgrade) passes straight to the network —
   a broken or missing engine can never take down the site.
   ============================================================ */

importScripts("/controller/controller.sw.js");

self.addEventListener("fetch", (event) => {
  try {
    if ($scramjetController.shouldRoute(event)) {
      event.respondWith($scramjetController.route(event));
    }
  } catch {
    /* routing table not ready — serve normally */
  }
});
