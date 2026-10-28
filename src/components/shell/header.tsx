"use client";

import { useEffect, useState } from "react";
import { Settings2, Maximize2, Menu } from "lucide-react";
import { useUI, useSettings } from "@/lib/store";
import { VIEWS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function useClock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        [d.getHours(), d.getMinutes(), d.getSeconds()]
          .map((n) => String(n).padStart(2, "0"))
          .join(":")
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useSessionTimer() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = Number(
      window.localStorage.getItem("memphis-session-start") ?? Date.now()
    );
    if (!start) window.localStorage.setItem("memphis-session-start", String(Date.now()));
    const tick = () => setSecs(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0");
  return `${mm}:${String(s).padStart(2, "0")}`;
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="font-semibold tracking-tight select-none whitespace-nowrap">
      MEMPHIS{" "}
      <span className="text-[#8f8f8f] font-normal">
        un<span className="line-through decoration-[#555]">BLACK</span>ed
      </span>
      {!compact && (
        <span className="ml-2 hidden sm:inline-block size-1.5 bg-white rounded-[2px] align-middle" />
      )}
    </span>
  );
}

export function Header() {
  const { view, setView, openModal } = useUI();
  const clock = useClock();
  const session = useSessionTimer();
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (v: (typeof VIEWS)[number]["id"]) => {
    setView(v);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#141414] bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:px-4">
        {/* mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-white"
              aria-label="Open navigation menu"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 bg-[#050505] border-[#1a1a1a] p-0"
          >
            <SheetHeader className="border-b border-[#141414] px-4 py-3">
              <SheetTitle className="text-white text-left">
                <Wordmark compact />
              </SheetTitle>
            </SheetHeader>
            <nav className="p-2" aria-label="Mobile navigation">
              {VIEWS.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => go(v.id)}
                  className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-left transition-colors ${
                    view === v.id
                      ? "bg-[#161616] text-white"
                      : "text-[#9a9a9a] hover:bg-[#101010] hover:text-white"
                  }`}
                >
                  <span>{v.label}</span>
                  <span className="text-[10px] text-[#555] font-mono">
                    alt+{i + 1}
                  </span>
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <button
          onClick={() => go("home")}
          className="text-white text-sm sm:text-base mr-1 sm:mr-3 shrink-0"
          aria-label="Memphis unBLACKed home"
        >
          <Wordmark />
        </button>

        {/* desktop nav */}
        <nav
          className="hidden md:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto"
          aria-label="Primary"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => go(v.id)}
              aria-current={view === v.id ? "page" : undefined}
              className={`relative px-2.5 py-1.5 text-[13px] rounded-md transition-colors shrink-0 ${
                view === v.id
                  ? "text-white"
                  : "text-[#8f8f8f] hover:text-white hover:bg-[#101010]"
              }`}
            >
              {v.label}
              {view === v.id && (
                <span className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-white" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* clocks */}
        <div
          className="hidden lg:flex items-center gap-3 mr-1 font-mono text-[11px] text-[#8f8f8f]"
          aria-label="Clock and session timer"
        >
          <span title="Local time">{clock}</span>
          <span className="text-[#2a2a2a]">·</span>
          <span title="Session timer">{session}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#101010]"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen().catch(() => {});
            }}
            aria-label="Toggle fullscreen"
            title="Fullscreen"
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#9a9a9a] hover:text-white hover:bg-[#101010]"
            onClick={() => openModal("settings")}
            aria-label="Open settings"
            title="Settings"
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
