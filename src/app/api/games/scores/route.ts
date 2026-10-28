import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_GAMES = new Set([
  "2048", "snake", "tetris", "minesweeper", "breakout", "flappy",
  "pong", "memory", "tictactoe", "simon", "asteroids", "clicker",
]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  const mode = url.searchParams.get("mode") ?? "game";

  if (mode === "players") {
    const top = await db.gameScore.groupBy({
      by: ["playerName", "userId"],
      _sum: { score: true },
      _count: { score: true },
      orderBy: { _sum: { score: "desc" } },
      take: 20,
    });
    return Response.json({
      players: top.map((t) => ({
        name: t.playerName,
        total: t._sum.score ?? 0,
        games: t._count.score,
      })),
    });
  }

  if (!game || !ALLOWED_GAMES.has(game)) return jsonError("Unknown game");
  const scores = await db.gameScore.findMany({
    where: { game },
    orderBy: { score: "desc" },
    take: 15,
  });
  return Response.json({
    scores: scores.map((s) => ({
      id: s.id,
      name: s.playerName,
      score: s.score,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`score:${ip}`, 12, 0.2))
    return jsonError("Too many score submissions", 429);
  const user = await getSessionUser(req);
  const body = (await req.json().catch(() => ({}))) as {
    game?: string;
    score?: number;
  };
  const game = body.game ?? "";
  const score = Math.floor(Number(body.score));
  if (!ALLOWED_GAMES.has(game)) return jsonError("Unknown game");
  if (!Number.isFinite(score) || score < 0 || score > 100_000_000)
    return jsonError("Invalid score");
  const playerName = user ? user.username : `guest-${ip.slice(-4)}`;
  await db.gameScore.create({
    data: { game, score, playerName, userId: user?.id ?? null },
  });
  if (user) {
    await db.user
      .update({ where: { id: user.id }, data: { xp: { increment: 5 } } })
      .catch(() => {});
  }
  return Response.json({ ok: true });
}
