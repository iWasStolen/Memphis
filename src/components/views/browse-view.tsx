"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings, lsGet, lsSet } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Plus,
  X,
  ExternalLink,
  Maximize2,
  Minimize,
  Globe,
  History as HistoryIcon,
  Search,
  ShieldAlert,
  Clock,
} from "lucide-react";

interface Tab {
  id: string;
  jar: string;
  url: string | null; // raw target url, null = new tab page
  title: string;
  stack: string[];
  idx: number;
}

const HISTORY_KEY = "memphis-browse-history";
const QUICK_LINKS = [
  { name: "Wikipedia", url: "https://en.wikipedia.org", hint: "the free encyclopedia" },
  { name: "DuckDuckGo", url: "https://lite.duckduckgo.com/lite/", hint: "search" },
  { name: "Hacker News", url: "https://news.ycombinator.com", hint: "tech news" },
  { name: "example.com", url: "https://example.com", hint: "test page" },
  { name: "Internet Archive", url: "https://archive.org", hint: "public library" },
  { name: "MDN Docs", url: "https://developer.mozilla.org", hint: "web docs" },
];

function newTab(): Tab {
  const jar = "j" + Math.random().toString(36).slice(2, 12);
  return { id: crypto.randomUUID(), jar, url: null, title: "New tab", stack: [], idx: -1 };
}

function normalizeInput(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return "https://" + t;
  return `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(t)}`;
}

