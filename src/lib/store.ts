"use client";

/* ============================================================
   Client state: settings (persisted), UI state, local storage
   ============================================================ */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  CLOAK_PRESETS,
  ViewId,
} from "./types";

/* ---------------- Settings store ---------------- */

interface SettingsState {
  settings: AppSettings;
  set: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      set: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: "memphis-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/* Apply settings to the document element */
export function applySettings(s: AppSettings) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.mode = s.mode;
  el.dataset.accent = s.accent;
  el.dataset.bg = s.bg;
  el.dataset.reducefx = s.reduceEffects ? "1" : "0";
  el.dataset.font = s.font;
  el.dataset.textsize = s.textSize;
}

/* Apply cloak (tab title + favicon) */
export function applyCloak(s: AppSettings) {
  if (typeof document === "undefined") return;
  const preset =
    CLOAK_PRESETS.find((p) => p.id === s.cloakId) ?? CLOAK_PRESETS[0];
  const custom = s.cloakId === "custom";
  document.title = custom && s.customTitle ? s.customTitle : preset.title;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  const href = custom && s.customIcon ? s.customIcon : preset.favicon;
  if (link.href !== href) link.href = href;
}

/* ---------------- UI store ---------------- */

type ModalState = "closed" | "settings" | "shortcuts" | "report" | "legal-tos" | "legal-privacy" | "legal-dmca" | "credits";

interface UIState {
  view: ViewId;
  setView: (v: ViewId) => void;
  modal: ModalState;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  bootDone: boolean;
  finishBoot: () => void;
  reportTarget: { kind: string; target: string } | null;
  setReportTarget: (t: { kind: string; target: string } | null) => void;
  /** url to open through the proxy in the Browse view (set by Apps/Listen/Watch) */
  proxyTarget: { url: string; nonce: number } | null;
  openInProxy: (url: string) => void;
  clearProxyTarget: () => void;
  /** scramjet engine status, managed by the app shell */
  proxyState: "idle" | "loading" | "ready" | "error";
  setProxyState: (s: "idle" | "loading" | "ready" | "error", err?: string) => void;
  proxyError: string;
  /** which part failed — the engine itself or the network transport */
  proxyStage: "engine" | "transport";
  setProxyMeta: (stage: "engine" | "transport", diag?: string) => void;
  /** bump to make the shell retry the proxy boot */
  proxyRetryNonce: number;
  retryProxy: () => void;
  /** one-line environment diagnostics for the error screen */
  proxyDiag: string;
}

export const useUI = create<UIState>()((set) => ({
  view: "home",
  setView: (v) => set({ view: v, modal: "closed" }),
  modal: "closed",
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: "closed" }),
  bootDone: false,
  finishBoot: () => set({ bootDone: true }),
  reportTarget: null,
  setReportTarget: (t) => set({ reportTarget: t }),
  proxyTarget: null,
  openInProxy: (url) =>
    set({ proxyTarget: { url, nonce: Date.now() }, view: "browse", modal: "closed" }),
  clearProxyTarget: () => set({ proxyTarget: null }),
  proxyState: "idle",
  proxyError: "",
  setProxyState: (s, err = "") => set({ proxyState: s, proxyError: err }),
  proxyStage: "engine",
  setProxyMeta: (stage, diag = "") => set({ proxyStage: stage, ...(diag ? { proxyDiag: diag } : {}) }),
  proxyRetryNonce: 0,
  retryProxy: () =>
    set((s) => ({ proxyRetryNonce: s.proxyRetryNonce + 1, proxyState: "loading", proxyError: "" })),
  proxyDiag: "",
}));

/* ---------------- Local storage helpers ---------------- */

export function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

/* ---------------- Favorites / recent (games, watch) ---------------- */

export function useLocalList(key: string, limit = 200) {
  const list = lsGet<string[]>(key, []);
  const push = (id: string) => {
    const cur = lsGet<string[]>(key, []).filter((x) => x !== id);
    cur.unshift(id);
    lsSet(key, cur.slice(0, limit));
  };
  const toggle = (id: string) => {
    const cur = lsGet<string[]>(key, []);
    if (cur.includes(id)) lsSet(key, cur.filter((x) => x !== id));
    else push(id);
  };
  const remove = (id: string) => {
    lsSet(key, lsGet<string[]>(key, []).filter((x) => x !== id));
  };
  return { list, push, toggle, remove };
}

/* ---------------- Anonymous AI session id ---------------- */

const AI_SESSION_KEY = "memphis-ai-session";

export function aiSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(AI_SESSION_KEY);
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    const rand =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    id = ("s" + rand).slice(0, 40);
    window.localStorage.setItem(AI_SESSION_KEY, id);
  }
  return id;
}

/* ---------------- Auth token helpers ---------------- */

const TOKEN_KEY = "memphis-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const token = getToken();
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* non-json */
    }
    return { ok: res.ok, status: res.status, data: data as T };
  } catch {
    /* network failure / offline — callers get a uniform {ok:false}
       instead of an unhandled rejection that sticks busy-states */
    return { ok: false, status: 0, data: null as T };
  }
}

/* ---------------- Session timer ---------------- */

export function useSessionStart() {
  useEffect(() => {
    if (!window.localStorage.getItem("memphis-session-start")) {
      window.localStorage.setItem(
        "memphis-session-start",
        String(Date.now())
      );
    }
  }, []);
}
