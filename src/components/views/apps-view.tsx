"use client";

import { useEffect, useRef, useState } from "react";
import { APPS, AppDef } from "@/lib/apps";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize, Boxes } from "lucide-react";
import Calculator from "@/components/apps/calculator";
import Notes from "@/components/apps/notes";
import Draw from "@/components/apps/draw";
import MarkdownEditor from "@/components/apps/markdown";
import CodeSandbox from "@/components/apps/code";
import Timers from "@/components/apps/timers";
import WorldClock from "@/components/apps/clock";
import UnitConverter from "@/components/apps/converter";
import TextTools from "@/components/apps/text-tools";
import RandomPicker from "@/components/apps/random";

const APP_COMPONENTS: Record<string, React.ComponentType> = {
  calculator: Calculator,
  notes: Notes,
  draw: Draw,
  markdown: MarkdownEditor,
  code: CodeSandbox,
  timers: Timers,
  clock: WorldClock,
  converter: UnitConverter,
  text: TextTools,
  random: RandomPicker,
};

function AppFrame({ app, onClose }: { app: AppDef; onClose: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Cmp = APP_COMPONENTS[app.id];

  const goFullscreen = async () => {
    if (!ref.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else {
      await ref.current.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      role="dialog"
      aria-label={`${app.name} app`}
    >
      <div className="flex items-center justify-between gap-2 px-3 h-12 border-b border-[#141414] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-[#141414] size-8"
            onClick={onClose}
            aria-label="Close app"
          >
            <X className="size-4" />
          </Button>
          <span className="text-sm font-semibold text-white truncate">
            {app.name}
          </span>
          <span className="hidden sm:inline text-[11px] text-[#666] truncate">
            {app.desc}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#141414] size-8"
          onClick={goFullscreen}
          aria-label="Toggle fullscreen"
          title="Fullscreen"
        >
          {fullscreen ? <Minimize className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {Cmp ? <Cmp /> : <p className="p-6 text-sm text-[#8f8f8f]">App unavailable.</p>}
      </div>
    </div>
  );
}

export default function AppsView() {
  const [launching, setLaunching] = useState<AppDef | null>(null);
  const [open, setOpen] = useState<AppDef | null>(null);

  useEffect(() => {
    if (!launching) return;
    const t = setTimeout(() => {
      setOpen(launching);
      setLaunching(null);
    }, 700);
    return () => clearTimeout(t);
  }, [launching]);

  return (
    <div className="flex-1">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2.5">
            <Boxes className="size-5" /> Apps
          </h1>
          <p className="text-xs text-[#7a7a7a] mt-1">
            {APPS.length} tools that run entirely in your browser — nothing is
            uploaded.
          </p>
        </div>
        <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {APPS.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setLaunching(a)}
                aria-label={`Open ${a.name}`}
                className="group w-full text-left rounded-lg border border-[#1a1a1a] bg-[#080808] hover:border-[#333] transition-colors p-3.5"
              >
                <div className="aspect-[5/3] rounded-md border border-[#1c1c1c] bg-black flex items-center justify-center mb-3">
                  <span className="font-mono text-[10px] tracking-[0.25em] text-[#3a3a3a] group-hover:text-[#5a5a5a] transition-colors">
                    {a.tag.toUpperCase()}
                  </span>
                </div>
                <span className="text-[13px] text-white">{a.name}</span>
                <p className="text-[11px] text-[#666] truncate mt-0.5">{a.desc}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {launching && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-3"
          role="status"
        >
          <div className="text-lg font-semibold text-white">Memphis</div>
          <div className="mono-label boot-pulse">Launching {launching.name}…</div>
        </div>
      )}

      {open && !launching && <AppFrame app={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
