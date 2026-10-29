"use client";

import { useUI, useSettings } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Gamepad2,
  Boxes,
  MessagesSquare,
  Sparkles,
  Music4,
  Clapperboard,
  Globe,
  Repeat,
  Accessibility,
  ShieldCheck,
  Infinity as InfinityIcon,
  Zap,
} from "lucide-react";

const QUICK = [
  { icon: Gamepad2, label: "Play", desc: "1,400+ popular games", view: "play" as const },
  { icon: Boxes, label: "Apps", desc: "50 real apps", view: "apps" as const },
  { icon: MessagesSquare, label: "Chat", desc: "Community", view: "chat" as const },
  { icon: Sparkles, label: "AI", desc: "GLM · free · unlimited", view: "ai" as const },
  { icon: Music4, label: "Listen", desc: "Spotify", view: "listen" as const },
  { icon: Clapperboard, label: "Watch", desc: "YouTube", view: "watch" as const },
  { icon: Globe, label: "Browse", desc: "Scramjet proxy", view: "browse" as const },
];

const FEATURES = [
  {
    icon: Gamepad2,
    name: "1,400+ popular games, all playable",
    body: "A full HTML5 arcade: the most-played action, racing, puzzle, horror, sports, two-player and .io games on the web — FNAF, Papa's, Moto X3M, Sprunki, Bloons, Getaway Shootout and hundreds more — every one verified to run in the page, plus 12 classics that ship inside the app. Search, filter by category, favorite the ones you love and play fullscreen.",
  },
  {
    icon: Boxes,
    name: "50 day-use apps",
    body: "YouTube, Instagram, TikTok, ChatGPT, Gemini, Snapchat, Discord, Netflix, Gmail, Maps, Roblox and 39 more — every app opens through the proxy and runs inside the site, exactly as it would in a normal browser tab.",
  },
  {
    icon: Sparkles,
    name: "Unlimited GLM AI",
    body: "A real AI chat powered by GLM. No account, no daily quota, no limits — streaming answers with full markdown, code highlighting, saved conversations and custom instructions on every device session.",
  },
  {
    icon: Globe,
    name: "Scramjet web proxy",
    body: "The same engine used by the best unblocked sites: Scramjet with a choice of epoxy (default) or libcurl transport, running through a self-hosted wisp relay. Full JavaScript, WebSockets and logins — sites render like the real thing because they are.",
  },
  {
    icon: Music4,
    name: "Spotify, proxied",
    body: "The complete Spotify web player running through the engine. Log in, stream your playlists and podcasts, and keep your session — cookies live in the engine's client-side store on your device.",
  },
  {
    icon: Clapperboard,
    name: "YouTube, proxied",
    body: "All of YouTube inside the app: trending, subscriptions, search, history and playlists. Videos stream through the relay, so playback keeps working even where the site itself is blocked.",
  },
];

export default function HomeView() {
  const { setView } = useUI();
  const { proxyState } = useUI();
  const settings = useSettings((s) => s.settings);

  return (
    <div className="flex-1">
      {/* hero */}
      <section className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20 text-center">
          <p className="mono-label mb-4 flex items-center justify-center gap-2">
            <span
              className={`inline-block size-1.5 rounded-full ${
                proxyState === "ready" ? "bg-white" : "bg-[#555]"
              }`}
            />
            scramjet {proxyState === "ready" ? "online" : proxyState} · {settings.transport} transport
          </p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
            Everything, unblocked.
          </h1>
          <p className="mt-5 text-sm sm:text-base text-[#9a9a9a] max-w-2xl mx-auto leading-relaxed">
            1,400+ popular games, 50 real apps, Spotify, YouTube and an unlimited
            GLM-powered AI — all running on a Scramjet proxy that renders the real
            web inside this page. Pure black and white, nothing else.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => setView("play")}
              className="bg-white text-black hover:bg-[#e0e0e0]"
            >
              <Gamepad2 className="size-4 mr-2" />
              Play 1,400+ popular games
            </Button>
            <Button
              variant="outline"
              onClick={() => setView("ai")}
              className="border-[#2a2a2a] text-white hover:bg-[#101010] hover:border-[#3d3d3d]"
            >
              <Sparkles className="size-4 mr-2" />
              Chat with Memphis AI
            </Button>
          </div>
        </div>
      </section>

      {/* quick links */}
      <section aria-label="Sections" className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => setView(q.view)}
                className="group flex flex-col items-start gap-2 rounded-lg border border-[#1a1a1a] bg-[#080808] p-3.5 text-left transition-colors hover:border-[#333] hover:bg-[#0d0d0d]"
              >
                <q.icon className="size-4.5 text-[#8f8f8f] group-hover:text-white transition-colors" />
                <div>
                  <div className="text-sm text-white font-medium">{q.label}</div>
                  <div className="text-[11px] text-[#666]">{q.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-lg font-semibold text-white mb-6">What&apos;s inside</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
            {FEATURES.map((s) => (
              <article key={s.name}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <s.icon className="size-4 text-white" />
                  <h3 className="text-sm font-semibold text-white">{s.name}</h3>
                </div>
                <p className="text-[13px] text-[#8f8f8f] leading-relaxed">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* how the proxy works */}
      <section className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-lg font-semibold text-white mb-6">How the proxy works</h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                n: "01",
                t: "Service worker",
                d: "A Scramjet service worker takes over the origin and intercepts every encoded request the app makes — no visible address changes, no separate server hop.",
              },
              {
                n: "02",
                t: "Transport",
                d: "Traffic flows through epoxy (default) or libcurl. Switch transports any time from Settings; new connections use your choice immediately.",
              },
              {
                n: "03",
                t: "Wisp relay",
                d: "The transport multiplexes TCP over a WebSocket to the self-hosted wisp relay, which opens the real connection to the destination site.",
              },
              {
                n: "04",
                t: "Full rendering",
                d: "Scramjet rewrites HTML, CSS and JavaScript client-side, so logins, WebSockets, video and audio all behave like the real site.",
              },
            ].map((step) => (
              <li key={step.n}>
                <div className="font-mono text-[11px] text-[#555] mb-1.5">{step.n}</div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Repeat className="size-3.5 text-[#8f8f8f]" />
                  <h3 className="text-sm font-semibold text-white">{step.t}</h3>
                </div>
                <p className="text-[13px] text-[#8f8f8f] leading-relaxed">{step.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9a9a9a] border border-[#222] rounded-full px-2.5 py-1">
              <ShieldCheck className="size-3" /> scramjet 1.1.0
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9a9a9a] border border-[#222] rounded-full px-2.5 py-1">
              <Zap className="size-3" /> epoxy · libcurl
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9a9a9a] border border-[#222] rounded-full px-2.5 py-1">
              <InfinityIcon className="size-3" /> GLM — free & unlimited
            </span>
          </div>
        </div>
      </section>

      {/* accessibility */}
      <section>
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="flex items-center gap-2.5 mb-4">
            <Accessibility className="size-4 text-white" />
            <h2 className="text-lg font-semibold text-white">Accessibility</h2>
          </div>
          <p className="text-[13px] text-[#8f8f8f] leading-relaxed max-w-3xl">
            Built to be usable by everyone: full keyboard navigation with visible
            focus indicators, screen-reader labels on every control, adjustable
            text size and typeface, a high-contrast monochrome display, and
            reduced-motion support. If something is hard to use, report it from
            the footer and it gets fixed.
          </p>
        </div>
      </section>
    </div>
  );
}
