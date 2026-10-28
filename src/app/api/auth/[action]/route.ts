import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionUser,
  publicUser,
  jsonError,
  validUsername,
  hashRecoveryCode,
} from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action !== "me") return jsonError("Not found", 404);
  const user = await getSessionUser(req);
  if (!user) return Response.json({ user: null });
  return Response.json({ user: publicUser(user) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  const ip = clientIp(req);

  if (action === "register") {
    if (!rateLimit(`auth:reg:${ip}`, 5, 1 / 60))
      return jsonError("Too many attempts. Try again later.", 429);
    let body: { username?: string; password?: string; recoveryCode?: string };
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid request");
    }
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    const recoveryCode = (body.recoveryCode ?? "").trim();
    if (!validUsername(username))
      return jsonError("Username must be 3-16 characters (letters, numbers, _ .)");
    if (password.length < 6)
      return jsonError("Password must be at least 6 characters");
    if (recoveryCode && !/^[A-Za-z0-9-]{6,32}$/.test(recoveryCode))
      return jsonError("Recovery code must be 6-32 characters (letters, numbers, dashes)");
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) return jsonError("Username is already taken");
    const count = await db.user.count();
    const user = await db.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        role: count === 0 ? "owner" : "member",
        recoveryHash: recoveryCode ? hashRecoveryCode(recoveryCode) : null,
      },
    });
    const session = await createSession(user.id);
    return Response.json({
      token: session.token,
      user: publicUser(user),
      recoveryCodeSet: !!recoveryCode,
    });
  }

  if (action === "login") {
    if (!rateLimit(`auth:login:${ip}`, 10, 1 / 30))
      return jsonError("Too many attempts. Try again later.", 429);
    let body: { username?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid request");
    }
    const user = await db.user.findUnique({
      where: { username: (body.username ?? "").trim() },
    });
    if (!user || !verifyPassword(body.password ?? "", user.passwordHash))
      return jsonError("Invalid username or password", 401);
    if (user.banned)
      return jsonError(`Account banned: ${user.banReason || "rule violation"}`, 403);
    const session = await createSession(user.id);
    return Response.json({ token: session.token, user: publicUser(user) });
  }

  if (action === "logout") {
    const header = req.headers.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) {
      await db.session.deleteMany({ where: { token } });
    }
    return Response.json({ ok: true });
  }

  if (action === "password") {
    const user = await getSessionUser(req);
    if (!user) return jsonError("Not signed in", 401);
    if (!rateLimit(`auth:pw:${ip}`, 5, 1 / 60))
      return jsonError("Too many attempts", 429);
    const body = (await req.json().catch(() => ({}))) as {
      current?: string;
      next?: string;
    };
    if (!verifyPassword(body.current ?? "", user.passwordHash))
      return jsonError("Current password is incorrect");
    if ((body.next ?? "").length < 6)
      return jsonError("New password must be at least 6 characters");
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.next!) },
    });
    return Response.json({ ok: true });
  }

  if (action === "recover") {
    if (!rateLimit(`auth:rec:${ip}`, 5, 1 / 60))
      return jsonError("Too many attempts", 429);
    const body = (await req.json().catch(() => ({}))) as {
      username?: string;
      recoveryCode?: string;
      newPassword?: string;
    };
    const user = await db.user.findUnique({
      where: { username: (body.username ?? "").trim() },
    });
    if (!user || !user.recoveryHash)
      return jsonError("No recovery code is set for this account");
    if (hashRecoveryCode(body.recoveryCode ?? "") !== user.recoveryHash)
      return jsonError("Invalid recovery code");
    if ((body.newPassword ?? "").length < 6)
      return jsonError("New password must be at least 6 characters");
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.newPassword!) },
    });
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    const user = await getSessionUser(req);
    if (!user) return jsonError("Not signed in", 401);
    const body = (await req.json().catch(() => ({}))) as { password?: string };
    if (!verifyPassword(body.password ?? "", user.passwordHash))
      return jsonError("Password is incorrect");
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    return Response.json({ ok: true });
  }

  return jsonError("Not found", 404);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action !== "profile") return jsonError("Not found", 404);
  const user = await getSessionUser(req);
  if (!user) return jsonError("Not signed in", 401);
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    bio?: string;
    status?: string;
    avatarUrl?: string;
    dmPolicy?: string;
  };
  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) {
    const dn = body.displayName.trim();
    if (dn.length > 24) return jsonError("Display name too long (max 24)");
    data.displayName = dn || null;
  }
  if (body.bio !== undefined) {
    if (body.bio.length > 200) return jsonError("Bio too long (max 200)");
    data.bio = body.bio;
  }
  if (body.status !== undefined) {
    if (body.status.length > 40) return jsonError("Status too long (max 40)");
    data.status = body.status;
  }
  if (body.avatarUrl !== undefined) {
    const u = body.avatarUrl.trim();
    if (u && !/^https:\/\//i.test(u))
      return jsonError("Avatar must be an https:// URL");
    if (u && u.length > 400) return jsonError("Avatar URL too long");
    data.avatarUrl = u || null;
  }
  if (body.dmPolicy !== undefined) {
    if (!["everyone", "friends", "off"].includes(body.dmPolicy))
      return jsonError("Invalid DM policy");
    data.dmPolicy = body.dmPolicy;
  }
  const updated = await db.user.update({ where: { id: user.id }, data });
  return Response.json({ user: publicUser(updated) });
}
