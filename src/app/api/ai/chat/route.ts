import { db } from "@/lib/db";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, fileContextBlock, safeName } from "@/lib/ai-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   /api/ai/chat — Memphis AI, powered by GLM via z-ai-web-dev-sdk
   - No sign-in, no token quota, no rate limits.
   - Anonymous browser session owns its conversations.
   - Supports:
       · file attachments (any type — extraction happens at upload)
       · live vision on attached images (createVision)
       · web search with citations (planner → web_search → page_reader)
       · image generation / editing (images.generations)
       · Fast / Reasoning modes (thinking enabled streams a private
         chain-of-thought as `reasoning` events before the answer)
       · regenerate (replay the last user turn) and edit (rewrite a
         user turn, truncate everything after it, replay)
   - Streams the reply over SSE with status events, then persists.
     Client aborts (Stop button) don't lose the reply: enqueues are
     swallowed after cancel and the answer is still saved.
   ------------------------------------------------------------ */

const SYSTEM_BASE = `You are Memphis AI — a sharp, friendly, general-purpose assistant built into the Memphis unBLACKed web app.
You are powered by GLM, and you are completely free with no limits.
Guidelines:
- Answer anything: homework, code, creative writing, explanations, planning, chat.
- Use clean markdown: short sections, bullet lists, tables and fenced code blocks with language tags.
- Be direct and useful first; add brief context after when it helps.
- Match the user's language and tone.
- The user can attach files of ANY type. Their contents arrive as [attached file: …] blocks — extracted text, spreadsheets, transcriptions, or visual descriptions. Treat those blocks as the source of truth for questions about the files. Quote specifics (numbers, names, lines) when answering. If the answer isn't in the file, say so plainly instead of guessing.`;

const REASONING_HINT = `

REASONING MODE is ON for this reply: your private reasoning notes are appended to the user's message between [your private reasoning notes] and [end notes] markers. Use them to produce a rigorous, well-structured final answer that shows the key steps and justification — but never mention, quote or repeat the notes themselves.`;

const THINKING_SYSTEM = `You are the private thinking phase of Memphis AI. Think through the user's request and write concise working notes for yourself: restate the goal, pull out key facts and constraints, consider approaches, check traps and edge cases, then settle on a plan. First person, telegraphic style, no markdown headings, no greeting, no final polished answer — a separate final answer is written afterwards from your notes. Keep it under 200 words.`;

const MAX_MESSAGE = 8000;
const HISTORY_TURNS = 30; /* messages of context (bounded, not limited per day) */
const MAX_ATTACHMENTS = 6;
const CURRENT_FILE_BUDGET = 20_000; /* chars per file, current turn */
const CURRENT_TOTAL_BUDGET = 60_000;
const HISTORY_FILE_BUDGET = 1_200; /* chars per file inside older turns */
const HISTORY_TOTAL_BUDGET = 8_000;
const MAX_REASONING_STORED = 24_000; /* chars of chain-of-thought kept per reply */

interface AttMeta {
  id: string;
  name: string;
  kind: string;
  size: number;
  mime: string;
}

function validSessionId(s: unknown): s is string {
  return typeof s === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(s);
}

function attMetas(files: { id: string; name: string; kind: string; size: number; mime: string }[]): AttMeta[] {
  return files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: f.size, mime: f.mime }));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/* Pump a z-ai completion (raw SSE bytes, strings, or parsed chunk
   objects), collecting and forwarding reasoning_content + content.
   Returns everything the call produced. */
