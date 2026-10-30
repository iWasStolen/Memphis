export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   POST /api/ai/tts — read an assistant message aloud.
   body: { text: string, speed?: number }
   Returns audio/wav bytes. The client splits long messages
   into ≤1000-char chunks (API limit is 1024) and plays them
   in order.
   ------------------------------------------------------------ */

export async function POST(req: Request) {
  let body: { text?: string; speed?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const text = (body.text ?? "").trim().slice(0, 1000);
  if (!text) return Response.json({ error: "Nothing to speak" }, { status: 400 });

  /* strip markdown so it doesn't read out asterisks and backticks */
  const spoken = text
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " (image) ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>~|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!spoken) return Response.json({ error: "Nothing to speak" }, { status: 400 });

  const speed = typeof body.speed === "number" && body.speed >= 0.5 && body.speed <= 2 ? body.speed : 1.0;

  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: spoken,
      voice: "tongtong",
      speed,
      response_format: "wav",
      stream: false,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(new Uint8Array(arrayBuffer));
    if (!buf.length) return Response.json({ error: "Empty audio" }, { status: 502 });
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "audio/wav",
        "content-length": String(buf.length),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Speech generation failed" },
      { status: 500 }
    );
  }
}
