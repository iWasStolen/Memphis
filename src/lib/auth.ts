/* ============================================================
   Server-side auth helpers (scrypt hashing + session tokens)
   ============================================================ */

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { db } from "./db";
import { Prisma, Session as SessionModel } from "@prisma/client";

const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const test = scryptSync(password, salt, 64);
    const orig = Buffer.from(hash, "hex");
    return test.length === orig.length && timingSafeEqual(test, orig);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export async function createSession(userId: string): Promise<SessionModel> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return db.session.create({ data: { token, userId, expiresAt } });
}

export async function getSessionUser(req: Request) {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : null;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.banned) return null;
  return session.user;
}

export function publicUser(u: {
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
  mutedUntil: Date | null;
  banned: boolean;
  dmPolicy: string;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    bio: u.bio,
    status: u.status,
    avatarUrl: u.avatarUrl,
    xp: u.xp,
    coins: u.coins,
    streak: u.streak,
    mutedUntil: u.mutedUntil ? u.mutedUntil.toISOString() : null,
    banned: u.banned,
    dmPolicy: u.dmPolicy,
    createdAt: u.createdAt.toISOString(),
  };
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/* Validate username: 3-16 chars, alphanumeric + _ . */
export function validUsername(name: string): boolean {
  return /^[a-zA-Z0-9_.]{3,16}$/.test(name);
}

export { Prisma };
