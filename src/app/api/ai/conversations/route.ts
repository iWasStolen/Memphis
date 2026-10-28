import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/conversations — list the user's conversations + today's token usage
 */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return Response.json({ conversations: [], tokensUsed: 0 });
  const day = new Date().toISOString().slice(0, 10);
  const usage = await db.aITokenUsage.findUnique({
    where: { userId_day: { userId: user.id, day } },
  });
  const conversations = await db.aIConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      instructions: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return Response.json({
    conversations,
    tokensUsed: usage?.tokens ?? 0,
  });
}

/**
 * POST /api/ai/conversations — create an empty conversation
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  let body: { title?: string; instructions?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const conversation = await db.aIConversation.create({
    data: {
      userId: user.id,
      title: (body.title ?? "New chat").slice(0, 60),
      instructions: (body.instructions ?? "").slice(0, 1000),
    },
  });
  return Response.json({ conversation });
}
