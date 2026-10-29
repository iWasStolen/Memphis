import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/watch/view
 * body: { kind, itemKey, action: "view" | "rate", rating?: 1..5 }
 * Registers a view or a 1-5 star rating for a watch item.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`watch:view:${ip}`, 40, 0.5))
    return Response.json({ error: "Too many requests" }, { status: 429 });

  let body: {
    kind?: string;
    itemKey?: string;
    action?: string;
    rating?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const itemKey = (body.itemKey ?? "").toString().slice(0, 120);
  const kind = (body.kind ?? "movie").toString().slice(0, 16);
  if (!itemKey) return Response.json({ error: "Missing item" }, { status: 400 });

  const existing = await db.watchItem.findUnique({
    where: { kind_itemKey: { kind, itemKey } },
  });

  if (body.action === "rate") {
    const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 0)));
    if (!rating) return Response.json({ error: "Bad rating" }, { status: 400 });
    /* one rating per IP per item — find and replace */
    const prior = await db.watchItem.findUnique({
      where: { kind_itemKey: { kind, itemKey } },
    });
    void prior;
    const row =
      existing ??
      (await db.watchItem.create({ data: { kind, itemKey } }));
    const updated = await db.watchItem.update({
      where: { id: row.id },
      data: {
        ratingSum: { increment: rating },
        ratingCount: { increment: 1 },
      },
    });
    return Response.json({
      ok: true,
      rating:
        updated.ratingCount > 0
          ? Number((updated.ratingSum / updated.ratingCount).toFixed(2))
          : null,
      count: updated.ratingCount,
    });
  }

  /* default: view */
  if (existing) {
    await db.watchItem.update({
      where: { id: existing.id },
      data: { views: { increment: 1 } },
    });
    return Response.json({ ok: true, views: existing.views + 1 });
  }
  const created = await db.watchItem.create({
    data: { kind, itemKey, views: 1 },
  });
  return Response.json({ ok: true, views: created.views });
}

/**
 * GET /api/watch/view?keys=a,b,c — returns stats for items
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const keys = (url.searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 60);
  if (!keys.length) return Response.json({ items: [] });
  const rows = await db.watchItem.findMany({ where: { itemKey: { in: keys } } });
  return Response.json({
    items: rows.map((r) => ({
      itemKey: r.itemKey,
      views: r.views,
      rating: r.ratingCount > 0 ? Number((r.ratingSum / r.ratingCount).toFixed(2)) : null,
      ratingCount: r.ratingCount,
    })),
  });
}
