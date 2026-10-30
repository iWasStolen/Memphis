import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, processUpload, metaOf } from "@/lib/ai-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   POST /api/ai/files — upload files for Memphis AI.
   multipart/form-data: sessionId=<id>, file=<…> (repeatable)
   Each file is saved, classified, and fully extracted
   (text / transcription / vision description) before the
   response returns, so the chat model can use it immediately.
   ------------------------------------------------------------ */

const MAX_FILES_PER_REQUEST = 8;

function validSessionId(s: unknown): s is string {
  return typeof s === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(s);
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const sessionId = form.get("sessionId");
  if (!validSessionId(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "No files uploaded" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST)
    return Response.json({ error: `Too many files at once (max ${MAX_FILES_PER_REQUEST})` }, { status: 400 });

  const results: unknown[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) {
      errors.push({ name: f.name, error: `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB — limit 40 MB)` });
      continue;
    }
    if (f.size === 0) {
      errors.push({ name: f.name, error: "File is empty" });
      continue;
    }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      const meta = await processUpload(sessionId, f.name, f.type || "application/octet-stream", buf);
      results.push(meta);
    } catch (e) {
      errors.push({ name: f.name, error: e instanceof Error ? e.message : "Processing failed" });
    }
  }

  return Response.json({ files: results, errors });
}

/* ------------------------------------------------------------ */

export async function GET(req: Request) {
  /* list recent files for the session (for a files panel) */
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!validSessionId(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  const rows = await db.aIFile.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return Response.json({ files: rows.map(metaOf) });
}
