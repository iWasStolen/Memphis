"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUI, useSettings, applyCloak } from "@/lib/store";
import {
  AppSettings,
  CLOAK_PRESETS,
  PANIC_PRESETS,
  TextSize,
  FontChoice,
  BgPattern,
} from "@/lib/types";
import { toast } from "sonner";
import {
  Palette,
  AppWindow,
  SquareArrowOutUpRight,
  Zap,
  SlidersHorizontal,
  MessageSquare,
  Globe,
  Database,
  Link2,
  Check,
} from "lucide-react";

type TabId =
  | "appearance"
  | "tab"
  | "window"
  | "panic"
  | "behavior"
  | "chat"
  | "browse"
  | "data"
  | "links";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette className="size-4" /> },
  { id: "tab", label: "Tab", icon: <AppWindow className="size-4" /> },
  { id: "window", label: "Window", icon: <SquareArrowOutUpRight className="size-4" /> },
  { id: "panic", label: "Panic", icon: <Zap className="size-4" /> },
  { id: "behavior", label: "Behavior", icon: <SlidersHorizontal className="size-4" /> },
  { id: "chat", label: "Chat", icon: <MessageSquare className="size-4" /> },
  { id: "browse", label: "Browse", icon: <Globe className="size-4" /> },
  { id: "data", label: "Data", icon: <Database className="size-4" /> },
  { id: "links", label: "Links", icon: <Link2 className="size-4" /> },
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-[#141414] last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-white">{label}</div>
        {hint && <div className="text-[11px] text-[#7a7a7a] mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
            value === o.value
              ? "bg-white text-black border-white"
              : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal() {
  const { modal, closeModal, openModal } = useUI();
  const { settings, set, reset } = useSettings();
  const [tab, setTab] = useState<TabId>("appearance");
  const [capturing, setCapturing] = useState(false);
  const open = modal === "settings";

  useEffect(() => {
    if (!open) setCapturing(false);
  }, [open]);

  /* panic hotkey capture */
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      let k = e.key;
      if (k === " ") k = "Space";
      if (/^[a-z]$/i.test(k)) k = k.toUpperCase();
      if (!["Control", "Alt", "Shift", "Meta"].includes(k)) {
        parts.push(k);
        set({ panicKey: parts.join("+") });
        setCapturing(false);
        toast.success(`Panic key set to ${parts.join("+")}`);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, set]);

  const launchAboutBlank = () => {
    try {
      const w = window.open("about:blank", "_blank");
      if (!w) {
        toast.error("Popup blocked — allow popups for this site first.");
        return;
      }
      const title = document.title;
      const icon =
        document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href ??
        "/memphis.svg";
      /* build the cloak document with DOM APIs — interpolating the
         (user-controlled) title/icon into document.write would let a
         crafted custom title break out and run same-origin script */
      const doc = w.document;
      doc.open();
      doc.write("<!doctype html><html><head></head><body></body></html>");
      doc.close();
      doc.title = title;
      const link = doc.createElement("link");
      link.rel = "icon";
      link.href = icon;
      doc.head.appendChild(link);
      const style = doc.createElement("style");
      style.textContent =
        "html,body{margin:0;height:100%;overflow:hidden;background:#000}" +
        "iframe{border:0;width:100%;height:100%}";
      doc.head.appendChild(style);
      const iframe = doc.createElement("iframe");
      iframe.src = location.href;
      doc.body.appendChild(iframe);
      toast.success("Launched Memphis in an about:blank window.");
    } catch {
      toast.error("Could not open the about:blank window.");
    }
  };

  const s = settings;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-2xl bg-[#050505] border-[#1f1f1f] text-white max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-[#141414]">
          <DialogTitle className="text-base">Settings</DialogTitle>
          <DialogDescription className="text-[#7a7a7a] text-xs">
            Preferences are stored locally in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row min-h-0 flex-1">
          {/* tab rail */}
          <nav
            className="sm:w-40 shrink-0 border-b sm:border-b-0 sm:border-r border-[#141414] p-2 flex sm:flex-col gap-1 overflow-x-auto"
            aria-label="Settings sections"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "bg-[#161616] text-white"
                    : "text-[#8f8f8f] hover:text-white hover:bg-[#0e0e0e]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>

          {/* panels */}
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {tab === "appearance" && (
              <section aria-label="Appearance settings">
                <Row label="Mode" hint="Base surface tone">
                  <ChoiceGroup
                    value={s.mode}
                    onChange={(v) => set({ mode: v })}
                    options={[
                      { value: "black", label: "Pure Black" },
                      { value: "graphite", label: "Graphite" },
                    ]}
                  />
                </Row>
                <Row label="Accent" hint="Interactive highlight tone (grayscale only)">
                  <ChoiceGroup
                    value={s.accent}
                    onChange={(v) => set({ accent: v })}
                    options={[
                      { value: "white", label: "White" },
                      { value: "ash", label: "Ash" },
                      { value: "silver", label: "Silver" },
                      { value: "bone", label: "Bone" },
                    ]}
                  />
                </Row>
                <Row label="Background" hint="Faint backdrop pattern">
                  <ChoiceGroup
                    value={s.bg}
                    onChange={(v) => set({ bg: v as BgPattern })}
                    options={[
                      { value: "none", label: "None" },
                      { value: "grid", label: "Grid" },
                      { value: "dots", label: "Dots" },
                      { value: "scan", label: "Scanlines" },
                    ]}
                  />
                </Row>
                <Row label="Font" hint="Interface typeface">
                  <ChoiceGroup
                    value={s.font}
                    onChange={(v) => set({ font: v as FontChoice })}
                    options={[
                      { value: "sans", label: "Default" },
                      { value: "mono", label: "Mono" },
                      { value: "serif", label: "Serif" },
                    ]}
                  />
                </Row>
                <Row label="Text size">
                  <ChoiceGroup
                    value={s.textSize}
                    onChange={(v) => set({ textSize: v as TextSize })}
                    options={[
                      { value: "xs", label: "XS" },
                      { value: "sm", label: "S" },
                      { value: "md", label: "Default" },
                      { value: "lg", label: "L" },
                      { value: "xl", label: "XL" },
                    ]}
                  />
                </Row>
                <Row
                  label="Reduce effects"
                  hint="Stops animations and transitions"
                >
                  <Switch
                    checked={s.reduceEffects}
                    onCheckedChange={(v) => set({ reduceEffects: v })}
                    aria-label="Reduce effects"
                  />
                </Row>
              </section>
            )}

            {tab === "tab" && (
              <section aria-label="Tab cloaking settings">
                <Row
                  label="Tab cloak"
                  hint="Disguise the tab title and favicon"
                >
                  <div />
                </Row>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 py-3 border-b border-[#141414]">
                  {CLOAK_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        set({ cloakId: p.id });
                        applyCloak({ ...s, cloakId: p.id });
                        toast.success(`Cloaked as ${p.label}`);
                      }}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs transition-colors ${
                        s.cloakId === p.id
                          ? "border-white bg-[#141414] text-white"
                          : "border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.favicon}
                        alt=""
                        className="size-4 rounded-sm"
                        onError={(e) =>
                          ((e.target as HTMLImageElement).style.visibility =
                            "hidden")
                        }
                      />
                      <span className="truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
                <Row
                  label="Custom title"
                  hint="Used when cloak is set to custom"
                >
                  <Input
                    value={s.customTitle}
                    onChange={(e) => set({ customTitle: e.target.value })}
                    placeholder="e.g. Cell Biology — Notes"
                    className="w-56 bg-[#050505] border-[#262626]"
                  />
                </Row>
                <Row
                  label="Custom favicon URL"
                  hint="https:// link to an .ico or .png"
                >
                  <Input
                    value={s.customIcon}
                    onChange={(e) => set({ customIcon: e.target.value })}
                    placeholder="https://example.com/favicon.ico"
                    className="w-56 bg-[#050505] border-[#262626]"
                  />
                </Row>
                <div className="flex justify-end py-3 border-b border-[#141414]">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#262626] text-[#9a9a9a] hover:text-white"
                    onClick={() => {
                      set({ cloakId: "custom" });
                      applyCloak({ ...s, cloakId: "custom" });
                      toast.success("Custom cloak applied");
                    }}
                  >
                    Apply custom cloak
                  </Button>
                </div>
                <Row
                  label="Auto-switch"
                  hint="Cloak automatically when you switch away from this tab"
                >
                  <Switch
                    checked={s.autoCloak}
                    onCheckedChange={(v) => set({ autoCloak: v })}
                    aria-label="Auto cloak on blur"
                  />
                </Row>
              </section>
            )}

            {tab === "window" && (
              <section aria-label="Window settings" className="space-y-3 py-3">
                <p className="text-xs text-[#8f8f8f] leading-relaxed">
                  Open Memphis inside an <span className="text-white">about:blank</span>{" "}
                  window. The address bar and history entry stay blank, and your
                  current cloak is applied to the new window.
                </p>
                <Button
                  onClick={launchAboutBlank}
                  className="bg-white text-black hover:bg-[#e0e0e0]"
                >
                  <SquareArrowOutUpRight className="size-4 mr-2" />
                  Launch in about:blank
                </Button>
                <div className="text-[11px] text-[#666] pt-2 border-t border-[#141414]">
                  Note: if nothing happens, allow popups for this site and try
                  again.
                </div>
              </section>
            )}

            {tab === "panic" && (
              <section aria-label="Panic settings">
                <Row
                  label="Panic hotkey"
                  hint="Instantly replaces this page with the panic URL"
                >
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#262626] text-[#9a9a9a] hover:text-white font-mono"
                      onClick={() => setCapturing(true)}
                    >
                      {capturing ? "Press keys… Esc to cancel" : s.panicKey || "Set hotkey"}
                    </Button>
                    {s.panicKey && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[#7a7a7a] hover:text-white"
                        onClick={() => set({ panicKey: "" })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </Row>
                <Row label="Panic URL" hint="Where the panic key sends you">
                  <div className="flex flex-col gap-2 items-end">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {PANIC_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => set({ panicUrl: p.url })}
                          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                            s.panicUrl === p.url
                              ? "border-white text-white"
                              : "border-[#262626] text-[#9a9a9a] hover:text-white"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={s.panicUrl}
                      onChange={(e) => set({ panicUrl: e.target.value })}
                      placeholder="https://classroom.google.com/"
                      className="w-64 bg-[#050505] border-[#262626]"
                    />
                  </div>
                </Row>
                <div className="flex justify-end py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#262626] text-[#9a9a9a] hover:text-white"
                    onClick={() => {
                      if (!/^https?:\/\//.test(s.panicUrl)) {
                        toast.error("Panic URL must start with https://");
                        return;
                      }
                      window.location.replace(s.panicUrl);
                    }}
                  >
                    <Zap className="size-3.5 mr-1.5" />
                    Test panic
                  </Button>
                </div>
              </section>
            )}

            {tab === "behavior" && (
              <section aria-label="Behavior settings">
                <Row
                  label="Close protection"
                  hint="Warn before closing the tab"
                >
                  <Switch
                    checked={s.closeProtection}
                    onCheckedChange={(v) => set({ closeProtection: v })}
                    aria-label="Close protection"
                  />
                </Row>
                <Row
                  label="Skip loading screen"
                  hint="Skip the boot animation on launch"
                >
                  <Switch
                    checked={s.skipLoading}
                    onCheckedChange={(v) => set({ skipLoading: v })}
                    aria-label="Skip loading screen"
                  />
                </Row>
              </section>
            )}

            {tab === "chat" && (
              <section aria-label="Chat settings">
                <Row
                  label="Show chat button"
                  hint="Floating shortcut to the chat room"
                >
                  <Switch
                    checked={s.showChatFab}
                    onCheckedChange={(v) => set({ showChatFab: v })}
                    aria-label="Show floating chat button"
                  />
                </Row>
                <div className="py-3 text-xs text-[#8f8f8f]">
                  Activity visibility and further chat controls are available
                  inside the Chat section under account settings.
                </div>
              </section>
            )}

            {tab === "browse" && (
              <section aria-label="Proxy engine settings">
                <Row label="Engine" hint="Scramjet 1.1.0 — interception web proxy">
                  <span className="inline-flex items-center gap-1.5 text-xs text-white border border-white px-2 py-1 rounded-md">
                    <Check className="size-3" /> Scramjet
                  </span>
                </Row>
                <Row
                  label="Transport"
                  hint="How proxied traffic reaches the wisp relay. Epoxy is the default; libcurl impersonates a desktop browser's TLS fingerprint."
                >
                  <ChoiceGroup
                    value={s.transport}
                    onChange={(v) => {
                      set({ transport: v });
                      toast.success(
                        v === "epoxy"
                          ? "Transport switched to epoxy (default)"
                          : "Transport switched to libcurl"
                      );
                    }}
                    options={[
                      { value: "epoxy", label: "Epoxy (default)" },
                      { value: "libcurl", label: "libcurl" },
                    ]}
                  />
                </Row>
                <Row label="Search engine" hint="Used by the address bar for queries">
                  <ChoiceGroup
                    value={s.searchEngine}
                    onChange={(v) => set({ searchEngine: v })}
                    options={[
                      { value: "duckduckgo", label: "DuckDuckGo" },
                      { value: "google", label: "Google" },
                      { value: "bing", label: "Bing" },
                      { value: "brave", label: "Brave" },
                    ]}
                  />
                </Row>
                <div className="py-3 text-[11px] text-[#666] leading-relaxed border-t border-[#141414]">
                  Traffic flows browser → Scramjet service worker → transport (epoxy or
                  libcurl) → self-hosted wisp relay → destination site. Sites render fully
                  with JavaScript, WebSockets and logins. The transport applies to new
                  connections; pages already open keep their existing connection.
                </div>
              </section>
            )}

            {tab === "data" && (
              <section aria-label="Data settings" className="space-y-3 py-3">
                <div className="text-xs text-[#8f8f8f] leading-relaxed">
                  Clear locally stored preferences, favorites, history,
                  playlists and saved items. Your chat account is not affected.
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#262626] text-[#9a9a9a] hover:text-white"
                    onClick={() => {
                      const keep = localStorage.getItem("memphis-token");
                      localStorage.clear();
                      if (keep) localStorage.setItem("memphis-token", keep);
                      toast.success("Local data cleared. Reloading…");
                      setTimeout(() => location.reload(), 800);
                    }}
                  >
                    Clear local data
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#262626] text-[#9a9a9a] hover:text-white"
                    onClick={() => {
                      reset();
                      toast.success("Settings restored to defaults");
                    }}
                  >
                    Reset settings
                  </Button>
                </div>
              </section>
            )}

            {tab === "links" && (
              <section aria-label="Links" className="py-3 space-y-2">
                {[
                  { label: "Terms of Service", modal: "legal-tos" as const },
                  { label: "Privacy Policy", modal: "legal-privacy" as const },
                  { label: "DMCA", modal: "legal-dmca" as const },
                  { label: "Credits", modal: "credits" as const },
                ].map((l) => (
                  <button
                    key={l.label}
                    onClick={() => openModal(l.modal)}
                    className="block w-full text-left text-sm text-[#9a9a9a] hover:text-white u-link py-1"
                  >
                    {l.label}
                  </button>
                ))}
                <div className="pt-3 mt-1 border-t border-[#141414] text-[11px] text-[#666] leading-relaxed">
                  Memphis unBLACKed is an independent project. It is not
                  affiliated with any school, district or exam board.
                </div>
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { AppSettings };
