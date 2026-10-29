/* ============================================================
   Memphis unBLACKed — SharedWorker→Worker wrapper (file-based)

   Loaded as a dedicated Worker by /sharedworker-shim.js for
   browsers without SharedWorker (Safari / iOS / Chrome-on-iOS).

   - Reads the real SharedWorker script path from ?target=…
   - importScripts() it (worker.js sets self.onconnect)
   - Translates a page message carrying a MessagePort into the
     `connect` handshake: in a dedicated WorkerGlobalScope
     `self.onconnect = fn` is a plain expando (dispatchEvent
     never fires it), so we call it directly; scripts that use
     addEventListener("connect") get the dispatched event too.
   ============================================================ */
var __memphisTarget = new URLSearchParams(self.location.search).get("target");
importScripts(__memphisTarget);
self.addEventListener("message", function (e) {
  if (e.data && e.data.__memphisShimConnect) {
    var ev = new MessageEvent("connect", { ports: [e.data.port] });
    if (typeof self.onconnect === "function") {
      /* baremux-style `self.onconnect = ...` */
      self.onconnect(ev);
    } else {
      /* addEventListener("connect", ...) style */
      self.dispatchEvent(ev);
    }
  }
});
