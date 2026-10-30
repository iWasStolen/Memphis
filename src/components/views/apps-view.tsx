"use client";

import { useMemo, useState } from "react";
import { APPS, APP_CATEGORIES, faviconUrl } from "@/lib/apps";
import { useUI } from "@/lib/store";
import { Search, LayoutGrid, ExternalLink } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  social: "Social",
  video: "Video",
  music: "Music",
  ai: "AI",
  google: "Google",
  utility: "Utility",
  shopping: "Shopping",
  gaming: "Gaming",
};

export default function AppsView() {
  const { openInProxy } = useUI();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const list = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return APPS.filter((a) => {
      if (cat !== "all" && a.tag !== cat) return false;
      if (!terms.length) return true;
      const hay = `${a.name} ${a.desc} ${a.tag}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [q, cat]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b border-[#141414] shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-white flex items-center gap-2">
            <LayoutGrid className="size-4" /> Apps
          </h1>
          <span className="mono-label">{APPS.length} apps · open through the proxy</span>
          <span className="flex-1" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#555]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search apps…"
              aria-label="Search apps"
              spellCheck={false}
              className="w-56 max-w-[55vw] h-9 rounded-full bg-[#050505] border border-[#1f1f1f] pl-9 pr-3 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#3a3a3a]"
            />
          </div>
        </div>

        {/* category chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="App categories">
          {APP_CATEGORIES.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cat === c}
              onClick={() => setCat(c)}
              className={`px-2.5 py-1.5 rounded-full text-[12px] border whitespace-nowrap transition-colors ${
                cat === c
                  ? "bg-white text-black border-white"
                  : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto memphis-scroll">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-center px-6">
            <Search className="size-6 text-[#555]" />
            <p className="text-sm text-white">No apps matched “{q}”.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3 sm:p-5">
            {list.map((a) => (
              <button
                key={a.id}
                onClick={() => openInProxy(a.url)}
                className="group rounded-xl border border-[#1a1a1a] bg-[#080808] hover:border-[#3a3a3a] hover:bg-[#0d0d0d] transition-all p-4 text-left focus-visible:outline focus-visible:outline-white/60"
                aria-label={`Open ${a.name} through the proxy`}
              >
                <div className="flex items-start justify-between">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={faviconUrl(a.domain)}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="size-10 rounded-lg bg-[#141414] object-contain p-1.5 grayscale-[45%] group-hover:grayscale-0 group-hover:scale-105 transition-all"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                  <ExternalLink className="size-3.5 text-[#444] group-hover:text-white transition-colors" />
                </div>
                <div className="mt-3 text-[13px] text-white font-medium truncate">{a.name}</div>
                <div className="text-[11px] text-[#666] truncate">{a.desc}</div>
                <div className="mt-1.5 mono-label !text-[9px]">{CATEGORY_LABELS[a.tag] ?? a.tag}</div>
              </button>
            ))}
          </div>
        )}
        <div className="h-6" />
      </div>
    </div>
  );
}
