"use client";

/* ============================================================
   Listen — Spotify, proxied through Scramjet.
   The full web player runs inside the app; log in once and
   cookies live in the engine's client-side store.
   ============================================================ */

import { useState } from "react";
import { useUI } from "@/lib/store";
import { ProxyFrame } from "@/components/shell/proxy-frame";
import { Button } from "@/components/ui/button";
import { Music2, ExternalLink, Info } from "lucide-react";

const SPOTIFY_HOME = "https://open.spotify.com";

const QUICK_LINKS: { label: string; url: string; hint: string }[] = [
  { label: "Home", url: "https://open.spotify.com", hint: "your player" },
  { label: "Search", url: "https://open.spotify.com/search", hint: "find anything" },
  { label: "Library", url: "https://open.spotify.com/collection/tracks", hint: "liked songs" },
  { label: "Charts", url: "https://charts.spotify.com", hint: "global charts" },
  { label: "Podcasts", url: "https://open.spotify.com/genre/podcasts-web", hint: "shows" },
];

export default function ListenView() {
  const { openInProxy } = useUI();
  const [url, setUrl] = useState(SPOTIFY_HOME);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b border-[#141414] shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <Music2 className="size-4" /> Listen
          </h1>
          <span className="mono-label">spotify · full web player via proxy</span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="border-[#2a2a2a] text-white hover:bg-[#101010]"
            onClick={() => openInProxy(SPOTIFY_HOME)}
          >
            <ExternalLink className="size-3.5 mr-1.5" /> Open in Memphis Browser
          </Button>
        </div>

        {/* quick links */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="Spotify sections">
          {QUICK_LINKS.map((l) => (
            <button
              key={l.url}
              role="tab"
              aria-selected={url === l.url}
              onClick={() => setUrl(l.url)}
              className={`px-2.5 py-1.5 rounded-full text-[12px] border whitespace-nowrap transition-colors ${
                url === l.url
                  ? "bg-white text-black border-white"
                  : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
              }`}
            >
              {l.label}
              <span className="ml-1.5 text-[10px] opacity-60 hidden sm:inline">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* player */}
      <div className="flex-1 min-h-0 p-2 sm:p-3">
        <ProxyFrame
          url={url}
          title="Spotify — web player"
          className="rounded-xl border border-[#1a1a1a] h-full overflow-hidden"
          allow="autoplay; fullscreen; clipboard-write; encrypted-media"
        />
      </div>

      <div className="px-4 py-2 border-t border-[#141414] flex items-start gap-2 shrink-0">
        <Info className="size-3.5 text-[#555] mt-0.5 shrink-0" />
        <p className="text-[11px] text-[#666] leading-relaxed">
          The Spotify web player streams through the Scramjet engine. Log in with your Spotify
          account — your session stays in the engine&apos;s client-side cookie store on this
          device. Audio plays straight from Spotify&apos;s CDN via the wisp relay.
        </p>
      </div>
    </div>
  );
}
