import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   /api/ai/chat — Memphis AI, powered by GLM via z-ai-web-dev-sdk
   - No sign-in, no token quota, no rate limits.
   - Anonymous browser session owns its conversations.
   - Streams the reply over SSE, then persists both messages.
   ------------------------------------------------------------ */

const SYSTEM_BASE = `You are Memphis AI — a sharp, friendly, general-purpose assistant built into the Memphis unBLACKed web app.
You are powered by GLM, and you are completely free with no limits.
Guidelines:
- Answer anything: homework, code, creative writing, explanations, planning, chat.
- Use clean markdown: short sections, bullet lists, tables and fenced code blocks with language tags.
- Be direct and useful first; add brief context after when it helps.
- Match the user's language and tone.`;

const MAX_MESSAGE = 8000;
const HISTORY_TURNS = 30; /* messages of context (bounded, not limited per day) */

function validSessionId(s: unknown): s is string {
  return typeof s === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(s);
}

export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    conversationId?: string | null;
    message?: string;
    instructions?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, MAX_MESSAGE);
  if (!message) return Response.json({ error: "Empty message" }, { status: 400 });
  if (!validSessionId(body.sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });

  const sessionId = body.sessionId;
  const instructions = (body.instructions ?? "").slice(0, 1000);

  /* find or create the conversation */
  let conversation = body.conversationId
    ? await db.aIConversation.findFirst({
        where: { id: body.conversationId, sessionId },
      })
    : null;

  if (!conversation) {
    conversation = await db.aIConversation.create({
      data: {
        sessionId,
        title: message.slice(0, 60),
        instructions,
      },
    });
  } else if (body.instructions !== undefined && conversation.instructions !== instructions) {
    await db.aIConversation.update({
      where: { id: conversation.id },
      data: { instructions },
    });
  }

  const conversationId = conversation.id;

  /* recent history for context — take the NEWEST N messages
     (desc + take), then restore chronological order for the model */
  const history = (
    await db.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    })
  ).reverse();

  const systemMsg = instructions.trim()
    ? `${SYSTEM_BASE}\n\nThe user's custom instructions: ${instructions.trim()}`
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
    data: { conversationId, role: "user", content: message },
  });

  /* stream the model reply */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("meta", { conversationId });

      let reply = "";
      try {
        const { default: ZAI } = await import("z-ai-web-dev-sdk");
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages,
          thinking: { type: "disabled" },
          stream: true,
        });

        const decoder = new TextDecoder();
        let rawBuf = "";

        /* the sdk yields raw SSE bytes: data: {"choices":[{"delta":{"content":..}}]} */
        const consumeLine = (line: string) => {
          const t = line.trim();
          if (!t.startsWith("data:")) return;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") return;
          try {
            const obj = JSON.parse(payload) as {
              choices?: { delta?: { content?: string }; message?: { content?: string } }[];
            };
            const delta =
              obj?.choices?.[0]?.delta?.content ??
              obj?.choices?.[0]?.message?.content ??
              "";
            if (delta) {
              reply += delta;
              send("delta", { text: delta });
            }
          } catch {
            /* partial json — ignore */
          }
        };

        const consumeBuf = () => {
          const lines = rawBuf.split("\n");
          rawBuf = lines.pop() ?? "";
          for (const line of lines) consumeLine(line);
        };

        const iterable = completion as AsyncIterable<unknown> | null;
        if (iterable && typeof (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
          for await (const chunk of iterable) {
            if (chunk instanceof Uint8Array) {
              rawBuf += decoder.decode(chunk, { stream: true });
              consumeBuf();
            } else if (typeof chunk === "string") {
              rawBuf += chunk;
              consumeBuf();
            } else if (chunk && typeof chunk === "object") {
              /* already-parsed chunk objects */
              const obj = chunk as {
                choices?: { delta?: { content?: string }; message?: { content?: string } }[];
              };
              const delta =
                obj?.choices?.[0]?.delta?.content ??
                obj?.choices?.[0]?.message?.content ??
                "";
              if (delta) {
                reply += delta;
                send("delta", { text: delta });
              }
            }
          }
          rawBuf += decoder.decode();
          consumeBuf();
        } else {
          /* non-streaming fallback */
          const text =
            (completion as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
              ?.message?.content ?? "";
          if (text) {
            reply = text;
            send("delta", { text });
          }
        }

        if (!reply.trim()) {
          reply = "(empty response — please try again)";
          send("delta", { text: reply });
        }
      } catch (err) {
        send("error", {
          message:
            err instanceof Error
              ? `The model is unavailable right now (${err.message}). Try again.`
              : "The model is unavailable right now. Try again.",
        });
        controller.close();
        return;
      }

      /* persist the assistant reply */
      const saved = await db.aIMessage.create({
        data: { conversationId, role: "assistant", content: reply },
      });
      await db.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      send("done", {
        messageId: saved.id,
        conversationId,
        title: conversation.title,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
