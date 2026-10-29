import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function validSessionId(s: string | null): boolean {
  return !!s && /^[a-zA-Z0-9_-]{8,64}$/.test(s);
}

function sessionFrom(req: Request): string | null {
  return new URL(req.url).searchParams.get("sessionId");
}

/**
 * GET /api/ai/conversations/<id>?sessionId=... — full message history
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessionId = sessionFrom(req);
  if (!validSessionId(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  const conversation = await db.aIConversation.findFirst({
    where: { id, sessionId: sessionId! },
  });
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  /* newest 500 messages, restored to chronological order */
  const messages = (
    await db.aIMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: 500,
    })
  ).reverse();
  return Response.json({ conversation, messages });
}

/**
 * PATCH /api/ai/conversations/<id>?sessionId=... — rename / update instructions
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessionId = sessionFrom(req);
  if (!validSessionId(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  let body: { title?: string; instructions?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const conversation = await db.aIConversation.findFirst({
    where: { id, sessionId: sessionId! },
  });
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  /* JSON bodies may carry non-strings — coerce so .slice never throws */
  const title = body.title !== undefined ? String(body.title ?? "").slice(0, 60) : undefined;
  const instructions =
    body.instructions !== undefined ? String(body.instructions ?? "").slice(0, 1000) : undefined;
  const updated = await db.aIConversation.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
    },
  });
  return Response.json({ conversation: updated });
}

/**
 * DELETE /api/ai/conversations/<id>?sessionId=... — remove a conversation
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessionId = sessionFrom(req);
  if (!validSessionId(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  const conversation = await db.aIConversation.findFirst({
    where: { id, sessionId: sessionId! },
  });
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  await db.aIConversation.delete({ where: { id } });
  return Response.json({ ok: true });
}
