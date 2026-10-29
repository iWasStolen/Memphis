/* ============================================================
   Unit tests for src/lib/proxy-guidance.ts (pure module).

   Run: node scripts/test-proxy-guidance.ts
   (Node >= 23 type-strips TS natively — no build step needed.)

   Covers every swUnavailableGuidance branch with synthetic
   diagnostics, the diagnosticsLine format, and the UA
   classification inside proxyDiagnostics (iPhone Safari vs
   in-app webview vs iPadOS desktop-mode vs desktop Chrome)
   via stubbed browser globals.
   ============================================================ */

import assert from "node:assert/strict";
import {
  proxyDiagnostics,
  diagnosticsLine,
  swUnavailableGuidance,
  type ProxyDiagnostics,
  type GuidanceLocation,
} from "../src/lib/proxy-guidance.ts";

let passed = 0;
function ok(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

const UAS = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneInApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

function base(over: Partial<ProxyDiagnostics> = {}): ProxyDiagnostics {
  return {
    ua: UAS.chrome,
    sharedWorker: true,
    serviceWorker: false,
    controlled: false,
    isolated: false,
    scramjetGlobal: false,
    controllerGlobal: false,
    localStorage: true,
    secure: true,
    ios: false,
    inAppBrowser: false,
    standalone: false,
    ...over,
  };
}

const loc = (protocol: string, host: string, pathname = "/", search = ""): GuidanceLocation => ({
  protocol,
  host,
  pathname,
  search,
});

/* -------- default-arg safety (node has no window/location) -------- */
console.log("\n[1] default arguments in a bare node context");
{
  const g = swUnavailableGuidance();
  ok("does not throw without window/location", g.steps.length >= 1);
  ok("falls back to the generic desktop branch", g.cause.includes("does not expose"));
  ok("no httpsHref outside a real insecure page", g.httpsHref === undefined);
}

/* -------- branch: desktop / unknown browser -------- */
console.log("\n[2] desktop branch (secure context, SW API missing)");
{
  const g = swUnavailableGuidance(base(), loc("https:", "example.com"));
  ok("cause names the missing API", g.cause.includes("service workers"));
  ok("recommends a desktop browser", g.steps.some((s) => s.includes("Chrome, Edge or Firefox")));
  ok("mentions https://", g.steps.some((s) => s.includes("https://")));
  ok("mentions private windows", g.steps.some((s) => s.includes("private or incognito")));
  ok("no copy-link on desktop", g.copyLink === false);
  ok("no httpsHref", g.httpsHref === undefined);
}

/* -------- branch: insecure HTTP page -------- */
console.log("\n[3] insecure-HTTP branch (any platform)");
{
  const g = swUnavailableGuidance(base({ secure: false }), loc("http:", "example.com", "/browse", "?x=1"));
  ok("cause names plain HTTP", g.cause.includes("plain HTTP"));
  ok("builds the https href from location", g.httpsHref === "https://example.com/browse?x=1");
  ok("offers copy-link", g.copyLink === true);
  ok("step points at the HTTPS version", g.steps.some((s) => s.includes("https://")));
  /* iOS UA on an http page must still get the HTTPS advice first */
  const gi = swUnavailableGuidance(base({ secure: false, ios: true }), loc("http:", "example.com"));
  ok("iOS over HTTP still gets the HTTPS link first", gi.httpsHref === "https://example.com/");
  /* localhost-style secure contexts never hit this branch */
  const gl = swUnavailableGuidance(base({ secure: true }), loc("http:", "localhost:81"));
  ok("secure localhost skips the HTTP branch", !gl.cause.includes("plain HTTP"));
}

/* -------- branch: iOS in-app webview -------- */
console.log("\n[4] iOS in-app browser branch");
{
  const d = base({ ua: UAS.iphoneInApp, ios: true, inAppBrowser: true });
  const g = swUnavailableGuidance(d, loc("https:", "example.com"));
  ok("cause names the in-app browser", g.cause.includes("app's built-in browser"));
  ok("step 1 is the Share button", g.steps[0].includes("Share button"));
  ok("step 2 is Open in Safari", g.steps.some((s) => s.includes("Open in Safari")));
  ok("offers copy-link for app switching", g.copyLink === true);
  ok("no httpsHref on a secure page", g.httpsHref === undefined);
}

/* -------- branch: iOS home-screen web app -------- */
console.log("\n[5] iOS standalone (Home Screen app) branch");
{
  const g = swUnavailableGuidance(base({ ios: true, standalone: true }), loc("https:", "example.com"));
  ok("cause names the Home Screen app", g.cause.includes("Home Screen"));
  ok("step says to open Safari or Chrome directly", g.steps.some((s) => s.includes("Safari or Chrome")));
}

/* -------- branch: iOS Safari (private window / in-app viewer) -------- */
console.log("\n[6] iOS Safari branch (secure, SW API hidden)");
{
  const d = base({ ua: UAS.iphoneSafari, ios: true, inAppBrowser: false });
  const g = swUnavailableGuidance(d, loc("https:", "example.com"));
  ok("cause names Private Browsing / app viewer", g.cause.includes("Private Browsing"));
  ok("step 1 targets the Private window", g.steps[0].includes("Private window"));
  ok("step 2 targets links opened in apps", g.steps[1].includes("inside another app"));
  ok("step 3 mentions updating iOS / other browsers", g.steps[2].includes("Update iOS"));
  ok("offers copy-link", g.copyLink === true);
}

/* -------- diagnosticsLine format -------- */
console.log("\n[7] diagnosticsLine format");
{
  const line = diagnosticsLine(base({ serviceWorker: false, controlled: false }));
  ok(
    "format is browser · https · SW · ctl · SharedWorker · storage · engine",
    line === "Chrome · https:y · SW:n · ctl:n · SharedWorker:y · storage:y · engine:n",
  );
  const safariLine = diagnosticsLine(base({ ua: UAS.iphoneSafari }));
  ok("iPhone Safari UA is labelled Safari", safariLine.startsWith("Safari · "));
}

/* -------- proxyDiagnostics UA classification (stubbed globals) -------- */
console.log("\n[8] proxyDiagnostics UA classification (stubbed browser globals)");
{
  const g = globalThis as unknown as Record<string, unknown>;
  const hadNavigator = "navigator" in g;
  const navDesc = Object.getOwnPropertyDescriptor(g, "navigator");
  const hadWindow = "window" in g;
  const hadSharedWorker = "SharedWorker" in g;

  try {
    g.SharedWorker = function SharedWorker() {};
    const stub = (ua: string, maxTouchPoints = 0, secure = true) => {
      g.window = {
        isSecureContext: secure,
        localStorage: { getItem: () => null },
        matchMedia: () => ({ matches: false }),
        crossOriginIsolated: false,
      };
      Object.defineProperty(g, "navigator", {
        value: { userAgent: ua, maxTouchPoints },
        configurable: true,
      });
    };

    stub(UAS.iphoneSafari, 5);
    let d = proxyDiagnostics();
    ok("iPhone Safari UA → ios", d.ios === true);
    ok("iPhone Safari UA → not in-app", d.inAppBrowser === false);
    ok("isSecureContext honoured", d.secure === true);

    stub(UAS.iphoneInApp, 5);
    d = proxyDiagnostics();
    ok("in-app UA (no Safari token) → inAppBrowser", d.inAppBrowser === true);
    ok("in-app UA → still ios", d.ios === true);

    stub(UAS.ipadDesktop, 5);
    d = proxyDiagnostics();
    ok("iPadOS desktop-mode UA (Macintosh + touch) → ios", d.ios === true);

    stub(UAS.chrome, 0, false);
    d = proxyDiagnostics();
    ok("desktop Chrome UA → not ios", d.ios === false);
    ok("insecure context reported", d.secure === false);
    ok("SharedWorker detected when present", d.sharedWorker === true);
  } finally {
    delete g.SharedWorker;
    delete g.window;
    if (hadNavigator && navDesc) Object.defineProperty(g, "navigator", navDesc);
    else if (!hadNavigator) delete g.navigator;
    if (!hadWindow) delete g.window;
    if (!hadSharedWorker) delete g.SharedWorker;
  }
  /* back to the SSR fallback after cleanup */
  const d = proxyDiagnostics();
  ok("SSR fallback when window is gone", d.serviceWorker === false && d.ios === false);
}

console.log(`\nAll ${passed} assertions passed.`);
