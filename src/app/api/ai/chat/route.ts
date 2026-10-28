import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_TOKEN_LIMIT = 6700;

const SYSTEM_BASE = `You are the Memphis Study Portal AI tutor — a patient, encouraging K-12 study assistant.
Rules:
- Help students learn: explain step by step, check their reasoning, give hints before answers.
- Cover math, science, English, social studies, world languages and test prep.
- Keep answers clear and age-appropriate; use short markdown sections, bullets and worked examples.
- If asked about something off-topic or unsafe, gently steer back to studying.`;

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`ai:chat:${ip}`, 20, 0.2))
    return Response.json(
      { error: "You're sending messages too quickly. Wait a moment." },
      { status: 429 }
    );

  let body: {
    conversationId?: string;
    message?: string;
    instructions?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) return Response.json({ error: "Empty message" }, { status: 400 });

  const user = await getSessionUser(req);
  if (!user)
    return Response.json(
      { error: "Sign in to Chat (username + password) to use the AI tutor." },
      { status: 401 }
    );

  /* daily token quota */
  const day = new Date().toISOString().slice(0, 10);
  const usage = await db.aITokenUsage.upsert({
    where: { userId_day: { userId: user.id, day } },
    create: { userId: user.id, day, tokens: 0 },
    update: {},
  });
  if (usage.tokens >= DAILY_TOKEN_LIMIT)
    return Response.json(
      { error: "Daily token limit reached. The quota resets tomorrow." },
      { status: 429 }
    );

  /* find or create conversation */
  let conversation = body.conversationId
    ? await db.aIConversation.findFirst({
        where: { id: body.conversationId, userId: user.id },
      })
    : null;
  if (!conversation) {
    conversation = await db.aIConversation.create({
      data: {
        userId: user.id,
        title: message.slice(0, 48),
        instructions: (body.instructions ?? "").slice(0, 1000),
      },
    });
  } else if (body.instructions !== undefined) {
    await db.aIConversation.update({
      where: { id: conversation.id },
      data: { instructions: (body.instructions ?? "").slice(0, 1000) },
    });
  }

  /* history (last 20 turns to bound tokens) */
  const history = await db.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const systemMsg =
    body.instructions?.trim()
      ? `${SYSTEM_BASE}\n\nStudent's custom instructions: ${body.instructions.trim()}`
      : SYSTEM_BASE;

  const messages = [
    { role: "system" as const, content: systemMsg },
    ...history.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  await db.aIMessage.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  /* call the model */
  let reply = "";
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });
    reply =
      completion?.choices?.[0]?.message?.content ??
      "(The tutor had trouble answering — try again.)";
  } catch {
    return Response.json(
      { error: "The AI service is unavailable right now. Try again in a moment." },
      { status: 502 }
    );
  }

  const saved = await db.aIMessage.create({
    data: { conversationId: conversation.id, role: "assistant", content: reply },
  });

  /* token accounting (approx: chars/4) */
  const used = Math.ceil((message.length + reply.length) / 4);
  const updatedUsage = await db.aITokenUsage.update({
    where: { userId_day: { userId: user.id, day } },
    data: { tokens: { increment: used } },
  });

  await db.aIConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  return Response.json({
    conversationId: conversation.id,
    message: {
      id: saved.id,
      role: "assistant",
      content: reply,
      createdAt: saved.createdAt,
    },
    tokensUsed: updatedUsage.tokens,
    tokenLimit: DAILY_TOKEN_LIMIT,
  });
}
