/* ============================================================
   Memphis chat service — Socket.io + bun:sqlite on shared DB
   Port 3003. Validates sessions against the main app's tables.
   ============================================================ */

import { createServer } from "http";
import { Database } from "bun:sqlite";
import { Server, Socket } from "socket.io";

const PORT = 3003;
const DB_PATH = "/home/z/my-project/db/custom.db";

const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode=WAL;");
db.exec("PRAGMA busy_timeout=15000;");

/* ---------------- schema guard (tables are owned by Prisma push) ---------------- */

db.exec(`INSERT OR IGNORE INTO ChatSettings (id) VALUES ('main')`);

const SEED_CHANNELS: [string, string, string][] = [
  ["announcements", "Official announcements — read only", "text"],
  ["rules", "Community rules — read before chatting", "text"],
  ["general", "General discussion", "text"],
  ["counting", "Count up by one, don't break the chain", "counting"],
  ["casino", "Try /flip 50 heads or /slots 25", "casino"],
  ["suggestions", "Ideas for games, apps and features", "text"],
  ["share-links", "Share interesting (school-safe) links", "text"],
  ["media", "Images and GIFs (https links only)", "text"],
];
for (const [name, topic, kind] of SEED_CHANNELS) {
  db.run(
    `INSERT OR IGNORE INTO Channel (id, name, topic, kind, isPrivate, locked, createdAt) VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [cuidish(), name, topic, kind, name === "announcements" || name === "rules" ? 1 : 0, Date.now()]
  );
}

function cuidish() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12).padEnd(17, "0");
}

const SYSTEM_USER_ID = "memphis-system-user-000000";

db.run(
  `INSERT OR IGNORE INTO User (id, username, passwordHash, role, bio, status, createdAt, updatedAt)
   VALUES (?, 'system', 'x:y', 'owner', 'Memphis system', '', ?, ?)`,
  [SYSTEM_USER_ID, Date.now(), Date.now()]
);

/* ---------------- types ---------------- */

interface UserRow {
  id: string; username: string; passwordHash: string; role: string;
  displayName: string | null; bio: string; status: string; avatarUrl: string | null;
  xp: number; coins: number; streak: number; lastClaimAt: number | null;
  mutedUntil: number | null; banned: number; banReason: string | null;
  dmPolicy: string; recoveryHash: string | null; createdAt: number; updatedAt: number;
}

interface ChatSettingsRow {
  id: string; wordFilter: string; automodEnabled: number; floodMsgs: number;
  floodSecs: number; sameMsgLimit: number; severeMuteSec: number;
  slowmodeSec: number; registrations: number; soundboard: number;
}

const settings = () =>
  db.query<ChatSettingsRow, []>("SELECT * FROM ChatSettings WHERE id='main'").get()!;

function updateSettings(patch: Partial<ChatSettingsRow>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db.run(
    `UPDATE ChatSettings SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id='main'`,
    keys.map((k) => (patch as Record<string, unknown>)[k])
  );
}

/* ---------------- helpers ---------------- */

const SEVERE = ["nigger", "nigga", "faggot", "kike"]; /* auto-mute trigger list (minimal) */

function normalize(t: string) {
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
}

function filterMessage(text: string): { text: string; severe: boolean } {
  const cfg = settings();
  const words = cfg.wordFilter
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  let out = text;
  for (const w of words) {
    const re = new RegExp(
      w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi"
    );
    out = out.replace(re, "•".repeat(Math.max(3, w.length)));
  }
  const norm = normalize(text);
  const severe = SEVERE.some((w) => norm.includes(w));
  return { text: out, severe };
}

function isStaff(u: UserRow) {
  return ["owner", "admin", "mod"].includes(u.role);
}

function muted(u: UserRow) {
  return u.mutedUntil && u.mutedUntil > Date.now();
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    status: u.status,
    role: u.role,
    bio: u.bio,
    xp: u.xp,
    coins: u.coins,
    streak: u.streak,
  };
}

function getUserByToken(token: string): UserRow | null {
  const row = db
    .query<UserRow, [string, number]>(
      `SELECT u.* FROM Session s JOIN User u ON s.userId = u.id
       WHERE s.token = ? AND s.expiresAt > ? AND u.banned = 0`
    )
    .get(token, Date.now());
  return row ?? null;
}

function getUserByUsername(username: string): UserRow | null {
  return db.query<UserRow, [string]>("SELECT * FROM User WHERE username = ?").get(
    String(username ?? "").trim()
  ) ?? null;
}

function dmKeyFor(a: string, b: string) {
  return "u:" + [a, b].sort().join(":");
}

function msgRow(m: unknown) {
  const r = m as Record<string, unknown>;
  return {
    id: r.id as string,
    channelId: (r.channelId as string) ?? null,
    dmKey: (r.dmKey as string) ?? null,
    userId: r.userId as string,
    username: r.username as string,
    displayName: r.displayName as string | null,
    avatarUrl: r.avatarUrl as string | null,
    role: r.role as string,
    content: r.content as string,
    isSystem: !!r.isSystem,
    poll: r.poll ? JSON.parse(r.poll as string) : null,
    deleted: !!r.deleted,
    createdAt: Number(r.createdAt),
  };
}

function fetchMessages(where: string, arg: unknown, limit = 60, before?: number) {
  const conds = [where, before ? "createdAt < ?" : ""].filter(Boolean).join(" AND ");
  const args = [arg, ...(before ? [before] : [])];
  const rows = db
    .query(
      `SELECT m.*, u.username, u.displayName, u.avatarUrl, u.role FROM Message m
       JOIN User u ON m.userId = u.id
       WHERE ${conds} AND m.deleted = 0
       ORDER BY m.createdAt DESC LIMIT ?`
    )
    .all(...args, limit);
  return rows.reverse().map(msgRow);
}

/* ---------------- presence + rooms ---------------- */

interface OnlineUser {
  socketId: string;
  user: UserRow;
}

const online = new Map<string, OnlineUser>(); // socketId -> user
const usernameToSockets = new Map<string, Set<string>>();

function onlineList() {
  const seen = new Map<string, { user: ReturnType<typeof publicUser>; sockets: number }>();
  for (const { user } of online.values()) {
    const cur = seen.get(user.id);
    if (cur) cur.sockets++;
    else seen.set(user.id, { user: publicUser(user), sockets: 1 });
  }
  return [...seen.values()].map((s) => ({ ...s.user, online: true }));
}

function broadcastPresence(io: Server) {
  io.emit("presence:list", onlineList());
}

/* ---------------- flood tracking ---------------- */

const msgTimes = new Map<string, number[]>();
const lastMessages = new Map<string, string[]>();

function floodCheck(u: UserRow): string | null {
  const cfg = settings();
  if (!cfg.automodEnabled) return null;
  const now = Date.now();
  const arr = (msgTimes.get(u.id) ?? []).filter((t) => now - t < cfg.floodSecs * 1000);
  arr.push(now);
  msgTimes.set(u.id, arr);
  if (arr.length > cfg.floodMsgs)
    return `flood (${arr.length} messages in ${cfg.floodSecs}s)`;
  return null;
}

function repeatCheck(u: UserRow, content: string): string | null {
  const cfg = settings();
  if (!cfg.automodEnabled || cfg.sameMsgLimit <= 0) return null;
  const arr = (lastMessages.get(u.id) ?? []).slice(-(cfg.sameMsgLimit - 1));
  arr.push(content);
  lastMessages.set(u.id, arr);
  if (arr.filter((m) => m === content).length >= cfg.sameMsgLimit)
    return `repeated messages`;
  return null;
}

/* ---------------- message sending ---------------- */

interface SendPayload {
  channelId?: string;
  dmKey?: string;
  content: string;
}

function canAccessChannel(u: UserRow, channel: { id: string; isPrivate: number }) {
  if (!channel.isPrivate) return true;
  return !!db
    .query("SELECT id FROM GroupMember WHERE groupId = ? AND userId = ?")
    .get(channel.id, u.id);
}

/** A dmKey is addressable by a user only if they are a party to it:
    "u:<idA>:<idB>" (either order) or "g:<groupId>" they belong to.
    Without this check any authenticated socket could inject messages
    into other people's DMs / groups. */
function canUseDmKey(u: UserRow, dmKey: string): boolean {
  const key = String(dmKey || "");
  if (key.startsWith("g:")) {
    const gid = key.slice(2);
    if (!/^[a-z0-9]+$/i.test(gid)) return false;
    return !!db
      .query("SELECT id FROM GroupMember WHERE groupId = ? AND userId = ?")
      .get(gid, u.id);
  }
  if (key.startsWith("u:")) {
    const parts = key.slice(2).split(":");
    if (parts.length !== 2) return false;
    return parts.includes(u.id);
  }
  return false;
}

function insertMessage(
  userId: string,
  content: string,
  opts: { channelId?: string; dmKey?: string; isSystem?: boolean; poll?: unknown } = {}
) {
  const id = cuidish();
  db.run(
    `INSERT INTO Message (id, channelId, dmKey, userId, content, isSystem, poll, deleted, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      opts.channelId ?? null,
      opts.dmKey ?? null,
      userId,
      content,
      opts.isSystem ? 1 : 0,
      opts.poll ? JSON.stringify(opts.poll) : null,
      Date.now(),
    ]
  );
  return id;
}

