"use client";

/* ============================================================
   Memphis chat — auth gate, channels, DMs, groups, presence,
   polls, coins, moderation.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSocket, useAuth, emitAck, destroySocket } from "@/lib/socket";
import { api, getToken, setToken, useUI } from "@/lib/store";
import { ChatMessage, ChannelInfo, ChatUserSummary, SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Send,
  Hash,
  Lock,
  Users as UsersIcon,
  Plus,
  Trophy,
  Volume2,
  Shield,
  UserPlus,
  LogOut,
  Coins,
  Flame,
  BarChart3,
  Vote,
  Trash2,
  UserRound,
  MessageSquare,
  GitBranch,
} from "lucide-react";
import {
  LeaderboardDialog,
  ProfileDialog,
  ModDialog,
  SoundboardDialog,
  FriendsDialog,
  CreateChannelDialog,
  JoinChannelDialog,
  CreateGroupDialog,
  playLocalSound,
} from "./chat-panels";

const RULES_KEY = "memphis-chat-rules-agreed";

const RULES = [
  "No personal information — yours or anyone else's.",
  "Be respectful; no harassment, hate speech or bullying.",
  "Keep it school-safe: no NSFW, violent or illegal content.",
  "No spam, flooding, scams or advertising.",
  "No impersonation of staff or other members.",
  "Respect staff decisions; appeal through #appeals if needed.",
  "Use channels for their purpose (counting = numbers only).",
  "Report problems with the footer link — staff will review.",
];

/* ---------------- auth panel ---------------- */

