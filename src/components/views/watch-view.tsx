"use client";

/* ============================================================
   Watch — YouTube, proxied through Scramjet.
   Sign in, watch, comment — everything runs through the
   engine inside the app.
   ============================================================ */

import { useState } from "react";
import { useUI } from "@/lib/store";
import { ProxyFrame } from "@/components/shell/proxy-frame";
import { Button } from "@/components/ui/button";
import { Tv, ExternalLink, Info } from "lucide-react";

const YOUTUBE_HOME = "https://www.youtube.com";

const QUICK_LINKS: { label: string; url: string }[] = [
  { label: "Home", url: "https://www.youtube.com" },
  { label: "Trending", url: "https://www.youtube.com/feed/trending" },
  { label: "Subscriptions", url: "https://www.youtube.com/feed/subscriptions" },
  { label: "Explore", url: "https://www.youtube.com/explore" },
  { label: "Gaming", url: "https://www.youtube.com/gaming" },
  { label: "Music", url: "https://music.youtube.com" },
  { label: "History", url: "https://www.youtube.com/feed/history" },
  { label: "Watch later", url: "https://www.youtube.com/playlist?list=WL" },
];

export default function WatchView() {
  const { openInProxy } = useUI();
  const [url, setUrl] = useState(YOUTUBE_HOME);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b border-[#141414] shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <Tv className="size-4" /> Watch
          </h1>
          <span className="mono-label">youtube · full site via proxy</span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="border-[#2a2a2a] text-white hover:bg-[#101010]"
            onClick={() => openInProxy(YOUTUBE_HOME)}
          >
            <ExternalLink className="size-3.5 mr-1.5" /> Open in Memphis Browser
          </Button>
        </div>

        {/* quick links */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="YouTube sections">
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
            </button>
          ))}
        </div>
      </div>

      {/* viewport */}
      <div className="flex-1 min-h-0 p-2 sm:p-3">
        <ProxyFrame
          url={url}
          title="YouTube"
          className="rounded-xl border border-[#1a1a1a] h-full overflow-hidden"
          allow="autoplay; fullscreen; clipboard-write; encrypted-media"
        />
      </div>

      <div className="px-4 py-2 border-t border-[#141414] flex items-start gap-2 shrink-0">
        <Info className="size-3.5 text-[#555] mt-0.5 shrink-0" />
        <p className="text-[11px] text-[#666] leading-relaxed">
          YouTube runs through the Scramjet engine — sign in, watch, like and comment as usual.
          Video and ads stream via the wisp relay, so playback works even where the site itself
          is blocked.
        </p>
      </div>
    </div>
  );
}