function messageWithJoins(id: string) {
  const row = db
    .query(
      `SELECT m.*, u.username, u.displayName, u.avatarUrl, u.role FROM Message m
       JOIN User u ON m.userId = u.id WHERE m.id = ?`
    )
    .get(id);
  return row ? msgRow(row) : null;
}

/* casino */
const SLOTS = ["◆", "●", "▲", "■", "★"];
function slotsSpin() {
  return [0, 1, 2].map(() => SLOTS[Math.floor(Math.random() * SLOTS.length)]);
}

function addCoins(userId: string, delta: number) {
  db.run("UPDATE User SET coins = MAX(0, coins + ?) WHERE id = ?", [delta, userId]);
}

function addXp(userId: string, delta: number) {
  db.run("UPDATE User SET xp = MAX(0, xp + ?) WHERE id = ?", [delta, userId]);
}

function emitUserUpdate(io: Server, userId: string) {
  const u = db.query<UserRow, [string]>("SELECT * FROM User WHERE id = ?").get(userId);
  if (!u) return;
  for (const [sid, o] of online) if (o.user.id === userId) io.to(sid).emit("user:update", publicUser(u));
}

/* ---------------- socket server ---------------- */

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
});

io.on("connection", (socket: Socket) => {
  let user: UserRow | null = null;
  try {
    const token = (socket.handshake.auth?.token as string) || "";
    user = token ? getUserByToken(token) : null;
  } catch {
    user = null;
  }
  if (!user) {
    socket.emit("auth:error", "Invalid or expired session");
    socket.disconnect(true);
    return;
  }

  const freshUser = () => {
    const u = db.query<UserRow, [string]>("SELECT * FROM User WHERE id = ?").get(user!.id);
    return u ?? user!;
  };
  user = freshUser();

  online.set(socket.id, { socketId: socket.id, user });
  if (!usernameToSockets.has(user.username)) usernameToSockets.set(user.username, new Set());
  usernameToSockets.get(user.username)!.add(socket.id);
  socket.emit("auth:ok", publicUser(user));
  broadcastPresence(io);

  /* ---- channels ---- */
  socket.on("channels:list", (cb) => {
    const staff = isStaff(user!);
    const rows = db
      .query(
        `SELECT c.* FROM Channel c
         WHERE (c.isPrivate = 0 AND c.name != 'staff-only' AND c.name != 'logs' OR (? = 1 AND c.name IN ('staff-only','logs')))
         OR (c.isPrivate = 1 AND EXISTS (SELECT 1 FROM GroupMember gm WHERE gm.groupId = c.id AND gm.userId = ?))
         ORDER BY c.createdAt ASC`
      )
      .all(staff ? 1 : 0, user!.id) as Record<string, unknown>[];
    cb(
      rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        topic: r.topic as string,
        kind: r.kind as string,
        isPrivate: !!r.isPrivate,
        locked: !!r.locked,
      }))
    );
  });

  socket.on("chat:join", (channelId: string, cb) => {
    const ch = db.query("SELECT * FROM Channel WHERE id = ?").get(channelId) as
      | { id: string; name: string; isPrivate: number }
      | undefined;
    if (!ch) return cb?.({ error: "Channel not found" });
    if (!canAccessChannel(user!, ch)) return cb?.({ error: "No access to this channel" });
    socket.join("ch:" + channelId);
    const messages = fetchMessages("m.channelId = ?", channelId);
    const counting = db
      .query(
        `SELECT m.content FROM Message m WHERE m.channelId = ? AND m.isSystem = 0 AND m.deleted = 0
         ORDER BY m.createdAt DESC LIMIT 1`
      )
      .get(channelId) as { content: string } | undefined;
    cb?.({
      messages,
      lastCount: counting ? parseInt(counting.content, 10) || 0 : 0,
    });
  });

  socket.on("chat:leave", (channelId: string) => {
    socket.leave("ch:" + channelId);
  });

  socket.on("chat:typing", (channelId: string) => {
    socket.to("ch:" + channelId).emit("chat:typing", {
      username: user!.displayName || user!.username,
    });
  });

  /* ---- send message (channel or DM) ---- */
  socket.on("chat:send", (p: SendPayload, cb) => {
    const u = freshUser();
    const content = (p?.content ?? "").toString().slice(0, 600).trim();
    if (!content) return cb?.({ error: "Empty message" });
    if (muted(u))
      return cb?.({ error: `You are muted until ${new Date(u.mutedUntil!).toLocaleTimeString()}` });

    /* casino commands */
    if (p.channelId) {
      const ch = db.query("SELECT * FROM Channel WHERE id = ?").get(p.channelId) as
        | { id: string; name: string; kind: string; locked: number; isPrivate: number }
        | undefined;
      if (!ch) return cb?.({ error: "Channel not found" });
      if (!canAccessChannel(u, ch)) return cb?.({ error: "No access" });
      if (ch.locked && !isStaff(u)) return cb?.({ error: "Channel is locked" });

      if (ch.kind === "casino" && content.startsWith("/")) {
        return handleCasino(socket, io, u, ch, content, cb);
      }
      if (ch.kind === "counting") {
        return handleCounting(socket, io, u, ch, content, cb);
      }

      /* slowmode */
      const cfg = settings();
      if (cfg.slowmodeSec > 0 && !isStaff(u)) {
        const last = db
          .query("SELECT createdAt FROM Message WHERE userId = ? AND channelId = ? AND isSystem = 0 ORDER BY createdAt DESC LIMIT 1")
          .get(u.id, ch.id) as { createdAt: number } | undefined;
        if (last && Date.now() - Number(last.createdAt) < cfg.slowmodeSec * 1000)
          return cb?.({ error: `Slowmode: wait ${cfg.slowmodeSec}s between messages` });
      }
    }

    /* automod */
    const flood = floodCheck(u);
    if (flood) {
      const secs = 60;
      db.run("UPDATE User SET mutedUntil = ? WHERE id = ?", [Date.now() + secs * 1000, u.id]);
      logMod(io, null, u.username, "auto-mute", `${flood}`);
      return cb?.({ error: `Auto-mute: ${flood}. Muted for 60s.` });
    }
    const repeat = repeatCheck(u, content);
    if (repeat) {
      return cb?.({ error: "You already sent that message." });
    }
    const { text, severe } = filterMessage(content);
    if (severe) {
      const cfg = settings();
      const secs = cfg.severeMuteSec || 600;
      db.run("UPDATE User SET mutedUntil = ? WHERE id = ?", [Date.now() + secs * 1000, u.id]);
      logMod(io, null, u.username, "auto-mute (severe)", "severe language");
      return cb?.({ error: `Auto-mute: severe language. Muted for ${secs}s.` });
    }

    /* dmKey authorization — the sender must be a party to the DM/group */
    if (p.dmKey && !canUseDmKey(u, String(p.dmKey))) {
      return cb?.({ error: "No access" });
    }

    const id = insertMessage(u.id, text, { channelId: p.channelId, dmKey: p.dmKey });
    const msg = messageWithJoins(id);

    /* reward */
    const today = new Date();
    const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const coinKey = `coins:${u.id}:${dayKey}`;
    const count = ((globalThis as Record<string, unknown>)[coinKey] as number) ?? 0;
    if (count < 50) {
      addCoins(u.id, 1);
      (globalThis as Record<string, unknown>)[coinKey] = count + 1;
    }
    addXp(u.id, 2);
    emitUserUpdate(io, u.id);

    if (p.channelId) io.to("ch:" + p.channelId).emit("chat:message", msg);
    if (p.dmKey) {
      const parts = p.dmKey.replace("u:", "").split(":");
      io.to("dm:" + p.dmKey).emit("chat:message", msg);
      for (const uid of parts) {
        for (const [sid, o] of online) if (o.user.id === uid) io.to(sid).emit("dm:refresh", p.dmKey);
      }
    }
    cb?.({ ok: true, message: msg });
  });

  socket.on("chat:loadmore", (p: { channelId?: string; dmKey?: string; before: number }, cb) => {
    if (p.channelId) {
      cb?.(fetchMessages("m.channelId = ?", p.channelId, 60, p.before));
    } else if (p.dmKey) {
      cb?.(fetchMessages("m.dmKey = ?", p.dmKey, 60, p.before));
    }
  });

  socket.on("message:delete", (id: string, cb) => {
    const m = db.query("SELECT * FROM Message WHERE id = ?").get(id) as
      | { id: string; userId: string; channelId: string | null; dmKey: string | null }
      | undefined;
    if (!m) return cb?.({ error: "Not found" });
    const u = freshUser();
    if (m.userId !== u.id && !isStaff(u)) return cb?.({ error: "Not allowed" });
    db.run("UPDATE Message SET deleted = 1 WHERE id = ?", [id]);
    if (m.channelId) io.to("ch:" + m.channelId).emit("chat:deleted", id);
    if (m.dmKey) io.to("dm:" + m.dmKey).emit("chat:deleted", id);
    cb?.({ ok: true });
  });

  /* ---- DMs ---- */
  socket.on("dm:open", (username: string, cb) => {
    const target = getUserByUsername(String(username || "").trim());
    if (!target) return cb?.({ error: "User not found" });
    const u = freshUser();
    if (target.id === u.id) return cb?.({ error: "That's you" });
    if (target.dmPolicy === "off") return cb?.({ error: "This user does not accept DMs" });
    if (
      target.dmPolicy === "friends" &&
      !db
        .query(
          `SELECT id FROM Friendship WHERE status='accepted' AND ((initiatorId=? AND receiverId=?) OR (initiatorId=? AND receiverId=?))`
        )
        .get(u.id, target.id, target.id, u.id)
    )
      return cb?.({ error: "This user only accepts DMs from friends" });
    const key = dmKeyFor(u.id, target.id);
    socket.join("dm:" + key);
    const messages = fetchMessages("m.dmKey = ?", key);
    cb?.({
      key,
      target: publicUser(target),
      messages,
    });
  });

  socket.on("dm:join", (key: string) => {
    /* joining requires being a party to the room (dm:open/group:open
       still join implicitly after their own authz checks) */
    const k = String(key || "");
    if (k && canUseDmKey(user!, k)) socket.join("dm:" + k);
  });

  socket.on("dm:leave", (key: string) => {
    const k = String(key || "");
    if (k) socket.leave("dm:" + k);
  });

  /* ---- groups ---- */
  socket.on("group:create", (p: { name: string; usernames: string[] }, cb) => {
    const u = freshUser();
    const name = String(p?.name ?? "").slice(0, 40).trim() || "Group";
    const members = [u.id];
    const groupIds: string[] = [];
    for (const un of (p?.usernames ?? []).slice(0, 19)) {
      const t = getUserByUsername(String(un).trim());
      if (t && !members.includes(t.id)) {
        members.push(t.id);
        groupIds.push(t.id);
      }
    }
    const gid = cuidish();
    db.run("INSERT INTO \"Group\" (id, name, createdBy, createdAt) VALUES (?, ?, ?, ?)", [
      gid, name, u.id, Date.now(),
    ]);
    for (const m of members)
      db.run('INSERT OR IGNORE INTO GroupMember (id, groupId, userId) VALUES (?, ?, ?)', [cuidish(), gid, m]);
    const info = { id: gid, name, memberIds: members };
    io.to("dm:g:" + gid).emit("group:new", info);
    cb?.({ ok: true, group: info });
  });

  socket.on("group:list", (cb) => {
    const rows = db
      .query(
        `SELECT g.id, g.name FROM \"Group\" g
         JOIN GroupMember gm ON gm.groupId = g.id
         WHERE gm.userId = ? AND g.id NOT IN (SELECT id FROM Channel)`
      )
      .all(user!.id);
    const groups = rows.map((r) => {
      const memberIds = db
        .query("SELECT userId FROM GroupMember WHERE groupId = ?")
        .all(r.id)
        .map((m) => (m as { userId: string }).userId);
      return { ...r, memberIds };
    });
    cb?.(groups);
  });

  socket.on("group:open", (gid: string, cb) => {
    const isMember = db
      .query("SELECT id FROM GroupMember WHERE groupId = ? AND userId = ?")
      .get(gid, user!.id);
    if (!isMember) return cb?.({ error: "Not a member" });
    const memberRows = db
      .query(
        `SELECT u.id, u.username, u.displayName, u.avatarUrl, u.status, u.role FROM GroupMember gm
         JOIN User u ON gm.userId = u.id WHERE gm.groupId = ?`
      )
      .all(gid);
    socket.join("dm:g:" + gid);
    cb?.({
      key: "g:" + gid,
      members: memberRows,
      messages: fetchMessages("m.dmKey = ?", "g:" + gid),
    });
  });

  socket.on("group:invite", (p: { groupId: string; username: string }, cb) => {
    const t = getUserByUsername(String(p?.username ?? "").trim());
    if (!t) return cb?.({ error: "User not found" });
    db.run('INSERT OR IGNORE INTO GroupMember (id, groupId, userId) VALUES (?, ?, ?)', [
      cuidish(), p.groupId, t.id,
    ]);
    for (const [sid, o] of online) if (o.user.id === t.id) io.to(sid).emit("group:invited", p.groupId);
    cb?.({ ok: true });
  });

  /* ---- friends ---- */
  socket.on("friends:list", (cb) => {
    const rows = db
      .query(
        `SELECT f.*, 
                CASE WHEN f.initiatorId = ? THEN f.receiverId ELSE f.initiatorId END AS otherId
         FROM Friendship f WHERE f.initiatorId = ? OR f.receiverId = ?`
      )
      .all(user!.id, user!.id, user!.id);
    const out = rows.map((r) => {
      const o = db
        .query("SELECT id, username, displayName, avatarUrl, status, role FROM User WHERE id = ?")
        .get((r as { otherId: string }).otherId);
      return {
        id: (r as { id: string }).id,
        status: (r as { status: string }).status,
        user: o,
        /* direction lets the client split incoming vs outgoing requests */
        direction: (r as { initiatorId: string }).initiatorId === user!.id ? "outgoing" : "incoming",
      };
    });
    cb?.(out);
  });

  socket.on("friends:request", (username: string, cb) => {
    const t = getUserByUsername(String(username ?? "").trim());
    if (!t) return cb?.({ error: "User not found" });
    if (t.id === user!.id) return cb?.({ error: "That's you" });
    const existing = db
      .query(
        `SELECT * FROM Friendship WHERE (initiatorId=? AND receiverId=?) OR (initiatorId=? AND receiverId=?)`
      )
      .get(user!.id, t.id, t.id, user!.id);
    if (existing) return cb?.({ error: "Request already exists or you are friends" });
    db.run("INSERT INTO Friendship (id, initiatorId, receiverId, status, createdAt) VALUES (?, ?, ?, 'pending', ?)", [
      cuidish(), user!.id, t.id, Date.now(),
    ]);
    for (const [sid, o] of online) if (o.user.id === t.id) io.to(sid).emit("friends:incoming", publicUser(user!));
    cb?.({ ok: true });
  });

  socket.on("friends:respond", (p: { id: string; accept: boolean }, cb) => {
    const f = db.query("SELECT * FROM Friendship WHERE id = ?").get(p.id) as
      | { id: string; receiverId: string; initiatorId: string }
      | undefined;
    if (!f || f.receiverId !== user!.id) return cb?.({ error: "Not found" });
    if (p.accept) db.run("UPDATE Friendship SET status='accepted' WHERE id = ?", [p.id]);
    else db.run("DELETE FROM Friendship WHERE id = ?", [p.id]);
    cb?.({ ok: true });
  });

  socket.on("friends:remove", (id: string, cb) => {
    db.run("DELETE FROM Friendship WHERE id = ? AND (initiatorId = ? OR receiverId = ?)", [
      id, user!.id, user!.id,
    ]);
    cb?.({ ok: true });
  });

  socket.on("users:query", (q: string, cb) => {
    const term = String(q ?? "").trim().toLowerCase();
    if (term.length < 2) return cb?.([]);
    const rows = db
      .query(
        `SELECT id, username, displayName, avatarUrl, status, role FROM User
         WHERE (LOWER(username) LIKE ? OR LOWER(COALESCE(displayName,'')) LIKE ?) AND banned = 0
         LIMIT 10`
      )
      .all(`%${term}%`, `%${term}%`);
    cb?.(rows);
  });

  /* ---- profile ---- */
  socket.on("profile:get", (username: string, cb) => {
    const t = getUserByUsername(String(username ?? "").trim());
    if (!t) return cb?.({ error: "User not found" });
    const msgCount = db
      .query("SELECT COUNT(*) as c FROM Message WHERE userId = ? AND deleted = 0")
      .get(t.id) as { c: number };
    cb?.({ user: publicUser(t), messages: msgCount.c });
  });

  /* ---- polls ---- */
  socket.on("poll:create", (p: { channelId: string; question: string; options: string[]; minutes: number }, cb) => {
    const q = String(p?.question ?? "").slice(0, 140).trim();
    const options = (p?.options ?? []).map((o) => String(o).slice(0, 60).trim()).filter(Boolean).slice(0, 4);
    if (!q || options.length < 2) return cb?.({ error: "Need a question and at least 2 options" });
    /* the poll lands in a channel — the creator needs access to it */
    const ch = db.query("SELECT * FROM Channel WHERE id = ?").get(String(p?.channelId ?? "")) as
      | { id: string; isPrivate: number; locked: number }
      | undefined;
    const u = freshUser();
    if (!ch) return cb?.({ error: "Channel not found" });
    if (!canAccessChannel(u, ch)) return cb?.({ error: "No access" });
    if (ch.locked && !isStaff(u)) return cb?.({ error: "Channel is locked" });
    if (muted(u)) return cb?.({ error: `You are muted until ${new Date(u.mutedUntil!).toLocaleTimeString()}` });
    const endsAt = Date.now() + Math.min(1440, Math.max(1, p?.minutes ?? 15)) * 60000;
    const poll = { question: q, options: options.map((text) => ({ text, voters: [] })), endsAt };
    const id = insertMessage(u.id, q, { channelId: p.channelId, poll });
    const msg = messageWithJoins(id);
    io.to("ch:" + p.channelId).emit("chat:message", msg);
    cb?.({ ok: true });
  });

  socket.on("poll:vote", (p: { messageId: string; optionIndex: number }, cb) => {
    const m = db.query("SELECT * FROM Message WHERE id = ?").get(p.messageId) as
      | { id: string; channelId: string | null; dmKey: string | null; poll: string | null }
      | undefined;
    if (!m || !m.poll) return cb?.({ error: "Poll not found" });
    const poll = JSON.parse(m.poll);
    if (poll.endsAt < Date.now()) return cb?.({ error: "Poll has ended" });
    if (p.optionIndex < 0 || p.optionIndex >= poll.options.length) return cb?.({ error: "Bad option" });
    for (const opt of poll.options) opt.voters = (opt.voters as string[]).filter((v) => v !== user!.id);
    poll.options[p.optionIndex].voters.push(user!.id);
    db.run("UPDATE Message SET poll = ? WHERE id = ?", [JSON.stringify(poll), p.messageId]);
    const msg = messageWithJoins(p.messageId);
    if (m.channelId) io.to("ch:" + m.channelId).emit("chat:updated", msg);
    if (m.dmKey) io.to("dm:" + m.dmKey).emit("chat:updated", msg);
    cb?.({ ok: true });
  });

  /* ---- coins, claim, leaderboard ---- */
  socket.on("coins:claim", (cb) => {
    const u = freshUser();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    if (u.lastClaimAt && Number(u.lastClaimAt) >= startOfToday)
      return cb?.({ error: "Already claimed today" });
    const streak = u.lastClaimAt && Number(u.lastClaimAt) >= startOfYesterday ? u.streak + 1 : 1;
    const reward = 20 * Math.min(streak, 7);
    db.run("UPDATE User SET coins = coins + ?, streak = ?, lastClaimAt = ? WHERE id = ?", [
      reward, streak, Date.now(), u.id,
    ]);
    emitUserUpdate(io, u.id);
    cb?.({ ok: true, streak, reward });
  });

  socket.on("leaderboard", (mode: string, cb) => {
    const col = ["xp", "coins", "msgs", "streak"].includes(mode) ? mode : "xp";
    const rows =
      col === "msgs"
        ? db
            .query(
              `SELECT u.username, u.displayName, COUNT(m.id) AS score FROM User u
               JOIN Message m ON m.userId = u.id AND m.deleted = 0
               GROUP BY u.id ORDER BY score DESC LIMIT 15`
            )
            .all()
        : db
            .query(
              `SELECT username, displayName, ${col === "coins" ? "coins" : col === "xp" ? "xp" : "streak"} AS score
               FROM User WHERE banned = 0 ORDER BY score DESC LIMIT 15`
            )
            .all();
    cb?.(rows);
  });

  /* ---- soundboard ---- */
  socket.on("sound:play", (soundId: string) => {
    const cfg = settings();
    if (!cfg.soundboard) return;
    if (muted(freshUser())) return;
    /* broadcast to everyone EXCEPT the sender — the client already
       played the sound locally, so io.emit would double it for them */
    socket.broadcast.emit("sound:play", { soundId: String(soundId).slice(0, 24), by: user!.username });
  });

  /* ---- listen party ---- */
  socket.on("party:join", (cb) => {
    socket.join("party");
    const state = partyState;
    const members = countInRoom(io, "party");
    cb?.({ ...state, members });
    io.to("party").emit("party:members", members);
  });

  socket.on("party:leave", () => {
    socket.leave("party");
    io.to("party").emit("party:members", countInRoom(io, "party"));
  });

  socket.on("party:state", (state: { trackId: string; position: number; playing: boolean }) => {
    if (!state || typeof state.trackId !== "string") return;
    partyState = {
      trackId: state.trackId.slice(0, 64),
      position: Number(state.position) || 0,
      playing: !!state.playing,
      ts: Date.now(),
      host: user!.username,
    };
    io.to("party").emit("party:state", partyState);
  });

  socket.on("party:chat", (text: string) => {
    io.to("party").emit("party:chat", {
      by: user!.username,
      text: String(text ?? "").slice(0, 200),
    });
  });

  /* ---- private channels ---- */
  socket.on("channel:create", (p: { name: string; minutes: number }, cb) => {
    const name = String(p?.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 24)
      .replace(/^-+|-+$/g, "");
    if (name.length < 3) return cb?.({ error: "Name must be at least 3 characters" });
    const exists = db.query("SELECT id FROM Channel WHERE name = ?").get(name);
    if (exists) return cb?.({ error: "That channel name is taken" });
    const id = cuidish();
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = p?.minutes && p.minutes > 0 ? Date.now() + p.minutes * 60000 : null;
    db.run(
      `INSERT INTO Channel (id, name, topic, kind, isPrivate, inviteCode, expiresAt, locked, createdBy, createdAt)
       VALUES (?, ?, ?, 'text', 1, ?, ?, 0, ?, ?)`,
      [id, name, "Private channel", code, expiresAt, user!.id, Date.now()]
    );
    db.run('INSERT INTO "Group" (id, name, createdBy, createdAt) VALUES (?, ?, ?, ?)', [
      id, name, user!.id, Date.now(),
    ]);
    db.run("INSERT INTO GroupMember (id, groupId, userId) VALUES (?, ?, ?)", [cuidish(), id, user!.id]);
    cb?.({ ok: true, id, name, code });
  });

  socket.on("channel:join", (code: string, cb) => {
    const ch = db
      .query("SELECT * FROM Channel WHERE isPrivate = 1 AND inviteCode = ?")
      .get(String(code ?? "").toUpperCase().trim()) as
      | { id: string; name: string; expiresAt: number | null }
      | undefined;
    if (!ch) return cb?.({ error: "Invalid invite code" });
    if (ch.expiresAt && Number(ch.expiresAt) < Date.now())
      return cb?.({ error: "This channel has expired" });
    db.run('INSERT OR IGNORE INTO GroupMember (id, groupId, userId) VALUES (?, ?, ?)', [
      cuidish(), ch.id, user!.id,
    ]);
    cb?.({ ok: true, id: ch.id, name: ch.name });
  });

  /* ---- moderation ---- */
  socket.on("mod:action", (p: { action: string; target?: string; seconds?: number; reason?: string; value?: string }, cb) => {
    const u = freshUser();
    if (!isStaff(u)) return cb?.({ error: "Staff only" });
    const action = String(p?.action ?? "");
    const target = p.target ? getUserByUsername(String(p.target).trim()) : null;

    const roleRank = (r: string) => ({ owner: 3, admin: 2, mod: 1, member: 0 }[r] ?? 0);
    if (target && roleRank(target.role) >= roleRank(u.role) && target.id !== u.id)
      return cb?.({ error: "You cannot moderate that user" });

    switch (action) {
      case "mute": {
        if (!target) return cb?.({ error: "Target not found" });
        const secs = Math.min(86400 * 30, Math.max(60, p.seconds ?? 600));
        db.run("UPDATE User SET mutedUntil = ? WHERE id = ?", [Date.now() + secs * 1000, target.id]);
        logMod(io, u.username, target.username, "mute", `${secs}s`);
        return cb?.({ ok: true });
      }
      case "unmute": {
        if (!target) return cb?.({ error: "Target not found" });
        db.run("UPDATE User SET mutedUntil = NULL WHERE id = ?", [target.id]);
        logMod(io, u.username, target.username, "unmute", "");
        return cb?.({ ok: true });
      }
      case "warn": {
        if (!target) return cb?.({ error: "Target not found" });
        const id = insertMessage(user!.id, `⚠️ ${target.username} has been warned${p.reason ? `: ${p.reason}` : "."}`, {
          channelId: p.value,
          isSystem: true,
        });
        io.to("ch:" + p.value).emit("chat:message", messageWithJoins(id));
        logMod(io, u.username, target.username, "warn", String(p.reason ?? ""));
        return cb?.({ ok: true });
      }
      case "ban": {
        if (!target) return cb?.({ error: "Target not found" });
        if (target.role === "owner") return cb?.({ error: "Cannot ban the owner" });
        db.run("UPDATE User SET banned = 1, banReason = ? WHERE id = ?", [
          String(p.reason ?? "rule violation").slice(0, 200), target.id,
        ]);
        for (const [sid, o] of online) if (o.user.id === target.id) io.to(sid).disconnectSockets(true);
        logMod(io, u.username, target.username, "ban", String(p.reason ?? ""));
        return cb?.({ ok: true });
      }
      case "unban": {
        if (!target) return cb?.({ error: "Target not found" });
        db.run("UPDATE User SET banned = 0, banReason = NULL WHERE id = ?", [target.id]);
        logMod(io, u.username, target.username, "unban", "");
        return cb?.({ ok: true });
      }
      case "role": {
        if (!target) return cb?.({ error: "Target not found" });
        const role = String(p.value ?? "");
        if (!["member", "mod", "admin"].includes(role)) return cb?.({ error: "Bad role" });
        if (u.role !== "owner" && role !== "member") return cb?.({ error: "Only the owner grants staff roles" });
        db.run("UPDATE User SET role = ? WHERE id = ?", [role, target.id]);
        logMod(io, u.username, target.username, `role → ${role}`, "");
        return cb?.({ ok: true });
      }
      case "lockChannel":
      case "unlockChannel": {
        db.run("UPDATE Channel SET locked = ? WHERE id = ?", [action === "lockChannel" ? 1 : 0, p.value]);
        io.to("ch:" + p.value).emit("chat:notice", action === "lockChannel" ? "Channel locked by staff." : "Channel unlocked.");
        logMod(io, u.username, null, action, String(p.value));
        return cb?.({ ok: true });
      }
      case "clearChannel": {
        db.run("UPDATE Message SET deleted = 1 WHERE channelId = ?", [p.value]);
        io.to("ch:" + p.value).emit("chat:cleared");
        logMod(io, u.username, null, "clearChannel", String(p.value));
        return cb?.({ ok: true });
      }
      case "settings": {
        const cfg = settings();
        updateSettings({
          wordFilter: p.value !== undefined ? String(p.value).slice(0, 2000) : cfg.wordFilter,
          automodEnabled: p.seconds !== undefined ? (p.seconds ? 1 : 0) : cfg.automodEnabled,
        });
        logMod(io, u.username, null, "settings", String(p.value ?? ""));
        return cb?.({ ok: true, settings: settings() });
      }
      case "registrations": {
        const cfg = settings();
        updateSettings({ registrations: cfg.registrations ? 0 : 1 });
        return cb?.({ ok: true, enabled: settings().registrations });
      }
      default:
        return cb?.({ error: "Unknown action" });
    }
  });

  socket.on("mod:audit", (cb) => {
    if (!isStaff(user!)) return cb?.({ error: "Staff only" });
    const rows = db
      .query("SELECT * FROM ModAction ORDER BY createdAt DESC LIMIT 50")
      .all();
    cb?.(rows);
  });

  socket.on("mod:restrictions", (cb) => {
    if (!isStaff(user!)) return cb?.({ error: "Staff only" });
    const banned = db.query("SELECT username, banReason, createdAt FROM User WHERE banned = 1").all();
    const mutedRows = db
      .query("SELECT username, mutedUntil FROM User WHERE mutedUntil > ?")
      .all(Date.now());
    cb?.({ banned, muted: mutedRows });
  });

  /* ---- disconnect ---- */
  socket.on("disconnect", () => {
    online.delete(socket.id);
    const set = usernameToSockets.get(user!.username);
    if (set) {
      set.delete(socket.id);
      if (!set.size) usernameToSockets.delete(user!.username);
    }
    broadcastPresence(io);
  });
});

