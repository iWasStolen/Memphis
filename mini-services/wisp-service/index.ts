/**
 * Memphis unBLACKed — self-hosted wisp relay
 *
 * The Scramjet transports (epoxy / libcurl) multiplex TCP through
 * this wisp server over a WebSocket. The gateway in front of this
 * sandbox exposes it as:
 *
 *   wss://<preview-host>/wisp/?XTransformPort=3001
 *
 * Port: 3001 (see mini-services conventions).
 */
import { createServer } from "node:http";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

const PORT = 3001;

logging.set_level(logging.INFO);

Object.assign(wisp.options, {
  allow_udp_streams: false,
  /* use the system resolver — custom DNS-over-UDP servers are commonly
     blocked in sandboxes; the host's resolver is reliable here */
  dns_method: "lookup",
});

const server = createServer((req, res) => {
  if (req.url && req.url.startsWith("/healthz")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("memphis-wisp-ok");
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("memphis wisp relay — connect via wss://<host>/wisp/?XTransformPort=3001");
});

server.on("upgrade", (req, socket, head) => {
  /* the gateway may append query params (XTransformPort) — only look at the path */
  const pathname = (req.url || "").split("?")[0];
  if (pathname.endsWith("/wisp/") || pathname === "/wisp" || pathname === "/") {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[memphis-wisp] listening on 0.0.0.0:${PORT}`);
});
