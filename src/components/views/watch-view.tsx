"use client";

/* ============================================================
   Watch — Movy (movies + TV via Scramjet proxy) and YouTube.
   Mirrors the tung tung reference: the default "Movy" tab
   embeds movy.sx full-site through the engine, with the
   site's ad gate pre-disabled via scoped sessionStorage
   (<host>@ads-enabled-session — the key layout Scramjet's
   storage wrapper reads). YouTube stays as tab two.
   ============================================================ */

import { useEffect, useState } from "react";
import { useUI } from "@/lib/store";
import { ProxyFrame } from "@/components/shell/proxy-frame";
import { Button } from "@/components/ui/button";
import { Clapperboard, ExternalLink, Info, Youtube as YoutubeIcon } from "lucide-react";

const MOVY_URL = "https://www.movy.sx/";
const YOUTUBE_HOME = "https://www.youtube.com";

type WatchTab = "movy" | "youtube";

/**
 * movy.sx gates an ads-enabled session prompt behind
 * sessionStorage "ads-enabled-session". Scramjet scopes the
 * proxied page's storage as `<host>@<key>` on our origin, so
 * presetting both host forms skips the gate — same trick the
 * tung tung reference uses before loading the frame.
 */
function presetMovy() {
  try {
    for (const host of ["www.movy.sx", "movy.sx"]) {
      sessionStorage.setItem(`${host}@ads-enabled-session`, "false");
    }
  } catch {
    /* storage unavailable — the gate just shows, harmless */
  }
}

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

const TABS: { id: WatchTab; label: string; icon: typeof Clapperboard }[] = [
  { id: "movy", label: "Movy", icon: Clapperboard },
  { id: "youtube", label: "YouTube", icon: YoutubeIcon },
];

export default function WatchView() {
  const { openInProxy } = useUI();
  const [tab, setTab] = useState<WatchTab>("movy");
  const [ytUrl, setYtUrl] = useState(YOUTUBE_HOME);

  /* preset the ad-gate key every time the Movy tab activates,
     before the frame src resolves through the engine */
  useEffect(() => {
    if (tab === "movy") presetMovy();
  }, [tab]);

  const activeSite = tab === "movy" ? MOVY_URL : ytUrl;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b border-[#141414] shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <Clapperboard className="size-4" /> Watch
          </h1>
          <span className="mono-label">
            {tab === "movy" ? "movy · movies + tv via proxy" : "youtube · full site via proxy"}
          </span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="border-[#2a2a2a] text-white hover:bg-[#101010]"
            onClick={() => openInProxy(activeSite)}
          >
            <ExternalLink className="size-3.5 mr-1.5" /> Open in Memphis Browser
          </Button>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-1.5 mt-3" role="tablist" aria-label="Watch sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] border transition-colors ${
                tab === t.id
                  ? "bg-white text-black border-white"
                  : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* quick links (youtube tab only) */}
        {tab === "youtube" && (
          <div
            className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 -mb-1"
            role="tablist"
            aria-label="YouTube sections"
          >
            {QUICK_LINKS.map((l) => (
              <button
                key={l.url}
                role="tab"
                aria-selected={ytUrl === l.url}
                onClick={() => setYtUrl(l.url)}
                className={`px-2.5 py-1.5 rounded-full text-[12px] border whitespace-nowrap transition-colors ${
                  ytUrl === l.url
                    ? "bg-white text-black border-white"
                    : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* viewport */}
      <div className="flex-1 min-h-0 p-2 sm:p-3">
        {tab === "movy" ? (
          <ProxyFrame
            url={MOVY_URL}
            title="Movy"
            className="rounded-xl border border-[#1a1a1a] h-full overflow-hidden"
            allow="autoplay; fullscreen; encrypted-media; clipboard-write; picture-in-picture"
          />
        ) : (
          <ProxyFrame
            url={ytUrl}
            title="YouTube"
            className="rounded-xl border border-[#1a1a1a] h-full overflow-hidden"
            allow="autoplay; fullscreen; clipboard-write; encrypted-media"
          />
        )}
      </div>

      <div className="px-4 py-2 border-t border-[#141414] flex items-start gap-2 shrink-0">
        <Info className="size-3.5 text-[#555] mt-0.5 shrink-0" />
        <p className="text-[11px] text-[#666] leading-relaxed">
          {tab === "movy" ? (
            <>
              Movy runs through the Scramjet engine — browse, search and stream movies and shows
              in full site form. The ad gate is pre-dismissed and playback flows through the wisp
              relay, so it works even where the site itself is blocked.
            </>
          ) : (
            <>
              YouTube runs through the Scramjet engine — sign in, watch, like and comment as usual.
              Video and ads stream via the wisp relay, so playback works even where the site itself
              is blocked.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