function AuthPanel() {
  const setUser = useAuth((s) => s.setUser);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await api<{
      token?: string;
      user?: SessionUser;
      error?: string;
    }>(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ username, password, recoveryCode: recovery || undefined }),
    });
    setBusy(false);
    if (!r.ok || !r.data.token || !r.data.user) {
      setError(r.data.error || "Something went wrong — try again.");
      return;
    }
    setToken(r.data.token);
    setUser(r.data.user);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-white">Study groups</h1>
          <p className="text-[13px] text-[#8f8f8f] mt-1">
            Register with any username — no email needed. Your account earns XP,
            coins and streaks.
          </p>
        </div>

        <div className="rounded-xl border border-[#1f1f1f] bg-[#080808] p-5">
          <div className="flex rounded-lg border border-[#1f1f1f] overflow-hidden mb-4">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`flex-1 px-3 py-1.5 text-[13px] capitalize transition-colors ${
                  mode === m
                    ? "bg-white text-black"
                    : "text-[#9a9a9a] hover:bg-[#101010] hover:text-white"
                }`}
              >
                {m === "login" ? "Log in" : "Register"}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="chat-username" className="text-[12px] text-[#888]">
                Username
              </label>
              <Input
                id="chat-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="study_bear_42"
                maxLength={16}
                required
                className="mt-1 bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30"
              />
            </div>
            <div>
              <label htmlFor="chat-password" className="text-[12px] text-[#888]">
                Password
              </label>
              <Input
                id="chat-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "min 6 characters" : "••••••"}
                minLength={6}
                required
                className="mt-1 bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30"
              />
            </div>
            {mode === "register" && (
              <div>
                <label htmlFor="chat-recovery" className="text-[12px] text-[#888]">
                  Recovery code <span className="text-[#555]">(optional)</span>
                </label>
                <Input
                  id="chat-recovery"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  placeholder="e.g. MY-CODE-2026"
                  maxLength={32}
                  className="mt-1 bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30"
                />
                <p className="text-[11px] text-[#555] mt-1">
                  If you lose your password, staff can verify this code.
                </p>
              </div>
            )}
            {error && (
              <p className="text-[12px] text-white bg-[#161616] border border-[#333] rounded px-2.5 py-1.5">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy || !username.trim() || password.length < 6}
              className="w-full bg-white text-black hover:bg-[#e0e0e0]"
            >
              {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-[#555] text-center mt-4 leading-relaxed">
          By joining you agree to keep the chat school-appropriate. Moderators
          can mute or ban accounts that break the rules.
        </p>
      </div>
    </div>
  );
}

/* ---------------- rules gate ---------------- */

function RulesGate({ onAgree }: { onAgree: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-[#1f1f1f] bg-[#080808] p-6">
        <h2 className="text-base font-semibold text-white mb-1">Community rules</h2>
        <p className="text-[12px] text-[#777] mb-4">
          Read them once — then you&apos;re in.
        </p>
        <ol className="space-y-2.5 mb-5">
          {RULES.map((r, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] text-[#c9c9c9]">
              <span className="font-mono text-[11px] text-[#555] mt-0.5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              {r}
            </li>
          ))}
        </ol>
        <label className="flex items-start gap-2.5 text-[13px] text-[#c9c9c9] mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 accent-white"
          />
          I agree to follow these rules.
        </label>
        <Button
          onClick={onAgree}
          disabled={!checked}
          className="w-full bg-white text-black hover:bg-[#e0e0e0]"
        >
          I Agree &amp; Continue
        </Button>
      </div>
    </div>
  );
}

/* ---------------- message bubble ---------------- */

function MessageBubble({
  m,
  me,
  onProfile,
  onDelete,
  onVote,
}: {
  m: ChatMessage;
  me: SessionUser | null;
  onProfile: (u: string) => void;
  onDelete: (id: string) => void;
  onVote: (messageId: string, optionIndex: number) => void;
}) {
  const poll = m.poll;
  const ended = poll && poll.endsAt < Date.now();
  const totalVotes = poll
    ? poll.options.reduce((a, o) => a + o.voters.length, 0)
    : 0;
  const isStaff = me && ["owner", "admin", "mod"].includes(me.role);

  if (m.isSystem || m.deleted) {
    return (
      <div className="text-center py-1">
        <span className="text-[11.5px] text-[#666] bg-[#0a0a0a] border border-[#161616] rounded-full px-3 py-1 inline-block">
          {m.deleted ? "message deleted" : m.content}
        </span>
      </div>
    );
  }

  return (
    <div className="group flex gap-2.5 px-1 py-1 hover:bg-[#0a0a0a] rounded-md">
      <button
        onClick={() => onProfile(m.username)}
        aria-label={`View ${m.username}`}
        className="size-8 shrink-0 rounded-full border border-[#262626] flex items-center justify-center text-[11px] font-mono text-white hover:border-white transition-colors"
      >
        {(m.displayName || m.username).slice(0, 2).toUpperCase()}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button
            onClick={() => onProfile(m.username)}
            className="text-[13px] text-white font-medium hover:underline"
          >
            {m.displayName || m.username}
          </button>
          {m.role && m.role !== "member" && (
            <span className="text-[10px] font-mono uppercase border border-[#2a2a2a] rounded px-1 text-[#aaa]">
              {m.role}
            </span>
          )}
          <span className="text-[10.5px] text-[#555]">
            {new Date(m.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <p className="text-[13.5px] text-[#d5d5d5] whitespace-pre-wrap break-words mt-0.5">
          {m.content}
        </p>

        {poll && (
          <div className="mt-2 border border-[#1a1a1a] rounded-lg p-2.5 max-w-sm">
            <p className="text-[12px] text-[#999] flex items-center gap-1.5 mb-2">
              <Vote className="size-3" /> {poll.question}
              <span className="ml-auto text-[#555]">
                {ended ? "final" : `${Math.max(0, Math.round((poll.endsAt - Date.now()) / 60000))}m left`}
              </span>
            </p>
            {poll.options.map((o, i) => {
              const pct = totalVotes ? Math.round((o.voters.length / totalVotes) * 100) : 0;
              const voted = o.voters.includes(me?.id ?? "");
              return (
                <button
                  key={i}
                  disabled={!!ended}
                  onClick={() => onVote(m.id, i)}
                  className={`w-full text-left mb-1 last:mb-0 rounded border px-2 py-1.5 text-[12.5px] transition-colors ${
                    voted
                      ? "border-white text-white"
                      : "border-[#222] text-[#bbb] hover:border-[#444]"
                  }`}
                >
                  <span className="flex justify-between">
                    <span>{o.text}</span>
                    <span className="text-[#777] font-mono">
                      {pct}% ({o.voters.length})
                    </span>
                  </span>
                  <span className="block h-1 bg-[#1a1a1a] rounded-full mt-1 overflow-hidden">
                    <span
                      className="block h-full bg-white transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(isStaff || m.userId === me?.id) && (
        <button
          onClick={() => onDelete(m.id)}
          aria-label="Delete message"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-[#666] hover:text-white self-start"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------------- main view ---------------- */

type Room =
  | { type: "channel"; id: string; name: string }
  | { type: "dm"; key: string; name: string }
  | { type: "group"; key: string; name: string };

export default function ChatView() {
  const { user, setUser, logout } = useAuth();
  const { setView } = useUI();
  const [rulesAgreed, setRulesAgreed] = useState(true);
  const [connected, setConnected] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<string[]>([]);
  const [presence, setPresence] = useState<ChatUserSummary[]>([]);
  const [dmList, setDmList] = useState<{ key: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; memberIds: string[] }[]>([]);
  const [friendsKey, setFriendsKey] = useState(0);
  /* dialogs */
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showMod, setShowMod] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showJoinChannel, setShowJoinChannel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [profileUser, setProfileUser] = useState<string | null>(null);
  const [modUser, setModUser] = useState("");
  /* poll creator */
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMinutes, setPollMinutes] = useState(15);
  /* claim */
  const [claimBusy, setClaimBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedRef = useRef<string | null>(null);

  const isStaff = !!user && ["owner", "admin", "mod"].includes(user.role);

  /* ---------- boot: check session ---------- */
  useEffect(() => {
    const stored = getToken();
    setRulesAgreed(window.localStorage.getItem(RULES_KEY) === "1");
    if (!stored) {
      setUser(null);
      return;
    }
    void api<{ user: SessionUser | null }>("/api/auth/me").then((r) => {
      if (r.data.user) setUser(r.data.user);
      else {
        setToken(null);
        setUser(null);
      }
    });
  }, [setUser]);

  /* ---------- socket wiring ---------- */
  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    if (!s) return;

    const onAuthOk = (u: SessionUser) => {
      setUser(u);
      setConnected(true);
      s.emit("channels:list", (list: ChannelInfo[]) => setChannels(list));
      void emitAck<{ id: string; name: string; memberIds: string[] }[]>("group:list").then(
        (r) => {
          const d = r as { id: string; name: string; memberIds: string[] }[];
          if (Array.isArray(d)) setGroups(d);
        }
      );
    };
    const onAuthError = () => {
      setToken(null);
      setUser(null);
      destroySocket();
    };
    const onConnect = () => {
      setConnected(true);
      s.emit("channels:list", (list: ChannelInfo[]) => setChannels(list));
    };
    const onDisconnect = () => setConnected(false);
    const onMessage = (m: ChatMessage) => {
      if (
        (room?.type === "channel" && m.channelId === room.id) ||
        (room?.type !== "channel" && m.dmKey && m.dmKey === roomKeyOf(room))
      )
        setMessages((cur) => [...cur, m]);
    };
    const onUpdated = (m: ChatMessage) =>
      setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
    const onDeleted = (id: string) =>
      setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, deleted: true } : x)));
    const onCleared = () => setMessages([]);
    const onNotice = (text: string) => toast(text);
    const onTyping = (p: { username: string }) => {
      setTyping((t) => (t.includes(p.username) ? t : [...t, p.username]));
      setTimeout(() => setTyping((t) => t.filter((u) => u !== p.username)), 2500);
    };
    const onPresence = (list: ChatUserSummary[]) => setPresence(list);
    const onUserUpdate = (u: SessionUser) => {
      if (user && u.id === user.id) setUser(u);
    };
    const onIncoming = () => setFriendsKey((k) => k + 1);
    const onDmRefresh = () => setFriendsKey((k) => k + 1);
    const onSound = (p: { soundId: string; by: string }) => {
      playLocalSound(p.soundId);
      toast(`${p.by} played ${p.soundId}`);
    };
    const onInvited = () => {
      void emitAck<{ id: string; name: string; memberIds: string[] }[]>("group:list").then(
        (r) => {
          const d = r as { id: string; name: string; memberIds: string[] }[];
          if (Array.isArray(d)) setGroups(d);
        }
      );
      toast("You were added to a group");
    };

    s.on("auth:ok", onAuthOk);
    s.on("auth:error", onAuthError);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("chat:message", onMessage);
    s.on("chat:updated", onUpdated);
    s.on("chat:deleted", onDeleted);
    s.on("chat:cleared", onCleared);
    s.on("chat:notice", onNotice);
    s.on("chat:typing", onTyping);
    s.on("presence:list", onPresence);
    s.on("user:update", onUserUpdate);
    s.on("friends:incoming", onIncoming);
    s.on("dm:refresh", onDmRefresh);
    s.on("sound:play", onSound);
    s.on("group:invited", onInvited);

    if (s.connected) onConnect();

    return () => {
      s.off("auth:ok", onAuthOk);
      s.off("auth:error", onAuthError);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("chat:message", onMessage);
      s.off("chat:updated", onUpdated);
      s.off("chat:deleted", onDeleted);
      s.off("chat:cleared", onCleared);
      s.off("chat:notice", onNotice);
      s.off("chat:typing", onTyping);
      s.off("presence:list", onPresence);
      s.off("user:update", onUserUpdate);
      s.off("friends:incoming", onIncoming);
      s.off("dm:refresh", onDmRefresh);
      s.off("sound:play", onSound);
      s.off("group:invited", onInvited);
    };
  }, [user, room, setUser]);

  function roomKeyOf(r: Room | null): string | null {
    if (!r) return null;
    return r.type === "channel" ? null : r.key;
  }

  /* ---------- join room ---------- */
  const openChannel = useCallback(async (ch: ChannelInfo) => {
    setRoom({ type: "channel", id: ch.id, name: ch.name });
    const s = getSocket();
    if (!s) return;
    if (joinedRef.current?.startsWith("ch:")) s.emit("chat:leave", joinedRef.current.slice(3));
    if (joinedRef.current?.startsWith("dm:")) s.emit("dm:join", ""); /* leave handled by server rooms */
    s.emit("chat:join", ch.id, (res: { messages?: ChatMessage[]; error?: string }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setMessages(res.messages ?? []);
      joinedRef.current = "ch:" + ch.id;
    });
  }, []);

  const openDm = useCallback(async (username: string) => {
    const r = await emitAck<{
      key: string;
      target: { username: string };
      messages: ChatMessage[];
      error?: string;
    }>("dm:open", username);
    if (r.error || !r.key) {
      toast.error(r.error || "Could not open DM");
      return;
    }
    setRoom({ type: "dm", key: r.key, name: r.target.username });
    setMessages(r.messages ?? []);
    setDmList((cur) =>
      cur.find((d) => d.key === r.key)
        ? cur
        : [{ key: r.key, name: r.target.username }, ...cur].slice(0, 20)
    );
    setProfileUser(null);
    setShowFriends(false);
  }, []);

  const openGroup = useCallback(async (gid: string, name: string) => {
    const r = await emitAck<{
      key: string;
      members: ChatUserSummary[];
      messages: ChatMessage[];
      error?: string;
    }>("group:open", gid);
    if (r.error || !r.key) {
      toast.error(r.error || "Could not open group");
      return;
    }
    setRoom({ type: "group", key: r.key, name });
    setMessages(r.messages ?? []);
  }, []);

  /* auto-join first channel when connected */
  useEffect(() => {
    if (connected && channels.length && !room) void openChannel(channels[0]);
  }, [connected, channels, room, openChannel]);

  /* ---------- send ---------- */
  const send = async () => {
    const content = input.trim();
    if (!content || !room) return;
    setInput("");
    const payload =
      room.type === "channel"
        ? { channelId: room.id, content }
        : { dmKey: room.key, content };
    const r = await emitAck<{ ok?: boolean; error?: string; notice?: string }>(
      "chat:send",
      payload
    );
    if (r.error) toast.error(r.error);
    else if (r.notice) toast(r.notice);
  };

  const onInputChange = (v: string) => {
    setInput(v);
    if (room?.type === "channel") {
      const s = getSocket();
      if (s && (!typingTimer.current || Date.now() - 0 > 0)) {
        s.emit("chat:typing", room.id);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {}, 1200);
      }
    }
  };

  const votePoll = async (messageId: string, optionIndex: number) => {
    const r = await emitAck<{ ok?: boolean; error?: string }>("poll:vote", {
      messageId,
      optionIndex,
    });
    if (r.error) toast.error(r.error);
  };

  const createPoll = async () => {
    if (!room || room.type !== "channel") return;
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQ.trim() || options.length < 2) return;
    const r = await emitAck<{ ok?: boolean; error?: string }>("poll:create", {
      channelId: room.id,
      question: pollQ,
      options,
      minutes: pollMinutes,
    });
    if (r.error) toast.error(r.error);
    else {
      setPollOpen(false);
      setPollQ("");
      setPollOptions(["", ""]);
    }
  };

  const claim = async () => {
    setClaimBusy(true);
    const r = await emitAck<{ ok?: boolean; streak?: number; reward?: number; error?: string }>(
      "coins:claim"
    );
    setClaimBusy(false);
    if (r.error) toast.error(r.error);
    else toast(`Daily claim: +${r.reward} coins · streak ${r.streak} day${r.streak === 1 ? "" : "s"}`);
  };

  const deleteMessage = async (id: string) => {
    const r = await emitAck<{ ok?: boolean; error?: string }>("message:delete", id);
    if (r.error) toast.error(r.error);
  };

  const doLogout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    logout();
    setChannels([]);
    setRoom(null);
    setMessages([]);
    setConnected(false);
  };

  /* auto-scroll */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, typing]);

  /* ---------- render ---------- */
  if (!user) return <AuthPanel />;
  if (!rulesAgreed)
    return (
      <RulesGate
        onAgree={() => {
          window.localStorage.setItem(RULES_KEY, "1");
          setRulesAgreed(true);
        }}
      />
    );

  const currentChannel =
    room?.type === "channel" ? channels.find((c) => c.id === room.id) : null;
  const onlineCount = presence.length;

  return (
    <div className="flex-1 flex min-h-0">
      {/* sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-[#141414]">
        {/* account */}
        <div className="p-3 border-b border-[#141414]">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-full border border-[#262626] flex items-center justify-center text-[11px] font-mono text-white shrink-0">
              {(user.displayName || user.username).slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-white font-medium truncate">
                {user.displayName || user.username}
              </p>
              <p className="text-[10.5px] text-[#666] flex items-center gap-1">
                <Coins className="size-3" /> {user.coins.toLocaleString()}
                <Flame className="size-3 ml-1" /> {user.streak}
                <BarChart3 className="size-3 ml-1" /> {user.xp.toLocaleString()}
              </p>
            </div>
            <span
              className={`size-2 rounded-full ${connected ? "bg-white" : "bg-[#555]"}`}
              title={connected ? "connected" : "connecting…"}
            />
          </div>
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              onClick={() => void claim()}
              disabled={claimBusy}
              className="h-7 px-2 flex-1 bg-white text-black hover:bg-[#e0e0e0] text-[11px]"
            >
              <Coins className="size-3 mr-1" /> Daily
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void doLogout()}
              aria-label="Log out"
              className="h-7 px-2 text-[#888] hover:text-white"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* channels */}
        <div className="flex-1 overflow-y-auto memphis-scroll p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="mono-label">Channels</p>
            <div className="flex gap-0.5">
              <button
                onClick={() => setShowJoinChannel(true)}
                aria-label="Join private channel with code"
                className="p-1 text-[#777] hover:text-white"
              >
                <Hash className="size-3.5" />
              </button>
              <button
                onClick={() => setShowCreateChannel(true)}
                aria-label="Create private channel"
                className="p-1 text-[#777] hover:text-white"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => void openChannel(ch)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                room?.type === "channel" && room.id === ch.id
                  ? "bg-[#141414] text-white"
                  : "text-[#9a9a9a] hover:bg-[#0d0d0d] hover:text-white"
              }`}
            >
              {ch.isPrivate ? (
                <Lock className="size-3.5 shrink-0 text-[#666]" />
              ) : (
                <Hash className="size-3.5 shrink-0 text-[#666]" />
              )}
              <span className="truncate">{ch.name}</span>
              {ch.locked && <Lock className="size-3 ml-auto text-[#555]" />}
            </button>
          ))}

          {/* groups */}
          {groups.length > 0 && (
            <>
              <div className="flex items-center justify-between px-2 py-1 mt-2">
                <p className="mono-label">Groups</p>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  aria-label="Create group"
                  className="p-1 text-[#777] hover:text-white"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => void openGroup(g.id, g.name)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                    room?.type === "group" && room.key === "g:" + g.id
                      ? "bg-[#141414] text-white"
                      : "text-[#9a9a9a] hover:bg-[#0d0d0d] hover:text-white"
                  }`}
                >
                  <GitBranch className="size-3.5 shrink-0 text-[#666]" />
                  <span className="truncate">{g.name}</span>
                  <span className="ml-auto text-[10px] text-[#555]">
                    {g.memberIds.length}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* DMs */}
          {dmList.length > 0 && (
            <>
              <p className="mono-label px-2 py-1 mt-2">Direct messages</p>
              {dmList.map((d) => (
                <button
                  key={d.key}
                  onClick={() => void openDm(d.name)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                    room?.type === "dm" && room.key === d.key
                      ? "bg-[#141414] text-white"
                      : "text-[#9a9a9a] hover:bg-[#0d0d0d] hover:text-white"
                  }`}
                >
                  <UserRound className="size-3.5 shrink-0 text-[#666]" />
                  <span className="truncate">{d.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* footer tools */}
        <div className="p-2 border-t border-[#141414] grid grid-cols-2 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowFriends(true)} className="text-[#999] hover:text-white text-[12px] h-8">
            <UserPlus className="size-3.5 mr-1" /> Friends
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowLeaderboard(true)} className="text-[#999] hover:text-white text-[12px] h-8">
            <Trophy className="size-3.5 mr-1" /> Ranks
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowSoundboard(true)} className="text-[#999] hover:text-white text-[12px] h-8">
            <Volume2 className="size-3.5 mr-1" /> Sounds
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setModUser("");
              setShowMod(true);
            }}
            disabled={!isStaff}
            className="text-[#999] hover:text-white text-[12px] h-8 disabled:opacity-30"
          >
            <Shield className="size-3.5 mr-1" /> Mod
          </Button>
        </div>
      </aside>

      {/* main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* room header */}
        <div className="border-b border-[#141414] px-4 py-2.5 flex items-center gap-2">
          {room?.type === "channel" ? (
            <Hash className="size-4 text-[#777]" />
          ) : room?.type === "group" ? (
            <GitBranch className="size-4 text-[#777]" />
          ) : (
            <UserRound className="size-4 text-[#777]" />
          )}
          <h2 className="text-sm font-semibold text-white truncate">
            {room?.name ?? "…"}
          </h2>
          {currentChannel?.topic && (
            <p className="text-[12px] text-[#666] truncate hidden sm:block ml-2 border-l border-[#222] pl-2">
              {currentChannel.topic}
            </p>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#777]">
            <span className="size-1.5 rounded-full bg-white" />
            {onlineCount} online
          </span>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto memphis-scroll p-2 sm:p-3">
          {messages.length === 0 && (
            <p className="text-[13px] text-[#666] text-center mt-8">
              No messages yet — say hello.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              me={user}
              onProfile={setProfileUser}
              onDelete={(id) => void deleteMessage(id)}
              onVote={(mid, oi) => void votePoll(mid, oi)}
            />
          ))}
          {typing.length > 0 && (
            <p className="text-[11.5px] text-[#777] px-3 py-1 boot-pulse w-fit">
              {typing.join(", ")} {typing.length === 1 ? "is" : "are"} typing…
            </p>
          )}
        </div>

        {/* composer */}
        <div className="border-t border-[#141414] p-2.5 sm:p-3">
          {currentChannel?.kind === "casino" && (
            <p className="text-[11px] text-[#666] mb-1.5">
              Commands: /flip &lt;bet&gt; heads|tails · /slots &lt;bet&gt; · /bal
            </p>
          )}
          <div className="flex gap-2 items-center">
            {room?.type === "channel" && !currentChannel?.locked && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Create poll"
                onClick={() => setPollOpen(true)}
                className="text-[#888] hover:text-white shrink-0"
              >
                <Vote className="size-4" />
              </Button>
            )}
            <Input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send()}
              placeholder={
                currentChannel?.locked && !isStaff
                  ? "Channel locked by staff"
                  : `Message ${room ? (room.type === "channel" ? "#" + room.name : room.name) : "…"}`
              }
              disabled={currentChannel?.locked && !isStaff}
              maxLength={600}
              aria-label="Chat message"
              className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30"
            />
            <Button
              onClick={() => void send()}
              disabled={!input.trim()}
              aria-label="Send message"
              className="bg-white text-black hover:bg-[#e0e0e0] shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* members */}
      <aside className="hidden lg:flex flex-col w-48 shrink-0 border-l border-[#141414]">
        <div className="px-3 py-2.5 border-b border-[#141414]">
          <p className="mono-label">Online — {onlineCount}</p>
        </div>
        <div className="flex-1 overflow-y-auto memphis-scroll p-2">
          {presence.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfileUser(p.username)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-[#0d0d0d] group"
            >
              <span className="size-1.5 rounded-full bg-white shrink-0" />
              <span className="text-[12.5px] text-[#c9c9c9] truncate group-hover:text-white">
                {p.displayName || p.username}
              </span>
              {p.role !== "member" && (
                <span className="ml-auto text-[9px] font-mono uppercase text-[#777]">
                  {p.role}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* dialogs */}
      <LeaderboardDialog open={showLeaderboard} onOpenChange={setShowLeaderboard} />
      <SoundboardDialog open={showSoundboard} onOpenChange={setShowSoundboard} />
      <FriendsDialog
        open={showFriends}
        onOpenChange={setShowFriends}
        onDm={(u) => void openDm(u)}
        refreshKey={friendsKey}
      />
      <ModDialog
        open={showMod}
        onOpenChange={setShowMod}
        prefillUser={modUser}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        myUsername={user.username}
      />
      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        onCreated={async (id, name) => {
          const s = getSocket();
          s?.emit("channels:list", (list: ChannelInfo[]) => setChannels(list));
          toast(`Private channel #${name} created`);
        }}
      />
      <JoinChannelDialog
        open={showJoinChannel}
        onOpenChange={setShowJoinChannel}
        onJoined={async (id, name) => {
          const s = getSocket();
          s?.emit("channels:list", (list: ChannelInfo[]) => setChannels(list));
          const ch = await new Promise<ChannelInfo | null>((resolve) => {
            s?.emit("channels:list", (list: ChannelInfo[]) => {
              resolve(list.find((c) => c.id === id) ?? null);
            });
          });
          if (ch) void openChannel(ch);
          toast(`Joined #${name}`);
        }}
      />
      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onCreated={async (key) => {
          void emitAck<{ id: string; name: string; memberIds: string[] }[]>("group:list").then(
            (r) => {
              const d = r as { id: string; name: string; memberIds: string[] }[];
              if (Array.isArray(d)) setGroups(d);
            }
          );
        }}
      />
      <ProfileDialog
        username={profileUser}
        onClose={() => setProfileUser(null)}
        onDm={(u) => void openDm(u)}
        onFriend={async (u) => {
          const r = await emitAck<{ ok?: boolean; error?: string }>("friends:request", u);
          if (r.error) toast.error(r.error);
          else toast("Friend request sent");
        }}
        canModerate={isStaff}
        onMod={(u) => {
          setModUser(u);
          setProfileUser(null);
          setShowMod(true);
        }}
      />

      {/* poll creator */}
      {pollOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#1f1f1f] bg-[#080808] p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Create poll</h3>
            <Input
              autoFocus
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              placeholder="Question"
              maxLength={140}
              className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
            />
            <div className="mt-2 space-y-2">
              {pollOptions.map((o, i) => (
                <Input
                  key={i}
                  value={o}
                  onChange={(e) =>
                    setPollOptions((cur) =>
                      cur.map((x, j) => (j === i ? e.target.value : x))
                    )
                  }
                  placeholder={`Option ${i + 1}`}
                  maxLength={60}
                  className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] h-9"
                />
              ))}
              {pollOptions.length < 4 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPollOptions((cur) => [...cur, ""])}
                  className="text-[#888] hover:text-white"
                >
                  <Plus className="size-3.5 mr-1" /> Add option
                </Button>
              )}
            </div>
            <label className="text-[12px] text-[#888] flex items-center gap-2 mt-3">
              Duration
              <select
                value={pollMinutes}
                onChange={(e) => setPollMinutes(Number(e.target.value))}
                className="bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1 text-white"
              >
                {[5, 15, 60, 240, 1440].map((m) => (
                  <option key={m} value={m}>
                    {m >= 60 ? `${m / 60}h` : `${m}m`}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setPollOpen(false)} className="text-[#999] hover:text-white">
                Cancel
              </Button>
              <Button
                onClick={() => void createPoll()}
                disabled={!pollQ.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                className="bg-white text-black hover:bg-[#e0e0e0]"
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
