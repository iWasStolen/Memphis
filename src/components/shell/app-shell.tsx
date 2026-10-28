"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useUI, useSettings, applySettings, applyCloak } from "@/lib/store";
import { bootProxy, setProxyTransport } from "@/lib/scramjet";
import { Header, Wordmark } from "./header";
import { Footer } from "./footer";
import { SettingsModal } from "./settings-modal";
import { ReportModal } from "./report-modal";
import { LegalModals } from "./legal-modals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, Keyboard } from "lucide-react";

const HomeView = dynamic(() => import("@/components/views/home-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const PlayView = dynamic(() => import("@/components/views/play-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const AppsView = dynamic(() => import("@/components/views/apps-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const ChatView = dynamic(() => import("@/components/views/chat-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const AiView = dynamic(() => import("@/components/views/ai-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const ListenView = dynamic(() => import("@/components/views/listen-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const WatchView = dynamic(() => import("@/components/views/watch-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const BrowseView = dynamic(() => import("@/components/views/browse-view"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});

function ViewSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-52 shimmer rounded-md" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 shimmer rounded-lg border border-[#141414]" />
        ))}
      </div>
    </div>
  );
}

/* ---------------- Boot screen ---------------- */

function BootScreen() {
  const { finishBoot, bootDone } = useUI();
  useEffect(() => {
    const t = setTimeout(finishBoot, 1400);
    return () => clearTimeout(t);
  }, [finishBoot]);
  if (bootDone) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-6"
      role="status"
      aria-label="Loading Memphis unBLACKed"
    >
      <div className="text-center">
        <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          MEMPHIS{" "}
          <span className="text-[#8f8f8f] font-normal">
            un<span className="line-through decoration-[#555]">BLACK</span>ed
          </span>
        </div>
        <div className="mono-label mt-3 boot-pulse">initializing study portal</div>
      </div>
      <div className="w-56 h-[3px] bg-[#141414] overflow-hidden rounded-full">
        <div
          className="h-full w-full bg-white"
          style={{ animation: "boot-bar 1.3s ease-out forwards" }}
        />
      </div>
    </div>
  );
}

/* ---------------- Shortcuts modal ---------------- */

function ShortcutsModal() {
  const { modal, closeModal } = useUI();
  const rows: [string, string][] = [
    ["Alt + 1 … 8", "Switch section"],
    ["Shift + /", "Toggle this shortcut list"],
    ["Ctrl + Shift + F", "Toggle fullscreen"],
    ["Ctrl + L (in Browse)", "Focus the address bar"],
    ["Esc", "Close dialogs and menus"],
    ["Panic hotkey", "Instantly leave (set in Settings)"],
  ];
  return (
    <Dialog open={modal === "shortcuts"} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Move around without the mouse.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-[#141414]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2">
              <span className="text-[13px] text-[#c9c9c9]">{v}</span>
              <kbd className="font-mono text-[11px] border border-[#262626] rounded px-1.5 py-0.5 text-[#9a9a9a]">
                {k}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Main shell ---------------- */

export default function AppShell() {
  const { view, setView, modal, openModal, bootDone, finishBoot, setProxyState } = useUI();
  const settings = useSettings((s) => s.settings);
  const [hydrated, setHydrated] = useState(false);

  /* hydrate settings from localStorage (zustand persist does this; flag when ready) */
  useEffect(() => {
    setHydrated(true);
  }, []);

  /* boot the Scramjet engine (service worker + controller) */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setProxyState("loading");
    (async () => {
      try {
        await bootProxy();
        await setProxyTransport(settings.transport);
        if (!cancelled) {
          setProxyState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setProxyState(
            "error",
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /* apply the transport setting whenever it changes after boot */
  useEffect(() => {
    if (!hydrated) return;
    setProxyTransport(settings.transport).catch(() => {});
  }, [hydrated, settings.transport]);

  /* apply settings to DOM whenever they change */
  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  /* apply cloak on mount + when changed */
  useEffect(() => {
    applyCloak(settings);
  }, [settings.cloakId, settings.customTitle, settings.customIcon]); // eslint-disable-line react-hooks/exhaustive-deps

  /* skip boot if configured */
  useEffect(() => {
    if (hydrated && settings.skipLoading && !bootDone) finishBoot();
  }, [hydrated, settings.skipLoading, bootDone, finishBoot]);

  /* panic hotkey */
  useEffect(() => {
    if (!settings.panicKey) return;
    const combo = settings.panicKey.split("+");
    const main = combo[combo.length - 1].toLowerCase();
    const needCtrl = combo.includes("Ctrl");
    const needAlt = combo.includes("Alt");
    const needShift = combo.includes("Shift");
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const key = e.key === " " ? "space" : e.key.toLowerCase();
      if (
        key === main &&
        e.ctrlKey === needCtrl &&
        e.altKey === needAlt &&
        e.shiftKey === needShift
      ) {
        e.preventDefault();
        const url = /^https?:\/\//.test(settings.panicUrl)
          ? settings.panicUrl
          : "https://classroom.google.com/";
        window.location.replace(url);
      }
      void typing;
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [settings.panicKey, settings.panicUrl]);

  /* auto-cloak on blur */
  useEffect(() => {
    if (!settings.autoCloak) return;
    const onVis = () => {
      if (document.hidden) applyCloak({ ...settings, cloakId: settings.cloakId === "none" ? "classroom" : settings.cloakId });
      else applyCloak(settings);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [settings]);

  /* close protection */
  useEffect(() => {
    if (!settings.closeProtection) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [settings.closeProtection]);

  /* global keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.altKey && !e.ctrlKey && !e.shiftKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const order = [
          "home", "play", "apps", "chat", "ai", "listen", "watch", "browse",
        ] as const;
        setView(order[Number(e.key) - 1]);
        return;
      }
      if (e.key === "?" && !typing) {
        e.preventDefault();
        openModal("shortcuts");
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setView, openModal]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white relative">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-1.5 focus:rounded-md focus:text-sm"
      >
        Skip to content
      </a>
      <BootScreen />
      <Header />
      <main id="main" className="flex-1 flex flex-col min-h-0 relative z-[1]">
        {view === "home" && <HomeView />}
        {view === "play" && <PlayView />}
        {view === "apps" && <AppsView />}
        {view === "chat" && <ChatView />}
        {view === "ai" && <AiView />}
        {view === "listen" && <ListenView />}
        {view === "watch" && <WatchView />}
        {view === "browse" && <BrowseView />}
      </main>
      <Footer />

      {settings.showChatFab && view !== "chat" && (
        <Button
          onClick={() => setView("chat")}
          size="icon"
          aria-label="Open chat"
          title="Chat"
          className="fixed bottom-5 right-5 z-30 size-11 rounded-full bg-white text-black hover:bg-[#e0e0e0] shadow-[0_0_0_1px_#000,0_8px_24px_rgba(0,0,0,0.6)]"
        >
          <MessageSquare className="size-5" />
        </Button>
      )}

      <SettingsModal />
      <ReportModal />
      <LegalModals />
      <ShortcutsModal />
    </div>
  );
}
