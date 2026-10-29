import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSessionId(s: string | null): boolean {
  return !!s && /^[a-zA-Z0-9_-]{8,64}$/.test(s);
}

/**
 * GET /api/ai/conversations?sessionId=... — list conversations for an anonymous browser session
 */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!validSessionId(sessionId)) return Response.json({ conversations: [] });
  const conversations = await db.aIConversation.findMany({
    where: { sessionId: sessionId! },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      title: true,
      instructions: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return Response.json({ conversations });
}
