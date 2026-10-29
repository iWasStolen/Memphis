/* ============================================================
   Memphis unBLACKed — browser compatibility shim
   MUST load (blocking, non-defer) BEFORE /baremux/index.js.

   1. localStorage guard
      Chrome with "Block all cookies" (common on managed
      Chromebooks) makes the `window.localStorage` property
      access itself throw, which crashes bare-mux at module
      load ("Timed out waiting for bare-mux client") and
      breaks settings persistence. Install an in-memory
      stand-in so the page keeps working for the session.

   2. SharedWorker polyfill
      Safari / iOS / Chrome-on-iOS have no SharedWorker
      support, so bare-mux cannot create the transport worker
      and the proxy dies with "Unable to get a channel to the
      SharedWorker". We polyfill it with a dedicated Worker
      that loads /sharedworker-wrapper.js?target=<real worker>:
      the wrapper importScripts() the real script and feeds it
      MessagePorts through a synthetic `connect` handshake.

      Real SharedWorker semantics are preserved:
      - `new SharedWorker(url, name)` twice with the same
        (url, name) connects two ports to ONE worker — we
        cache the underlying Worker per key, so bare-mux's
        ping/retry/getPort loops never spawn unbounded
        workers.
      - `.port` is a real MessagePort, transferable to the
        service worker.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- 1. localStorage guard ---------------- */
  try {
    window.localStorage.getItem("__memphis_probe__");
  } catch {
    var mem = new Map();
    var lsShim = {
      getItem: function (k) { return mem.has(String(k)) ? mem.get(String(k)) : null; },
      setItem: function (k, v) { mem.set(String(k), String(v)); },
      removeItem: function (k) { mem.delete(String(k)); },
      clear: function () { mem.clear(); },
      key: function (i) { return Array.from(mem.keys())[i] ?? null; },
      get length() { return mem.size; },
    };
    try {
      Object.defineProperty(window, "localStorage", {
        get: function () { return lsShim; },
        configurable: true,
      });
      console.warn("memphis: localStorage blocked — using in-memory fallback for this session");
    } catch (e) {
      /* unredefinable in this engine; bare-mux may fail later */
    }
  }

  /* ---------------- 2. SharedWorker polyfill ---------------- */
  if (typeof SharedWorker !== "undefined") return; /* real support — nothing to do */

  var WRAPPER = "/sharedworker-wrapper.js";
  /* key → { worker } — one underlying process per (url, name), like the real thing */
  var pool = new Map();

  function ShimSharedWorker(url, nameOrOptions) {
    var abs = new URL(url, location.href).href;
    var name = typeof nameOrOptions === "string"
      ? nameOrOptions
      : (nameOrOptions && nameOrOptions.name) || "";
    var key = abs + "\u0000" + name;

    var entry = pool.get(key);
    if (!entry) {
      var workerUrl =
        WRAPPER + "?target=" + encodeURIComponent(abs) +
        (name ? "&name=" + encodeURIComponent(name) : "");
      entry = { worker: new Worker(workerUrl) };
      pool.set(key, entry);
    }

    /* every construction hands out a fresh port into the same worker —
       exactly how SharedWorker multiplexes clients */
    var channel = new MessageChannel();
    entry.worker.postMessage(
      { __memphisShimConnect: true, port: channel.port2 },
      [channel.port2]
    );
    this.port = channel.port1;
    this._key = key;
  }

  try {
    Object.defineProperty(globalThis, "SharedWorker", {
      value: ShimSharedWorker,
      writable: true,
      configurable: true,
    });
    console.info("memphis: SharedWorker polyfill installed (Safari/iOS compat)");
  } catch (e) {
    console.warn("memphis: could not install SharedWorker polyfill", e);
  }
})();
