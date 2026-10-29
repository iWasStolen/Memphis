/* ============================================================
   Memphis unBLACKed — proxy environment diagnostics & guidance

   Pure, dependency-free module (no React, no engine imports):
   it snapshots the browsing environment (service workers?
   secure context? iOS? in-app webview? standalone web app?)
   and turns a missing ServiceWorker API into concrete,
   platform-correct recovery steps for the error screen.

   Why this exists: on iPhone/iPad the ServiceWorker API is
   hidden entirely inside in-app browsers (WKWebView hosts
   like chat/social apps), in Safari's Private Browsing, in
   older Home Screen web apps — and everywhere on plain
   HTTP. In those contexts the proxy cannot ever start, so
   the error screen must tell the user exactly how to get
   into a context where it can.

   Consumers: the engine boot (lib/scramjet.ts — re-exports
   these) and the error UI (components/views/browse-view.tsx).
   Kept free of side effects so it is unit-testable in node.
   ============================================================ */

/* ---------------- diagnostics ---------------- */

export interface ProxyDiagnostics {
  ua: string;
  sharedWorker: boolean;
  serviceWorker: boolean;
  controlled: boolean;
  isolated: boolean;
  scramjetGlobal: boolean;
  controllerGlobal: boolean;
  localStorage: boolean;
  /** page is a secure context (HTTPS, or localhost in dev) */
  secure: boolean;
  /** iPhone / iPad / iPod per UA (incl. iPadOS desktop-mode UA) */
  ios: boolean;
  /** iOS in-app webview: UA lacks the Safari token */
  inAppBrowser: boolean;
  /** running as an installed standalone / home-screen web app */
  standalone: boolean;
}

/** Environment snapshot rendered on the proxy error screen. */
export function proxyDiagnostics(): ProxyDiagnostics {
  if (typeof window === "undefined") {
    return {
      ua: "", sharedWorker: false, serviceWorker: false, controlled: false,
      isolated: false, scramjetGlobal: false, controllerGlobal: false,
      localStorage: false, secure: false, ios: false, inAppBrowser: false,
      standalone: false,
    };
  }
  let storageOk = false;
  try {
    window.localStorage.getItem("__probe__");
    storageOk = true;
  } catch { /* blocked */ }
  const ua = navigator.userAgent;
  /* iPadOS 13+ reports a desktop Safari UA — touch points unmask it */
  const ios =
    /iP(?:hone|ad|od)/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  let standalone = false;
  try {
    standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { /* matchMedia unavailable — leave false */ }
  return {
    ua,
    sharedWorker: typeof SharedWorker !== "undefined",
    serviceWorker: "serviceWorker" in navigator,
    controlled: !!navigator.serviceWorker?.controller,
    isolated: !!window.crossOriginIsolated,
    scramjetGlobal: !!window.$scramjet,
    controllerGlobal: !!window.$scramjetController,
    localStorage: storageOk,
    secure: window.isSecureContext === true,
    ios,
    /* WKWebView in-app browsers ship a UA without the Safari token */
    inAppBrowser: ios && !/Safari\//.test(ua),
    standalone,
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
    `https:${d.secure ? "y" : "n"}`,
    `SW:${d.serviceWorker ? "y" : "n"}`,
    `ctl:${d.controlled ? "y" : "n"}`,
    `SharedWorker:${d.sharedWorker ? "y" : "n"}`,
    `storage:${d.localStorage ? "y" : "n"}`,
    `engine:${d.scramjetGlobal ? "y" : "n"}`,
  ].join(" · ");
}

/* ---------------- SW-unavailable guidance ---------------- */

export interface SwGuidance {
  /** one-sentence cause, shown under the error title */
  cause: string;
  /** ordered, concrete recovery steps */
  steps: string[];
  /** https:// link to the current page — set when the page itself is insecure */
  httpsHref?: string;
  /** show a "copy site link" affordance (mobile app-switching flows) */
  copyLink: boolean;
}

/** The bits of `location` the guidance needs (injectable for tests). */
export interface GuidanceLocation {
  protocol: string;
  host: string;
  pathname: string;
  search: string;
}

/**
 * Platform-correct recovery guidance for "navigator.serviceWorker
 * is missing". Branches are ordered by what we can prove:
 *   1. insecure HTTP page  → link to the HTTPS version
 *   2. iOS in-app webview  → "Open in Safari"
 *   3. iOS home-screen app → open in a real browser
 *   4. iOS Safari          → Private Browsing / in-app viewer advice
 *   5. anything else       → desktop-grade browser advice
 */
export function swUnavailableGuidance(
  d: ProxyDiagnostics = proxyDiagnostics(),
  loc: GuidanceLocation | null = typeof location !== "undefined" ? location : null,
): SwGuidance {
  /* 1 — plain HTTP: the API is hidden purely because the context is
     insecure (localhost is exempt — it counts as secure) */
  if (!d.secure && loc && loc.protocol === "http:") {
    return {
      cause:
        "This page is open over a plain HTTP connection, so the browser hides " +
        "the service workers the proxy engine needs.",
      steps: [
        "Open the secure HTTPS version of this site — the address must start with https:// — and start the proxy from there.",
      ],
      httpsHref: `https://${loc.host}${loc.pathname}${loc.search}`,
      copyLink: true,
    };
  }

  if (d.ios) {
    /* 2 — a webview inside another app (chat, social, game launchers…) */
    if (d.inAppBrowser) {
      return {
        cause:
          "You're viewing this site inside another app's built-in browser. On iPhone and " +
          "iPad those in-app browsers don't expose the service workers the proxy engine needs.",
        steps: [
          "Tap the Share button — the square with an arrow coming out of it.",
          "Choose “Open in Safari”.",
          "Open the site again from the Safari tab and start the proxy.",
        ],
        copyLink: true,
      };
    }

    /* 3 — installed to the home screen */
    if (d.standalone) {
      return {
        cause:
          "This Home Screen web app isn't exposing the service workers the proxy engine needs.",
        steps: [
          "Close the web app and open the site directly in Safari or Chrome, then start the proxy from there.",
        ],
        copyLink: true,
      };
    }

    /* 4 — Safari itself, secure, but no SW API: almost always a
       Private window, or an SFSafariViewController viewer inside
       another app (its UA is identical to Safari's) */
    return {
      cause:
        "Safari isn't exposing service workers in this window. On iPhone and iPad that's " +
        "almost always Private Browsing, or a link opened inside another app's viewer.",
      steps: [
        "If this is a Private window: close it, open a normal Safari window and load the site again.",
        "If you opened this link from inside another app: tap Share (the square with an arrow) and choose “Open in Safari”.",
        "Still failing? Update iOS and try again — or open the site in Chrome or Firefox on iOS.",
      ],
      copyLink: true,
    };
  }

  /* 5 — desktop / unknown */
  return {
    cause: "This browser does not expose the service workers the proxy engine needs.",
    steps: [
      "Open this site in Chrome, Edge or Firefox.",
      "Make sure the address starts with https:// — service workers are disabled on plain HTTP.",
      "If you're in a private or incognito window, open a normal one.",
    ],
    copyLink: false,
  };
}