/* ---------------- party state ---------------- */

let partyState = { trackId: "", position: 0, playing: false, ts: 0, host: "" };

function countInRoom(io: Server, room: string) {
  const sids = io.sockets.adapter.rooms.get(room);
  return sids ? sids.size : 0;
}

/* ---------------- helpers: casino, counting, logs ---------------- */

function logMod(io: Server, actor: string | null, target: string | null, action: string, reason: string) {
  db.run(
    "INSERT INTO ModAction (id, actorId, targetId, action, reason, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    [cuidish(), actor ?? "auto-mod", target ?? "", action, reason, Date.now()]
  );
  const logChannel = db.query("SELECT id FROM Channel WHERE name = 'logs'").get() as
    | { id: string }
    | undefined;
  if (logChannel) {
    const id = insertMessage(
      SYSTEM_USER_ID,
      `${actor ?? "auto-mod"} → ${action}${target ? ` on @${target}` : ""}${reason ? ` (${reason})` : ""}`,
      { channelId: logChannel.id, isSystem: true }
    );
    io.to("ch:" + logChannel.id).emit("chat:message", messageWithJoins(id));
  }
}

function handleCasino(socket: Socket, io: Server, u: UserRow, ch: { id: string; kind: string }, content: string, cb: (r: unknown) => void) {
  const parts = content.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const bet = Math.max(1, Math.min(1000, parseInt(parts[1] ?? "10", 10) || 10));

  const sys = (text: string) => {
    const id = insertMessage(u.id, text, { channelId: ch.id, isSystem: true });
    io.to("ch:" + ch.id).emit("chat:message", messageWithJoins(id));
  };

  if (u.coins < bet) {
    return cb?.({ error: "Not enough coins for that bet" });
  }

  if (cmd === "flip") {
    const side = (parts[2] ?? "heads").toLowerCase();
    if (!["heads", "tails"].includes(side)) return cb?.({ error: "Usage: /flip <bet> heads|tails" });
    addCoins(u.id, -bet);
    const result = Math.random() < 0.5 ? "heads" : "tails";
    if (side === result) {
      addCoins(u.id, bet * 2);
      sys(`🪙 ${result} — ${u.username} won ${bet} coins`);
    } else {
      sys(`🪙 ${result} — ${u.username} lost ${bet} coins`);
    }
    emitUserUpdate(io, u.id);
    return cb?.({ ok: true });
  }
  if (cmd === "slots") {
    addCoins(u.id, -bet);
    const reels = slotsSpin();
    const jackpot = reels[0] === reels[1] && reels[1] === reels[2];
    const two = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
    let win = 0;
    if (jackpot) win = bet * 10;
    else if (two) win = Math.floor(bet * 1.5);
    if (win) addCoins(u.id, win);
    sys(
      `${reels.join(" ")} — ${u.username} ${win ? `won ${win} coins` : `lost ${bet} coins`}`
    );
    emitUserUpdate(io, u.id);
    return cb?.({ ok: true });
  }
  if (cmd === "balance" || cmd === "bal") {
    return cb?.({ ok: true, notice: `You have ${u.coins} coins.` });
  }
  return cb?.({ error: "Commands: /flip <bet> heads|tails · /slots <bet> · /bal" });
}

