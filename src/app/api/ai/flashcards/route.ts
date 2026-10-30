import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/flashcards — generate study flashcards from a conversation
 * body: { sessionId, conversationId?, topic? }
 * Returns { cards: [{ front, back }] } — the client stores them locally.
 */
export async function POST(req: Request) {
  let body: { sessionId?: string; conversationId?: string; topic?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const sessionId = body.sessionId ?? "";
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });

  /* gather source text: conversation history or topic */
  let source = "";
  if (body.conversationId) {
    const conversation = await db.aIConversation.findFirst({
      where: { id: body.conversationId, sessionId },
    });
    if (!conversation)
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    const messages = (
      await db.aIMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    ).reverse();
    source = messages.map((m) => `${m.role}: ${m.content}`).join("\n").slice(-6000);
  } else if (body.topic) {
    source = `Topic: ${String(body.topic).slice(0, 300)}`;
  }
  if (!source.trim())
    return Response.json(
      { error: "Nothing to study yet — chat with the tutor first." },
      { status: 400 }
    );

  let raw = "";
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You create study flashcards. Reply with ONLY a JSON array of 6-10 objects like [{\"front\":\"question or term\",\"back\":\"answer or definition\"}]. No markdown, no commentary.",
        },
        {
          role: "user",
          content: `Create flashcards from this study material:\n\n${source}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    raw = completion?.choices?.[0]?.message?.content ?? "";
  } catch {
    return Response.json(
      { error: "The AI service is unavailable right now." },
      { status: 502 }
    );
  }

  /* parse defensively */
  let cards: { front: string; back: string }[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(match ? match[0] : raw);
    if (Array.isArray(arr)) {
      cards = arr
        .map((c: { front?: unknown; back?: unknown }) => ({
          front: String(c?.front ?? "").slice(0, 300),
          back: String(c?.back ?? "").slice(0, 500),
        }))
        .filter((c) => c.front && c.back)
        .slice(0, 12);
    }
  } catch {
    /* fallthrough */
  }
  if (!cards.length)
    return Response.json(
      { error: "Could not build flashcards from this material. Try again." },
      { status: 502 }
    );

  return Response.json({ cards });
}