export default function BrowseView() {
  const { settings } = useSettings();
  const [tabs, setTabs] = useState<Tab[]>([newTab()]);
  const [activeId, setActiveId] = useState<string>("");
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ url: string; title: string; at: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const proxyBase = settings.proxyBase?.trim()
    ? settings.proxyBase.replace(/\/$/, "")
    : "";

  const toProxied = useCallback(
    (url: string, jar: string) =>
      `${proxyBase || ""}/api/proxy?u=${encodeURIComponent(url)}&s=${encodeURIComponent(jar)}`,
    [proxyBase]
  );

  useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id);
  }, [activeId, tabs]);

  useEffect(() => {
    setHistory(lsGet(HISTORY_KEY, []));
  }, []);

  /* reflect active tab url in address bar */
  useEffect(() => {
    setAddr(active?.url ?? "");
  }, [active?.url, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* listen for location reports from proxied pages */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.__memphis !== true) return;
      setTabs((cur) =>
        cur.map((t) =>
          t.jar === d.jar
            ? { ...t, title: d.title || t.title, url: d.url || t.url }
            : t
        )
      );
      if (d.url && d.title) {
        const h = lsGet<typeof history>(HISTORY_KEY, []).filter(
          (x) => x.url !== d.url
        );
        h.unshift({ url: d.url, title: d.title, at: Date.now() });
        lsSet(HISTORY_KEY, h.slice(0, 100));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* Ctrl+L focuses the address bar */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigate = (rawUrl: string, tabId = activeId, pushHistory = true) => {
    const url = normalizeInput(rawUrl);
    if (!url) return;
    setTabs((cur) =>
      cur.map((t) => {
        if (t.id !== tabId) return t;
        if (pushHistory) {
          const stack = [...t.stack.slice(0, t.idx + 1), url];
          return { ...t, url, stack, idx: stack.length - 1, title: url };
        }
        return { ...t, url, title: url };
      })
    );
    setLoading(true);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => setLoading(false), 8000);
  };

  const go = () => navigate(addr);

  const back = () => {
    if (!active || active.idx <= 0) return;
    const idx = active.idx - 1;
    setTabs((cur) =>
      cur.map((t) => (t.id === active.id ? { ...t, idx, url: t.stack[idx] } : t))
    );
    setLoading(true);
  };

  const forward = () => {
    if (!active || active.idx >= active.stack.length - 1) return;
    const idx = active.idx + 1;
    setTabs((cur) =>
      cur.map((t) => (t.id === active.id ? { ...t, idx, url: t.stack[idx] } : t))
    );
    setLoading(true);
  };

  const reload = () => {
    if (!active?.url) return;
    setLoading(true);
    setTabs((cur) =>
      cur.map((t) =>
        t.id === active.id ? { ...t, jar: "j" + Math.random().toString(36).slice(2, 12) } : t
      )
    );
  };

  const goHome = () => {
    setTabs((cur) =>
      cur.map((t) => (t.id === active.id ? { ...t, url: null, title: "New tab" } : t))
    );
    setAddr("");
  };

  const addTab = () => {
    if (tabs.length >= 6) return;
    const t = newTab();
    setTabs((cur) => [...cur, t]);
    setActiveId(t.id);
    setAddr("");
  };

  const closeTab = (id: string) => {
    setTabs((cur) => {
      const next = cur.filter((t) => t.id !== id);
      const result = next.length ? next : [newTab()];
      if (id === activeId) setActiveId(result[result.length - 1].id);
      return result;
    });
  };

  const toggleFullscreen = async () => {
    if (!viewportRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else {
      await viewportRef.current.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  };

  const clearHistory = () => {
    lsSet(HISTORY_KEY, []);
    setHistory([]);
    setShowHistory(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* tab bar */}
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-[#141414] overflow-x-auto shrink-0" role="tablist" aria-label="Browser tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            onClick={() => setActiveId(t.id)}
            className={`group flex items-center gap-2 pl-3 pr-1.5 py-2 rounded-t-lg border border-b-0 max-w-44 min-w-32 transition-colors ${
              t.id === activeId
                ? "bg-[#0a0a0a] border-[#1f1f1f] text-white"
                : "bg-transparent border-transparent text-[#8f8f8f] hover:text-white hover:bg-[#060606]"
            }`}
          >
            <Globe className="size-3.5 shrink-0 opacity-70" />
            <span className="text-xs truncate flex-1 text-left">{t.title}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close tab ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  closeTab(t.id);
                }
              }}
              className="p-1 rounded hover:bg-[#1c1c1c] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3" />
            </span>
          </button>
        ))}
        <button
          onClick={addTab}
          disabled={tabs.length >= 6}
          aria-label="New tab"
          title="New tab"
          className="p-1.5 rounded-md text-[#8f8f8f] hover:text-white hover:bg-[#101010] disabled:opacity-30 shrink-0"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-[#141414] shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
          onClick={back}
          disabled={!active || active.idx <= 0}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
          onClick={forward}
          disabled={!active || active.idx >= active.stack.length - 1}
          aria-label="Forward"
          title="Forward"
        >
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
          onClick={reload}
          disabled={!active?.url}
          aria-label="Reload"
          title="Reload"
        >
          <RotateCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
          onClick={goHome}
          aria-label="New tab page"
          title="New tab page"
        >
          <Home className="size-4" />
        </Button>

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#555] pointer-events-none" />
          <input
            ref={inputRef}
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
            placeholder="Search or enter address"
            aria-label="Address bar"
            spellCheck={false}
            className="w-full h-9 rounded-full bg-[#050505] border border-[#1f1f1f] pl-9 pr-3 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#3a3a3a] focus:ring-1 focus:ring-white/20"
          />
          {loading && (
            <div className="absolute -bottom-2 left-4 right-4 h-[2px] bg-[#141414] overflow-hidden rounded-full">
              <div
                className="h-full w-1/2 bg-white"
                style={{ animation: "boot-bar 1s ease-in-out infinite alternate" }}
              />
            </div>
          )}
        </div>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
            onClick={() => {
              setHistory(lsGet(HISTORY_KEY, []));
              setShowHistory((s) => !s);
            }}
            aria-label="History"
            title="History"
          >
            <HistoryIcon className="size-4" />
          </Button>
          {showHistory && (
            <div className="absolute right-0 top-10 z-30 w-80 max-w-[90vw] rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] shadow-xl p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="mono-label">recent history</span>
                <button
                  className="text-[10px] text-[#777] hover:text-white u-link"
                  onClick={clearHistory}
                >
                  clear
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-xs text-[#666] px-2 py-3">
                    Nothing yet — pages you visit appear here (stored locally
                    only).
                  </p>
                ) : (
                  history.slice(0, 20).map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        navigate(h.url);
                        setShowHistory(false);
                      }}
                      className="w-full text-left px-2 py-2 rounded-md hover:bg-[#141414] group"
                    >
                      <div className="text-xs text-white truncate">{h.title}</div>
                      <div className="text-[10px] text-[#666] truncate flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {new Date(h.at).toLocaleString()} · {h.url}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {active?.url && (
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
            onClick={() => {
              if (
                window.confirm(
                  "Open this site directly in a new tab? This leaves Memphis and reveals the address to your browser history."
                )
              )
                window.open(active.url, "_blank");
            }}
            aria-label="Open outside Memphis"
            title="Open outside Memphis"
          >
            <ExternalLink className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-8"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          title="Fullscreen"
        >
          {fullscreen ? <Minimize className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>

      {/* viewport */}
      <div ref={viewportRef} className="flex-1 min-h-0 relative bg-black">
        {active && active.url ? (
          <iframe
            key={active.id + active.jar}
            src={toProxied(active.url, active.jar)}
            className="w-full h-full border-0 bg-black"
            title={active.title}
            onLoad={() => setLoading(false)}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
            allow="autoplay; fullscreen; clipboard-write"
          />
        ) : (
          /* new tab page */
          <div className="h-full overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 text-white text-lg font-semibold">
                  <Globe className="size-5" /> Memphis Browser
                </div>
                <p className="text-xs text-[#7a7a7a] mt-2">
                  Relay engine v1 — private networks blocked, requests rate
                  limited, cookies isolated per tab.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  go();
                }}
                className="relative mb-10"
              >
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#555]" />
                <input
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  placeholder="Search DuckDuckGo or type a URL"
                  aria-label="Search or enter address"
                  className="w-full h-12 rounded-full bg-[#050505] border border-[#1f1f1f] pl-11 pr-4 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#3a3a3a]"
                />
              </form>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-10">
                {QUICK_LINKS.map((q) => (
                  <button
                    key={q.url}
                    onClick={() => navigate(q.url)}
                    className="rounded-lg border border-[#1a1a1a] bg-[#080808] hover:border-[#333] transition-colors p-4 text-left"
                  >
                    <div className="text-sm text-white">{q.name}</div>
                    <div className="text-[11px] text-[#666] mt-0.5">{q.hint}</div>
                  </button>
                ))}
              </div>
              {history.length > 0 && (
                <div>
                  <div className="mono-label mb-2">continue where you left off</div>
                  <div className="flex flex-wrap gap-1.5">
                    {history.slice(0, 8).map((h, i) => (
                      <button
                        key={i}
                        onClick={() => navigate(h.url)}
                        className="px-2.5 py-1.5 rounded-full border border-[#222] text-[11px] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a] max-w-56 truncate"
                      >
                        {h.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* status strip */}
      <div className="flex items-center gap-3 px-3 h-7 border-t border-[#141414] text-[10px] text-[#555] font-mono shrink-0">
        <span className="flex items-center gap-1">
          <ShieldAlert className="size-3" />
          SSRF-guarded relay
        </span>
        <span className="hidden sm:inline">· no WebSockets</span>
        <span className="hidden sm:inline">· 30 MB / 15 s caps</span>
        <span className="flex-1" />
        <span>
          {active?.url
            ? `${loading ? "loading…" : "ready"} · ${active.jar}`
            : "new tab"}
        </span>
      </div>
    </div>
  );
}