function handleCounting(socket: Socket, io: Server, u: UserRow, ch: { id: string; kind: string }, content: string, cb: (r: unknown) => void) {
  const num = parseInt(content.trim(), 10);
  const lastRow = db
    .query(
      `SELECT m.content, m.userId FROM Message m WHERE m.channelId = ? AND m.isSystem = 0 AND m.deleted = 0
       ORDER BY m.createdAt DESC LIMIT 1`
    )
    .get(ch.id) as { content: string; userId: string } | undefined;
  const expected = lastRow ? (parseInt(lastRow.content, 10) || 0) + 1 : 1;
  if (!Number.isFinite(num) || String(num) !== content.trim()) {
    return cb?.({ error: "Numbers only in this channel" });
  }
  if (lastRow && lastRow.userId === u.id) {
    return cb?.({ error: "You can't count twice in a row" });
  }
  if (num !== expected) {
    const id = insertMessage(u.id, content, { channelId: ch.id });
    io.to("ch:" + ch.id).emit("chat:message", messageWithJoins(id));
    const sysId = insertMessage(
      u.id,
      `❌ ${u.username} broke the chain at ${expected - 1}. Counting restarts at 1.`,
      { channelId: ch.id, isSystem: true }
    );
    io.to("ch:" + ch.id).emit("chat:message", messageWithJoins(sysId));
    return cb?.({ ok: true });
  }
  const id = insertMessage(u.id, content, { channelId: ch.id });
  io.to("ch:" + ch.id).emit("chat:message", messageWithJoins(id));
  if (num % 100 === 0) {
    addCoins(u.id, 10);
    emitUserUpdate(io, u.id);
    const sysId = insertMessage(u.id, `🏆 ${num}! ${u.username} earned 10 coins.`, {
      channelId: ch.id,
      isSystem: true,
    });
    io.to("ch:" + ch.id).emit("chat:message", messageWithJoins(sysId));
  }
  return cb?.({ ok: true });
}

/* ---------------- start ---------------- */

httpServer.listen(PORT, () => {
  console.log(`Memphis chat service running on :${PORT}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
