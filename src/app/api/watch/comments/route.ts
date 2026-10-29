import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/watch/comments?item=<key>&page=1 — list comments
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const itemKey = (url.searchParams.get("item") ?? "").slice(0, 120);
  if (!itemKey) return Response.json({ comments: [] });
  const comments = await db.watchComment.findMany({
    where: { itemKey },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({ comments });
}

/**
 * POST /api/watch/comments — add a comment
 * body: { itemKey, content }
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`watch:comment:${ip}`, 10, 0.2))
    return Response.json({ error: "Too many comments — slow down." }, { status: 429 });

  let body: { itemKey?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const itemKey = (body.itemKey ?? "").slice(0, 120);
  const content = (body.content ?? "").trim().slice(0, 500);
  if (!itemKey || !content)
    return Response.json({ error: "Missing comment text" }, { status: 400 });

  const user = await getSessionUser(req);
  const comment = await db.watchComment.create({
    data: {
      itemKey,
      userId: user?.id ?? null,
      author: user?.username ?? "guest",
      content,
    },
  });
  return Response.json({ ok: true, comment });
}
