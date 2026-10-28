/* ============================================================
   Shared types for Memphis unBLACKed
   ============================================================ */

export type ViewId =
  | "home"
  | "play"
  | "apps"
  | "chat"
  | "ai"
  | "listen"
  | "watch"
  | "browse";

export const VIEWS: { id: ViewId; label: string; desc: string }[] = [
  { id: "home", label: "Home", desc: "Dashboard" },
  { id: "play", label: "Play", desc: "2700+ games" },
  { id: "apps", label: "Apps", desc: "50 web apps" },
  { id: "chat", label: "Chat", desc: "Community" },
  { id: "ai", label: "AI", desc: "GLM chat — free, unlimited" },
  { id: "listen", label: "Listen", desc: "Spotify" },
  { id: "watch", label: "Watch", desc: "YouTube" },
  { id: "browse", label: "Browse", desc: "Scramjet web proxy" },
];

/* ---------------- Proxy ---------------- */

export type ProxyTransport = "epoxy" | "libcurl";

/* ---------------- Settings ---------------- */

export interface CloakPreset {
  id: string;
  label: string;
  title: string;
  favicon: string;
}

export const CLOAK_PRESETS: CloakPreset[] = [
  { id: "none", label: "None (Memphis)", title: "Memphis unBLACKed", favicon: "/memphis.svg" },
  {
    id: "google",
    label: "Google",
    title: "Google",
    favicon: "https://www.google.com/favicon.ico",
  },
  {
    id: "classroom",
    label: "Google Classroom",
    title: "Home",
    favicon: "https://ssl.gstatic.com/classroom/favicon.png",
  },
  {
    id: "drive",
    label: "Google Drive",
    title: "My Drive - Google Drive",
    favicon: "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png",
  },
  {
    id: "docs",
    label: "Google Docs",
    title: "Untitled document - Google Docs",
    favicon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico",
  },
  {
    id: "canvas",
    label: "Canvas",
    title: "Dashboard",
    favicon: "https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico",
  },
  {
    id: "clever",
    label: "Clever",
    title: "Clever | Portal",
    favicon: "https://cdn.clever.com/images/icons/favicon.ico",
  },
  {
    id: "khan",
    label: "Khan Academy",
    title: "Khan Academy | Free Online Courses, Lessons & Practice",
    favicon: "https://cdn.kastatic.org/images/favicon.ico",
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    title: "Wikipedia, the free encyclopedia",
    favicon: "https://www.wikipedia.org/static/favicon/wikipedia.ico",
  },
];

export const PANIC_PRESETS = [
  { id: "classroom", label: "Google Classroom", url: "https://classroom.google.com/" },
  { id: "docs", label: "Google Docs", url: "https://docs.google.com/" },
  { id: "google", label: "Google", url: "https://www.google.com/" },
  { id: "wikipedia", label: "Wikipedia", url: "https://www.wikipedia.org/" },
  { id: "gmail", label: "Gmail", url: "https://mail.google.com/" },
];

export type TextSize = "xs" | "sm" | "md" | "lg" | "xl";
export type FontChoice = "sans" | "mono" | "serif";
export type BgPattern = "none" | "grid" | "dots" | "scan";

export interface AppSettings {
  mode: "black" | "graphite";
  accent: "white" | "ash" | "silver" | "bone";
  bg: BgPattern;
  reduceEffects: boolean;
  font: FontChoice;
  textSize: TextSize;
  cloakId: string;
  customTitle: string;
  customIcon: string;
  autoCloak: boolean;
  panicKey: string;
  panicUrl: string;
  closeProtection: boolean;
  skipLoading: boolean;
  showChatFab: boolean;
  transport: ProxyTransport;
  searchEngine: "duckduckgo" | "google" | "bing" | "brave";
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "black",
  accent: "white",
  bg: "none",
  reduceEffects: false,
  font: "sans",
  textSize: "md",
  cloakId: "none",
  customTitle: "",
  customIcon: "",
  autoCloak: false,
  panicKey: "",
  panicUrl: "https://classroom.google.com/",
  closeProtection: false,
  skipLoading: false,
  showChatFab: true,
  transport: "epoxy",
  searchEngine: "duckduckgo",
};

export const SEARCH_ENGINES: { id: AppSettings["searchEngine"]; label: string; url: string }[] = [
  { id: "duckduckgo", label: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { id: "google", label: "Google", url: "https://www.google.com/search?q=%s" },
  { id: "bing", label: "Bing", url: "https://www.bing.com/search?q=%s" },
  { id: "brave", label: "Brave", url: "https://search.brave.com/search?q=%s" },
];

/* ---------------- Auth / user ---------------- */

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  displayName: string | null;
  bio: string;
  status: string;
  avatarUrl: string | null;
  xp: number;
  coins: number;
  streak: number;
  mutedUntil: string | null;
  banned: boolean;
  dmPolicy: string;
  createdAt: string;
}

/* ---------------- Games ---------------- */

export type GameCategory = "arcade" | "puzzle" | "classic" | "action" | "casual" | string;

/** A game as served by /api/games (catalog + builtins merged). */
export interface GameDef {
  id: string;
  name: string;
  desc: string;
  /** embed url for external games, empty for builtins */
  url?: string;
  category: string;
  tags?: string[];
  thumb?: string;
  width?: number;
  height?: number;
  /** true when rendered by the built-in player components */
  builtin?: boolean;
  hasScore?: boolean;
  scoreLabel?: string;
}

/* ---------------- Chat ---------------- */

export interface ChatMessage {
  id: string;
  channelId?: string | null;
  dmKey?: string | null;
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
  content: string;
  isSystem?: boolean;
  poll?: PollData | null;
  deleted?: boolean;
  createdAt: string;
}

export interface PollData {
  question: string;
  options: { text: string; voters: string[] }[];
  endsAt: number;
  multivote?: boolean;
}

export interface ChannelInfo {
  id: string;
  name: string;
  topic: string;
  kind: string;
  isPrivate: boolean;
  locked: boolean;
  memberCount?: number;
}

export interface ChatUserSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  role: string;
  online?: boolean;
}
