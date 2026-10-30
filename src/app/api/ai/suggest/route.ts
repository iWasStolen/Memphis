import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/suggest — short follow-up questions for the chat
 * body: { sessionId, conversationId }
 * Returns { suggestions: string[] } (empty on any failure — the UI
 * just hides the chips, never nags the user with an error).
 */
export async function POST(req: Request) {
  let body: { sessionId?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const sessionId = body.sessionId ?? "";
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  if (!body.conversationId)
    return Response.json({ suggestions: [] });

  const conversation = await db.aIConversation.findFirst({
    where: { id: body.conversationId, sessionId },
  });
  if (!conversation) return Response.json({ suggestions: [] });

  /* the last exchange is all the context the suggester needs */
  const messages = (
    await db.aIMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 2,
    })
  ).reverse();
  const lastUser = messages.find((m) => m.role === "user");
  const lastAssistant = messages.find((m) => m.role === "assistant");
  if (!lastUser || !lastAssistant) return Response.json({ suggestions: [] });

  const source =
    `User asked: ${lastUser.content.slice(0, 400)}\n\n` +
    `Assistant answered (excerpt): ${lastAssistant.content.slice(0, 1500)}`;

  let raw = "";
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            'You write follow-up suggestions for a chat assistant. Reply with ONLY a JSON array of exactly 3 short, natural follow-up questions or requests the user might send next (strings). Each under 60 characters, no numbering, no prose. Vary the angle (go deeper / apply it / challenge it). Match the language of the conversation.',
        },
        { role: "user", content: source },
      ],
      thinking: { type: "disabled" },
    });
    raw = completion?.choices?.[0]?.message?.content ?? "";
  } catch {
    return Response.json({ suggestions: [] });
  }

  let suggestions: string[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(match ? match[0] : raw);
    if (Array.isArray(arr)) {
      suggestions = arr
        .filter((s): s is string => typeof s === "string" && s.trim().length > 2)
        .map((s) => s.trim().slice(0, 80))
        .slice(0, 3);
    }
  } catch {
    /* fallthrough */
  }

  return Response.json({ suggestions });
}
