"use client";

/* ============================================================
   Chat panels: leaderboard, profile, mod tools, soundboard
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { emitAck } from "@/lib/socket";
import { ChatUserSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Trophy,
  Shield,
  Volume2,
  UserRound,
  MessageSquare,
  Ban,
  VolumeX,
  Lock,
  Eraser,
  ScrollText,
  UserPlus,
  UserMinus,
} from "lucide-react";

/* ---------------- leaderboard ---------------- */

interface LeaderRow {
  username: string;
  displayName: string | null;
  score: number;
}

export function LeaderboardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = useState("xp");
  const [rows, setRows] = useState<LeaderRow[]>([]);

  useEffect(() => {
    if (!open) return;
    void emitAck<LeaderRow[]>("leaderboard", mode).then((r) => {
      const data = r as LeaderRow[];
      if (Array.isArray(data)) setRows(data);
    });
  }, [open, mode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4" /> Leaderboard
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Top members of the study group.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="bg-[#0a0a0a] border border-[#1a1a1a w-full">
            {["xp", "coins", "msgs", "streak"].map((m) => (
              <TabsTrigger
                key={m}
                value={m}
                className="flex-1 data-[state=active]:bg-white data-[state=active]:text-black text-[#999] capitalize"
              >
                {m === "msgs" ? "messages" : m}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={mode} className="mt-0">
            <ol className="divide-y divide-[#141414] max-h-72 overflow-y-auto memphis-scroll">
              {rows.length === 0 && (
                <li className="py-3 text-[13px] text-[#666]">No data yet.</li>
              )}
              {rows.map((r, i) => (
                <li key={r.username} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right font-mono text-[12px] text-[#666]">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[13px] text-white truncate">
                    {r.displayName || r.username}
                  </span>
                  <span className="font-mono text-[13px] text-[#c9c9c9]">
                    {r.score.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- profile ---------------- */

export function ProfileDialog({
  username,
  onClose,
  onDm,
  onFriend,
  canModerate,
  onMod,
  friendState,
}: {
  username: string | null;
  onClose: () => void;
  onDm: (u: string) => void;
  onFriend: (u: string) => void;
  canModerate: boolean;
  onMod: (u: string) => void;
  friendState?: "none" | "friends" | "pending" | "self";
}) {
  const [info, setInfo] = useState<{
    user: ChatUserSummary & { bio?: string; xp?: number; coins?: number; streak?: number; role?: string };
    messages: number;
  } | null>(null);

  useEffect(() => {
    if (!username) return;
    setInfo(null);
    void emitAck<{
      user: ChatUserSummary & { bio?: string; xp?: number; coins?: number; streak?: number; role?: string };
      messages: number;
    }>("profile:get", username).then((r) => {
      const d = r as typeof info;
      if (d && d.user) setInfo(d);
    });
  }, [username]);

  const u = info?.user;

  return (
    <Dialog open={!!username} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4" /> {username}
          </DialogTitle>
          {u?.role && u.role !== "member" && (
            <DialogDescription className="text-[11px] font-mono uppercase">
              {u.role}
            </DialogDescription>
          )}
        </DialogHeader>
        {!u ? (
          <p className="text-[13px] text-[#666] py-4 boot-pulse w-fit">loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["XP", u.xp ?? 0],
                ["Coins", u.coins ?? 0],
                ["Msgs", info?.messages ?? 0],
                ["Streak", u.streak ?? 0],
              ].map(([label, val]) => (
                <div key={String(label)} className="border border-[#1a1a1a] rounded-md p-2">
                  <div className="font-mono text-[13px] text-white">
                    {Number(val).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[#666] uppercase tracking-wide">
                    {label}
                  </div>
                </div>
              ))}
            </div>
            {u.status && (
              <p className="text-[12px] text-[#8f8f8f]">
                <span className="text-[#666]">status:</span> {u.status}
              </p>
            )}
            {u.bio && <p className="text-[13px] text-[#c9c9c9]">{u.bio}</p>}
            <div className="flex flex-wrap gap-2">
              {friendState !== "self" && (
                <Button
                  size="sm"
                  onClick={() => onDm(u.username)}
                  className="bg-white text-black hover:bg-[#e0e0e0]"
                >
                  <MessageSquare className="size-3.5 mr-1" /> Message
                </Button>
              )}
              {(friendState === "none" || friendState === undefined) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onFriend(u.username)}
                  className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                >
                  <UserPlus className="size-3.5 mr-1" /> Add friend
                </Button>
              )}
              {canModerate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMod(u.username)}
                  className="border-[#2a2a2a] text-white hover:bg-[#101010]"
                >
                  <Shield className="size-3.5 mr-1" /> Moderate
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- mod tools ---------------- */

interface AuditRow {
  id: string;
  actorId: string;
  targetId: string | null;
  action: string;
  reason: string;
  createdAt: number;
}

export function ModDialog({
  open,
  onOpenChange,
  prefillUser,
  channels,
  myUsername,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefillUser: string;
  channels: { id: string; name: string }[];
  myUsername: string;
}) {
  const [target, setTarget] = useState("");
  const [seconds, setSeconds] = useState(600);
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [restrictions, setRestrictions] = useState<{
    banned: { username: string; banReason: string | null }[];
    muted: { username: string; mutedUntil: number }[];
  } | null>(null);
  const [wordFilter, setWordFilter] = useState("");
  const [tab, setTab] = useState("actions");

  useEffect(() => {
    if (open && prefillUser) setTarget(prefillUser);
  }, [open, prefillUser]);

  useEffect(() => {
    if (!open) return;
    void emitAck<AuditRow[]>("mod:audit").then((r) => {
      const d = r as AuditRow[];
      if (Array.isArray(d)) setAudit(d);
    });
    void emitAck<typeof restrictions>("mod:restrictions").then((r) => {
      const d = r as typeof restrictions;
      if (d && !("error" in d)) setRestrictions(d);
    });
  }, [open]);

  const act = useCallback(
    async (action: string, opts: { seconds?: number; reason?: string; value?: string } = {}) => {
      const r = await emitAck<{ ok?: boolean; error?: string; settings?: { wordFilter?: string } }>(
        "mod:action",
        { action, target: target || undefined, ...opts }
      );
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${action} done`);
        if (action === "settings" && r.settings?.wordFilter !== undefined)
          setWordFilter(r.settings.wordFilter);
      }
    },
    [target]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" /> Moderation
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Signed in as {myUsername}. Actions are logged.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#0a0a0a] border border-[#1a1a1a w-full">
            <TabsTrigger value="actions" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-black text-[#999]">
              Actions
            </TabsTrigger>
            <TabsTrigger value="channels" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-black text-[#999]">
              Channels
            </TabsTrigger>
            <TabsTrigger value="log" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-black text-[#999]">
              Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="actions" className="space-y-3 mt-3">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target username"
              aria-label="Target username"
              className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value) || 0)}
                aria-label="Duration in seconds"
                className="bg-[#050505] border-[#1f1f1f] text-white"
              />
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                aria-label="Reason"
                className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button size="sm" variant="outline" onClick={() => void act("mute", { seconds, reason })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                <VolumeX className="size-3.5 mr-1" /> Mute
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act("unmute")} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                Unmute
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act("warn", { reason })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                Warn
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act("ban", { reason })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                <Ban className="size-3.5 mr-1" /> Ban
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act("unban")} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                Unban
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act("role", { value: "mod" })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                <UserPlus className="size-3.5 mr-1" /> Make mod
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act("role", { value: "member" })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                <UserMinus className="size-3.5 mr-1" /> Demote
              </Button>
            </div>
            <div className="border-t border-[#141414] pt-3 space-y-2">
              <p className="mono-label">Auto-mod</p>
              <div className="flex gap-2">
                <Input
                  value={wordFilter}
                  onChange={(e) => setWordFilter(e.target.value)}
                  placeholder="Word filter (comma separated)"
                  aria-label="Word filter"
                  className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
                />
                <Button size="sm" variant="outline" onClick={() => void act("settings", { value: wordFilter })} className="border-[#2a2a2a] text-white hover:bg-[#101010] shrink-0">
                  Save
                </Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void act("settings", { seconds: 1 })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                  Auto-mod ON
                </Button>
                <Button size="sm" variant="outline" onClick={() => void act("settings", { seconds: 0 })} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                  Auto-mod OFF
                </Button>
                <Button size="sm" variant="outline" onClick={() => void act("registrations")} className="border-[#2a2a2a] text-white hover:bg-[#101010]">
                  Toggle sign-ups
                </Button>
              </div>
            </div>
            {restrictions && (
              <div className="border-t border-[#141414] pt-3 text-[12px] text-[#888]">
                <p className="mono-label mb-1">Restrictions</p>
                {restrictions.banned.length > 0 && (
                  <p>
                    banned: {restrictions.banned.map((b) => b.username).join(", ")}
                  </p>
                )}
                {restrictions.muted.length > 0 && (
                  <p>
                    muted:{" "}
                    {restrictions.muted
                      .map((m) => `${m.username} (${Math.max(0, Math.round((m.mutedUntil - Date.now()) / 60000))}m)`)
                      .join(", ")}
                  </p>
                )}
                {restrictions.banned.length === 0 && restrictions.muted.length === 0 && (
                  <p>none</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="channels" className="space-y-2 mt-3">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center gap-2 border border-[#161616] rounded-md px-2.5 py-2"
              >
                <span className="text-[13px] text-white flex-1">#{ch.name}</span>
                <Button size="sm" variant="ghost" onClick={() => void act("lockChannel", { value: ch.id })} className="text-[#999] hover:text-white h-7 px-2">
                  <Lock className="size-3.5" /> Lock
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void act("unlockChannel", { value: ch.id })} className="text-[#999] hover:text-white h-7 px-2">
                  Unlock
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void act("clearChannel", { value: ch.id })} className="text-[#999] hover:text-white h-7 px-2">
                  <Eraser className="size-3.5" /> Clear
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="log" className="mt-3">
            <div className="max-h-64 overflow-y-auto memphis-scroll text-[12px] space-y-1">
              {audit.length === 0 && <p className="text-[#666]">No actions logged.</p>}
              {audit.map((a) => (
                <div key={a.id} className="flex gap-2 text-[#999]">
                  <span className="text-[#555] font-mono shrink-0">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </span>
                  <span>
                    <span className="text-white">{a.actorId}</span> → {a.action}
                    {a.targetId ? ` on @${a.targetId}` : ""}
                    {a.reason ? ` (${a.reason})` : ""}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- soundboard ---------------- */

const SOUNDS: { id: string; label: string; freqs: number[]; type: OscillatorType; dur: number }[] = [
  { id: "ding", label: "ding", freqs: [880], type: "sine", dur: 0.4 },
  { id: "buzz", label: "buzz", freqs: [110], type: "sawtooth", dur: 0.5 },
  { id: "blip", label: "blip", freqs: [660, 990], type: "square", dur: 0.18 },
  { id: "tada", label: "tada", freqs: [523, 659, 784, 1047], type: "triangle", dur: 0.7 },
  { id: "boom", label: "boom", freqs: [60], type: "sine", dur: 0.8 },
  { id: "ping", label: "ping", freqs: [1318], type: "sine", dur: 0.3 },
];

export function playLocalSound(id: string) {
  const def = SOUNDS.find((s) => s.id === id);
  if (!def) return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    let t = ctx.currentTime;
    for (const f of def.freqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = def.type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + def.dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + def.dur + 0.02);
      t += def.dur / def.freqs.length;
    }
    setTimeout(() => void ctx.close(), (def.dur + 0.3) * 1000);
  } catch {
    /* audio unavailable */
  }
}

export function SoundboardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Volume2 className="size-4" /> Soundboard
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Plays for everyone in chat.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {SOUNDS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                playLocalSound(s.id);
                void emitAck("sound:play", s.id);
              }}
              className="border border-[#1f1f1f] rounded-md py-2.5 text-[12px] text-[#ccc] hover:border-white hover:text-white transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- friends dialog ---------------- */

interface FriendRow {
  id: string;
  status: string;
  /** server-side direction: who sent the pending request */
  direction?: "incoming" | "outgoing";
  user: { id: string; username: string; displayName: string | null; status: string } | null;
}

export function FriendsDialog({
  open,
  onOpenChange,
  onDm,
  refreshKey,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDm: (u: string) => void;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [addName, setAddName] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    void emitAck<FriendRow[]>("friends:list").then((r) => {
      const d = r as FriendRow[];
      if (Array.isArray(d)) setRows(d);
    });
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load, refreshKey]);

  const friends = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter(
    (r) => r.status === "pending" && r.user?.id && (r.direction ?? "incoming") === "incoming"
  );
  const sent = rows.filter(
    (r) => r.status === "pending" && (r.direction ?? "incoming") === "outgoing"
  );

  const request = async () => {
    const name = addName.trim();
    if (!name) return;
    const r = await emitAck<{ ok?: boolean; error?: string }>("friends:request", name);
    if (r.error) setMsg(r.error);
    else {
      setMsg("Request sent.");
      setAddName("");
      load();
    }
    setTimeout(() => setMsg(""), 2500);
  };

  const respond = async (id: string, accept: boolean) => {
    await emitAck("friends:respond", { id, accept });
    load();
  };

  const remove = async (id: string) => {
    await emitAck("friends:remove", id);
    load();
  };

  const Row = ({ r, pending }: { r: FriendRow; pending?: boolean }) => (
    <div className="flex items-center gap-2 py-1.5">
      <span className="size-1.5 rounded-full bg-white shrink-0" aria-hidden />
      <span className="text-[13px] text-white truncate flex-1">
        {r.user ? r.user.displayName || r.user.username : "unknown"}
      </span>
      {pending ? (
        <>
          <Button size="sm" variant="outline" onClick={() => void respond(r.id, true)} className="h-7 px-2 border-[#2a2a2a] text-white hover:bg-[#101010]">
            Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void respond(r.id, false)} className="h-7 px-2 text-[#888] hover:text-white">
            Decline
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="ghost" onClick={() => r.user && onDm(r.user.username)} className="h-7 px-2 text-[#999] hover:text-white">
            <MessageSquare className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Remove friend" onClick={() => void remove(r.id)} className="h-7 px-2 text-[#888] hover:text-white">
            <UserMinus className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4" /> Friends
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Add friends to DM them more easily.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void request()}
            placeholder="Username"
            aria-label="Friend username"
            className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
          />
          <Button onClick={() => void request()} size="sm" className="bg-white text-black hover:bg-[#e0e0e0] shrink-0">
            Add
          </Button>
        </div>
        {msg && <p className="text-[12px] text-[#999]">{msg}</p>}
        {incoming.length > 0 && (
          <section>
            <p className="mono-label mb-1">Requests ({incoming.length})</p>
            {incoming.map((r) => (
              <Row key={r.id} r={r} pending />
            ))}
          </section>
        )}
        {sent.length > 0 && (
          <section>
            <p className="mono-label mb-1">Sent</p>
            {sent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5">
                <span className="size-1.5 rounded-full border border-[#555] shrink-0" aria-hidden />
                <span className="text-[13px] text-[#999] flex-1 truncate">
                  {r.user ? `${r.user.displayName || r.user.username} · pending…` : "pending…"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(r.id)}
                  className="h-7 px-2 text-[#888] hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            ))}
          </section>
        )}
        <section>
          <p className="mono-label mb-1">Friends ({friends.length})</p>
          {friends.length === 0 && (
            <p className="text-[13px] text-[#666]">No friends added yet.</p>
          )}
          {friends.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- create private channel ---------------- */

export function CreateChannelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const create = async () => {
    const r = await emitAck<{ ok?: boolean; id?: string; name?: string; code?: string; error?: string }>(
      "channel:create",
      { name, minutes }
    );
    if (r.error) {
      setErr(r.error);
      return;
    }
    setCode(r.code ?? null);
    if (r.id && r.name) onCreated(r.id, r.name);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScrollText className="size-4" /> Private channel
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Invite-only room with a share code.
          </DialogDescription>
        </DialogHeader>
        {code ? (
          <div className="space-y-3">
            <p className="text-[13px] text-[#c9c9c9]">Channel created. Share this code:</p>
            <p className="text-center text-xl font-mono tracking-[0.3em] text-white border border-[#222] rounded-lg py-3">
              {code}
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full bg-white text-black hover:bg-[#e0e0e0]">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel-name"
              aria-label="Channel name"
              className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
            />
            <label className="text-[12px] text-[#888] flex items-center gap-2">
              Expires in
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1 text-white"
                aria-label="Expiration"
              >
                <option value={60}>60 minutes</option>
                <option value={1440}>24 hours</option>
                <option value={0}>permanent</option>
              </select>
            </label>
            {err && <p className="text-[12px] text-white bg-[#161616] border border-[#333] rounded px-2 py-1">{err}</p>}
            <Button
              onClick={() => void create()}
              disabled={name.trim().length < 3}
              className="w-full bg-white text-black hover:bg-[#e0e0e0]"
            >
              Create
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- join channel ---------------- */

export function JoinChannelDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onJoined: (id: string, name: string) => void;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const join = async () => {
    const r = await emitAck<{ ok?: boolean; id?: string; name?: string; error?: string }>(
      "channel:join",
      code
    );
    if (r.error) {
      setErr(r.error);
      return;
    }
    setCode("");
    setErr("");
    onOpenChange(false);
    if (r.id && r.name) onJoined(r.id, r.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">Join with code</DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            Enter the 6-character invite code.
          </DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && void join()}
          placeholder="ABC123"
          className="text-center font-mono tracking-[0.3em] bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] placeholder:tracking-[0.3em]"
          aria-label="Invite code"
        />
        {err && <p className="text-[12px] text-white bg-[#161616] border border-[#333] rounded px-2 py-1">{err}</p>}
        <Button
          onClick={() => void join()}
          disabled={code.length < 6}
          className="w-full bg-white text-black hover:bg-[#e0e0e0]"
        >
          Join
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- group creator ---------------- */

export function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState("");
  const [usernames, setUsernames] = useState("");
  const [err, setErr] = useState("");

  const create = async () => {
    const list = usernames
      .split(/[,\s]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const r = await emitAck<{ ok?: boolean; group?: { id: string }; error?: string }>(
      "group:create",
      { name, usernames: list }
    );
    if (r.error) {
      setErr(r.error);
      return;
    }
    setErr("");
    setName("");
    setUsernames("");
    onOpenChange(false);
    if (r.group?.id) onCreated("g:" + r.group.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">New group</DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            A private conversation with several members.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          aria-label="Group name"
          className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555]"
        />
        <Textarea
          value={usernames}
          onChange={(e) => setUsernames(e.target.value)}
          placeholder="usernames, comma or space separated"
          rows={2}
          aria-label="Member usernames"
          className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] min-h-0"
        />
        {err && <p className="text-[12px] text-white bg-[#161616] border border-[#333] rounded px-2 py-1">{err}</p>}
        <Button
          onClick={() => void create()}
          disabled={!name.trim()}
          className="bg-white text-black hover:bg-[#e0e0e0]"
        >
          Create
        </Button>
      </DialogContent>
    </Dialog>
  );
}
