import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { UPLOAD_DIR } from "@/lib/ai-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   POST /api/ai/transcribe — voice input for Memphis AI.
   multipart/form-data: file=<audio blob>
   Normalizes to 16 kHz mono wav with ffmpeg, then GLM ASR.
   ------------------------------------------------------------ */

const run = promisify(execFile);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const blob = form.get("file");
  if (!(blob instanceof File) || blob.size === 0)
    return Response.json({ error: "No audio provided" }, { status: 400 });
  if (blob.size > 30 * 1024 * 1024)
    return Response.json({ error: "Recording too large" }, { status: 413 });

  const tmpIn = path.join(UPLOAD_DIR, `voice-${Date.now()}-in`);
  const tmpWav = path.join(UPLOAD_DIR, `voice-${Date.now()}.wav`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(tmpIn, Buffer.from(await blob.arrayBuffer()));

  try {
    await run("ffmpeg", ["-y", "-i", tmpIn, "-ac", "1", "-ar", "16000", tmpWav], { timeout: 60_000 });
    const { readFile } = await import("node:fs/promises");
    const wav = await readFile(tmpWav);
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const res = (await zai.audio.asr.create({
      file_base64: wav.toString("base64"),
    })) as { text?: string };
    return Response.json({ text: (res?.text ?? "").trim() });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Transcription failed" },
      { status: 500 }
    );
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpWav).catch(() => {});
  }
}
