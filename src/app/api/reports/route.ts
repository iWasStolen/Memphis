import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["game", "link", "message", "other"]);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`report:${ip}`, 6, 1 / 60))
    return jsonError("Too many reports. Try again later.", 429);
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    target?: string;
    note?: string;
  };
  const kind = body.kind ?? "";
  const target = (body.target ?? "").slice(0, 200);
  const note = (body.note ?? "").slice(0, 600);
  if (!KINDS.has(kind)) return jsonError("Invalid report kind");
  if (!target.trim()) return jsonError("Report target is required");
  await db.report.create({ data: { kind, target, note } });
  return Response.json({ ok: true });
}