async function pumpStream(
  completion: unknown,
  onReasoning: (t: string) => void,
  onDelta: (t: string) => void
): Promise<{ content: string; reasoning: string }> {
  const decoder = new TextDecoder();
  let rawBuf = "";
  let content = "";
  let reasoning = "";

  const handleObj = (obj: {
    choices?: {
      delta?: { content?: string; reasoning_content?: string };
      message?: { content?: string; reasoning_content?: string };
    }[];
  }) => {
    const thinkDelta =
      obj?.choices?.[0]?.delta?.reasoning_content ??
      obj?.choices?.[0]?.message?.reasoning_content ??
      "";
    if (thinkDelta) {
      reasoning += thinkDelta;
      onReasoning(thinkDelta);
    }
    const delta =
      obj?.choices?.[0]?.delta?.content ??
      obj?.choices?.[0]?.message?.content ??
      "";
    if (delta) {
      content += delta;
      onDelta(delta);
    }
  };

  const consumeLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      handleObj(JSON.parse(payload));
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
  if (iterable && typeof iterable[Symbol.asyncIterator] === "function") {
    for await (const chunk of iterable) {
      if (chunk instanceof Uint8Array) {
        rawBuf += decoder.decode(chunk, { stream: true });
        consumeBuf();
      } else if (typeof chunk === "string") {
        rawBuf += chunk;
        consumeBuf();
      } else if (chunk && typeof chunk === "object") {
        handleObj(chunk as Parameters<typeof handleObj>[0]);
      }
    }
    rawBuf += decoder.decode();
    consumeBuf();
  } else {
    handleObj(
      (completion as { choices?: { message?: { content?: string; reasoning_content?: string } }[] }) ?? {}
    );
  }
  return { content, reasoning };
}

