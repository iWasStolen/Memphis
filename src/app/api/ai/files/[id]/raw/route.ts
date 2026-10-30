import { db } from "@/lib/db";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------
   GET /api/ai/files/<id>/raw?sessionId=…[&download=1]
   Serves the original bytes of an uploaded/generated file.
   Ownership: the file must belong to the anonymous session.
   ------------------------------------------------------------ */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId || !/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId))
    return new Response("Invalid session", { status: 400 });

  const file = await db.aIFile.findFirst({ where: { id, sessionId } });
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const buf = await readFile(file.path);
    const download = url.searchParams.get("download") === "1";
    const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
    const headers: Record<string, string> = {
      "content-type": file.mime || "application/octet-stream",
      "content-length": String(buf.length),
      "cache-control": "private, max-age=3600",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${file.id}${download ? ext : ""}"`,
      "x-content-type-options": "nosniff",
    };
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return new Response("File missing on disk", { status: 410 });
  }
}