export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    conversationId?: string | null;
    message?: string;
    instructions?: string;
    attachments?: unknown;
    webSearch?: boolean;
    imageMode?: boolean;
    mode?: string;
    regenerate?: boolean;
    edit?: { messageId?: string; text?: string } | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const mode = body.mode === "reasoning" ? "reasoning" : "fast";
  const regenerate = body.regenerate === true;
  const edit =
    body.edit && typeof body.edit === "object" && typeof body.edit.messageId === "string"
      ? body.edit
      : null;
  const replay = regenerate || !!edit; /* both reuse a stored user turn */

  const message = (body.message ?? "").trim().slice(0, MAX_MESSAGE);
  const attachmentIds = Array.isArray(body.attachments)
    ? body.attachments.filter((x): x is string => typeof x === "string").slice(0, MAX_ATTACHMENTS)
    : [];
  if (!message && !attachmentIds.length && !replay)
    return Response.json({ error: "Empty message" }, { status: 400 });
  if (!validSessionId(body.sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  if (replay && !body.conversationId)
    return Response.json({ error: "No conversation to replay" }, { status: 400 });

  const sessionId = body.sessionId;
  const instructions = (body.instructions ?? "").slice(0, 1000);
  const webSearch = body.webSearch === true;
  const imageMode = body.imageMode === true;

  /* find the conversation (replay paths require an existing one) */
  let conversation = body.conversationId
    ? await db.aIConversation.findFirst({
        where: { id: body.conversationId, sessionId },
      })
    : null;
  if (!conversation && replay)
    return Response.json({ error: "Conversation not found" }, { status: 400 });

  /* ------------------------------------------------------------
     Resolve the user turn this request answers:
       · normal     → the message + attachments from the body
       · regenerate → the newest stored user message (replayed)
       · edit       → that message rewritten, everything after it dropped
     ------------------------------------------------------------ */
  let turnText = message;
  let turnAttIds = attachmentIds;
  let turnCreatedAt: Date | null = null; /* history is strictly older than this */
  let editMsgId: string | null = null;
  let editReplacesAtts = false; /* edit: rewrite the message's attachment chip list */

  if (edit) {
    const msg = await db.aIMessage.findFirst({
      where: { id: edit.messageId, conversationId: conversation!.id, role: "user" },
    });
    if (!msg) return Response.json({ error: "Message not found" }, { status: 400 });
    turnText = String(edit.text ?? "").trim().slice(0, MAX_MESSAGE);
    turnAttIds = attachmentIds;
    /* when the client sends an attachments array it replaces the old chip set */
    editReplacesAtts = Array.isArray(body.attachments);
    if (!turnText && !(editReplacesAtts ? turnAttIds.length : (msg.attachments as AttMeta[] | null)?.length))
      return Response.json({ error: "Empty message" }, { status: 400 });
    await db.aIMessage.update({
      where: { id: msg.id },
      data: {
        content: turnText || "(files attached — please review them)",
      },
    });
    /* drop every message after the edited one (assistant replies etc.) */
    await db.aIMessage.deleteMany({
      where: { conversationId: conversation!.id, createdAt: { gt: msg.createdAt } },
    });
    editMsgId = msg.id;
    turnCreatedAt = msg.createdAt;
  } else if (regenerate) {
    const lastUser = await db.aIMessage.findFirst({
      where: { conversationId: conversation!.id, role: "user" },
      orderBy: { createdAt: "desc" },
    });
    if (!lastUser) return Response.json({ error: "Nothing to regenerate" }, { status: 400 });
    turnText = lastUser.content;
    const atts = Array.isArray(lastUser.attachments) ? (lastUser.attachments as unknown as AttMeta[]) : [];
    turnAttIds = atts.map((a) => a?.id).filter((id): id is string => typeof id === "string");
    /* drop the stale assistant reply(ies) after it */
    await db.aIMessage.deleteMany({
      where: { conversationId: conversation!.id, role: "assistant", createdAt: { gt: lastUser.createdAt } },
    });
    turnCreatedAt = lastUser.createdAt;
  }

  /* load the turn's attachment records (ownership-enforced) */
  const currentFiles = turnAttIds.length
    ? await db.aIFile.findMany({ where: { id: { in: turnAttIds }, sessionId } })
    : [];
  const filesById = new Map(currentFiles.map((f) => [f.id, f]));
  const orderedFiles = turnAttIds.map((id) => filesById.get(id)).filter(Boolean) as typeof currentFiles;

  /* edit: now that the surviving files are known, rewrite the chip list */
  if (editMsgId) {
    await db.aIMessage.update({
      where: { id: editMsgId },
      data: {
        ...(editReplacesAtts
          ? { attachments: orderedFiles.length ? JSON.parse(JSON.stringify(attMetas(orderedFiles))) : null }
          : {}),
      },
    });
  }

  const firstFileName = orderedFiles[0]?.name;
  const titleSource =
    turnText || (firstFileName ? `Files: ${firstFileName}${orderedFiles.length > 1 ? ` +${orderedFiles.length - 1}` : ""}` : "New chat");

  /* create the conversation for fresh chats (replay paths already have one) */
  if (!conversation) {
    conversation = await db.aIConversation.create({
      data: {
        sessionId,
        title: titleSource.slice(0, 60),
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

  /* recent history for context — take the NEWEST N messages strictly
     before this turn (desc + take), then restore chronological order */
  const history = (
    await db.aIMessage.findMany({
      where: {
        conversationId,
        ...(turnCreatedAt ? { createdAt: { lt: turnCreatedAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    })
  ).reverse();

  /* pull file knowledge referenced by older turns so the model
     keeps access to files across the conversation */
  const historyAttIds = new Set<string>();
  for (const m of history) {
    const atts = m.attachments as AttMeta[] | null;
    if (Array.isArray(atts)) for (const a of atts) if (a?.id) historyAttIds.add(a.id);
  }
  historyAttIds.delete(""); /* never loaded */
  const historyFiles = historyAttIds.size
    ? await db.aIFile.findMany({ where: { id: { in: [...historyAttIds] }, sessionId } })
    : [];
  const historyFilesById = new Map(historyFiles.map((f) => [f.id, f]));
  let historyBudget = HISTORY_TOTAL_BUDGET;

  const historyMessages = history.map((m) => {
    const atts = m.attachments as AttMeta[] | null;
    let content = m.content;
    if (Array.isArray(atts) && atts.length) {
      const blocks: string[] = [];
      for (const a of atts) {
        const f = historyFilesById.get(a.id);
        if (!f || historyBudget <= 0) continue;
        const block = fileContextBlock(f, Math.min(HISTORY_FILE_BUDGET, historyBudget));
        historyBudget -= block.length;
        blocks.push(block);
      }
      if (blocks.length) content = `${blocks.join("\n\n")}\n\n${content}`;
    }
    return {
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content,
    };
  });

  /* persist the user's message — only for fresh turns; replay paths
     reuse the stored one */
  let userMessageId: string | null = null;
  if (!replay) {
    const savedUser = await db.aIMessage.create({
      data: {
        conversationId,
        role: "user",
        content: message || "(files attached — please review them)",
        attachments: orderedFiles.length ? JSON.parse(JSON.stringify(attMetas(orderedFiles))) : undefined,
      },
    });
    userMessageId = savedUser.id;
  }

  /* tie the files to this conversation */
  if (orderedFiles.length) {
    await db.aIFile.updateMany({
      where: { id: { in: orderedFiles.map((f) => f.id) } },
      data: { conversationId },
    });
  }

  const systemMsg =
    (instructions.trim()
      ? `${SYSTEM_BASE}\n\nThe user's custom instructions: ${instructions.trim()}`
      : SYSTEM_BASE) + (mode === "reasoning" ? REASONING_HINT : "");

  /* what the model sees for the current turn */
  const fileBlocks: string[] = [];
  let currentBudget = CURRENT_TOTAL_BUDGET;
  for (const f of orderedFiles) {
    if (currentBudget <= 0) break;
    const block = fileContextBlock(f, Math.min(CURRENT_FILE_BUDGET, currentBudget));
    currentBudget -= block.length;
    fileBlocks.push(block);
  }
  const currentImages = orderedFiles.filter((f) => f.kind === "image" && f.mime !== "image/svg+xml");
  const promptText = [fileBlocks.join("\n\n"), turnText].filter(Boolean).join("\n\n") || "(files attached — please review them)";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /* enqueue() throws once the client aborts (Stop button) — swallow
         those errors and keep generating so the reply is still persisted */
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      send("meta", { conversationId, userMessageId });

      let reply = "";
      let think = "";
      let assistantAtts: AttMeta[] | null = null;

      try {
        const { default: ZAI } = await import("z-ai-web-dev-sdk");
        const zai = await ZAI.create();
        const thinkingCfg = { type: mode === "reasoning" ? ("enabled" as const) : ("disabled" as const) };

        /* ============ IMAGE MODE — generate / edit a picture ============ */
        if (imageMode) {
          send("status", { stage: "painting" });
          const prompt = turnText || "a striking, beautiful image";
          const editSource = currentImages[0];
          let b64 = "";
          let genNote = "";
          try {
            if (editSource) {
              const buf = await readFile(editSource.path);
              const dataMime = editSource.mime.startsWith("image/") ? editSource.mime : "image/png";
              const res = await zai.images.generations.edit({
                prompt,
                image: `data:${dataMime};base64,${buf.toString("base64")}`,
                size: "1024x1024",
              });
              b64 = res?.data?.[0]?.base64 ?? "";
              genNote = "edited from your attached image";
            } else {
              const res = await zai.images.generations.create({ prompt, size: "1024x1024" });
              b64 = res?.data?.[0]?.base64 ?? "";
              genNote = "generated";
            }
          } catch (e) {
            send("error", {
              message: `Image generation failed (${e instanceof Error ? e.message : "unknown error"}). Try rephrasing.`,
            });
            finish();
            return;
          }
          if (!b64) {
            send("error", { message: "Image generation returned nothing — try again." });
            finish();
            return;
          }

          /* save the picture so it can be displayed + downloaded.
             the API returns jpeg bytes more often than not — sniff the
             real format so content-type never lies (nosniff is set) */
          const isJpeg = /^\/9j\//.test(b64);
          const isPng = /^iVBOR/.test(b64);
          const isWebp = /^UklGR/.test(b64);
          const mime = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
          const ext = isPng ? "png" : isWebp ? "webp" : "jpg";
          const name = safeName(`memphis-image-${Date.now()}.${ext}`);
          await mkdir(UPLOAD_DIR, { recursive: true });
          const rec = await db.aIFile.create({
            data: {
              sessionId,
              conversationId,
              name,
              mime,
              size: 0,
              kind: "generated",
              path: "",
              status: "processing",
            },
          });
          const filePath = path.join(UPLOAD_DIR, `${rec.id}__${name}`);
          const buf = Buffer.from(b64, "base64");
          await writeFile(filePath, buf);
          const savedFile = await db.aIFile.update({
            where: { id: rec.id },
            data: {
              path: filePath,
              size: buf.length,
              extracted: `AI-${genNote} image from prompt: ${prompt}`,
              status: "ready",
            },
          });
          assistantAtts = attMetas([savedFile]);

          reply =
            `Here's your image (${genNote}):\n\n` +
            `![${prompt.slice(0, 80)}](/api/ai/files/${rec.id}/raw?sessionId=${encodeURIComponent(sessionId)})\n\n` +
            `Want a different take? Ask me to tweak it — attach this image (or keep it in the chat) and describe the change.`;
          send("delta", { text: reply });
        } else {
          /* ============ WEB SEARCH — plan, search, read, cite ============ */
          let searchContext = "";
          if (webSearch) {
            send("status", { stage: "searching" });
            try {
              const historyText = historyMessages
                .slice(-6)
                .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
                .join("\n");
              const planCompletion = (await zai.chat.completions.create({
                messages: [
                  {
                    role: "system",
                    content:
                      "You turn a user's question into web search queries. Reply with ONLY a JSON array of 1-3 short, specific search queries (strings), most relevant first. No prose, no markdown fences.",
                  },
                  {
                    role: "user",
                    content: `Recent conversation:\n${historyText}\n\nQuestion: ${turnText}`,
                  },
                ],
                thinking: { type: "disabled" },
              })) as { choices?: { message?: { content?: string } }[] };
              const planText = planCompletion?.choices?.[0]?.message?.content ?? "";
              const match = planText.match(/\[[\s\S]*\]/);
              const queries = match
                ? (JSON.parse(match[0]) as unknown[]).filter(
                    (q): q is string => typeof q === "string" && q.trim().length > 1
                  ).slice(0, 3)
                : [];
              if (!queries.length) queries.push(turnText.slice(0, 100));

              const allResults: { url: string; name: string; snippet: string; host: string; date: string }[] = [];
              const seen = new Set<string>();
              await Promise.allSettled(
                queries.map(async (q) => {
                  const res = await zai.functions.invoke("web_search", { query: q, num: 5 });
                  for (const r of res ?? []) {
                    if (!r?.url || seen.has(r.url)) continue;
                    seen.add(r.url);
                    allResults.push({ url: r.url, name: r.name, snippet: r.snippet, host: r.host_name, date: r.date });
                  }
                })
              );
              const top = allResults.slice(0, 6);

              if (top.length) {
                /* read the two most promising pages for real content */
                send("status", { stage: "reading", detail: top[0].host });
                const pages: string[] = [];
                for (const r of top.slice(0, 2)) {
                  try {
                    const page = await zai.functions.invoke("page_reader", { url: r.url });
                    const text = stripHtml(page?.data?.html ?? "").slice(0, 3500);
                    if (text.length > 200)
                      pages.push(`--- page: ${page?.data?.title || r.name} (${r.host}) ---\n${text}`);
                  } catch { /* skip unreadable pages */ }
                }
                const today = new Date().toISOString().slice(0, 10);
                searchContext =
                  `\n[web search results — retrieved ${today}]\n` +
                  top
                    .map(
                      (r, i) =>
                        `${i + 1}. "${r.name}" — ${r.host}${r.date ? ` (${r.date})` : ""}\n   ${r.snippet}\n   ${r.url}`
                    )
                    .join("\n") +
                  (pages.length ? `\n\n[full page extracts]\n${pages.join("\n\n")}` : "") +
                  `\n[/web search results]`;
              }
            } catch {
              searchContext = "";
            }
          }

          /* ============ PHASE 1 (Reasoning mode) — visible private thinking ============
             The z-ai endpoint has no native reasoning_content channel, so
             Reasoning mode runs a dedicated thinking call first: short
             working notes streamed live into the UI's thinking box, then
             fed to the final-answer call below. */
          if (mode === "reasoning") {
            send("status", { stage: "reasoning" });
            try {
              const thinkRes = await pumpStream(
                await zai.chat.completions.create({
                  messages: [
                    { role: "system" as const, content: THINKING_SYSTEM },
                    { role: "user" as const, content: promptText + searchContext },
                  ],
                  max_tokens: 500,
                  thinking: { type: "disabled" },
                  stream: true,
                }),
                (t) => send("reasoning", { text: t }),
                (t) => send("reasoning", { text: t })
              );
              think = [thinkRes.reasoning, thinkRes.content].filter(Boolean).join("\n").trim();
            } catch {
              /* thinking phase failed — fall through and answer directly */
            }
          }

          /* ============ PHASE 2 — the final answer ============ */
          send("status", { stage: "writing" });

          const sys = systemMsg +
            (searchContext
              ? `\n\nWEB SEARCH MODE: fresh search results are appended below. Ground your answer in them, cite sources inline as markdown links like [source](url), and end with a "Sources" list of the links you used. If the results don't fully answer the question, say what's missing.`
              : "");

          const finalUserContent =
            mode === "reasoning" && think
              ? `${promptText + searchContext}\n\n[your private reasoning notes]\n${think}\n[end notes — write the final answer now; do not repeat the notes]`
              : promptText + searchContext;

          const messages = [
            { role: "system" as const, content: sys },
            ...historyMessages,
          ];

          /* live vision when images are attached to THIS turn */
          if (currentImages.length) {
            const parts: unknown[] = [{ type: "text", text: finalUserContent }];
            for (const img of currentImages) {
              try {
                const buf = await readFile(img.path);
                parts.push({
                  type: "image_url",
                  image_url: { url: `data:${img.mime};base64,${buf.toString("base64")}` },
                });
              } catch { /* skip unreadable image */ }
            }
            messages.push({ role: "user" as const, content: parts as never });
          } else {
            messages.push({ role: "user" as const, content: finalUserContent });
          }

          const completion =
            currentImages.length
              ? await zai.chat.completions.createVision({
                  messages: messages as never,
                  stream: true,
                  thinking: thinkingCfg,
                } as never)
              : await zai.chat.completions.create({
                  messages,
                  thinking: thinkingCfg,
                  stream: true,
                });

          const res = await pumpStream(
            completion,
            (t) => send("reasoning", { text: t }),
            (t) => send("delta", { text: t })
          );
          reply = res.content;
          if (res.reasoning) think = think ? `${think}\n${res.reasoning}` : res.reasoning;
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
        finish();
        return;
      }

      /* persist the assistant reply (also when the client stopped
         mid-stream — whatever arrived is kept) */
      const saved = await db.aIMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: reply,
          mode,
          ...(think ? { reasoning: think.slice(0, MAX_REASONING_STORED) } : {}),
          ...(assistantAtts ? { attachments: JSON.parse(JSON.stringify(assistantAtts)) } : {}),
        },
      });
      await db.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      send("done", {
        messageId: saved.id,
        conversationId,
        title: conversation.title,
        mode,
        ...(think ? { reasoning: think.slice(0, MAX_REASONING_STORED) } : {}),
        ...(assistantAtts ? { attachments: assistantAtts } : {}),
      });
      finish();
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
