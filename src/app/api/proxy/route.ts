import { NextRequest } from "next/server";
import { relay, errorPage, ProxyError } from "@/lib/proxy-server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JAR_RE = /^[a-zA-Z0-9-]{4,32}$/;

async function handle(req: NextRequest): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit(`proxy:${ip}`, 150, 1.5))
    return errorPage(
      "Rate limit reached. Slow down for a moment, then retry.",
      429
    );

  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  const jarId = url.searchParams.get("s") ?? "shared";

  if (!target)
    return errorPage(
      "No destination provided. Use the address bar to enter a URL.",
      400
    );
  if (!JAR_RE.test(jarId))
    return errorPage("Invalid session id.", 400);

  try {
    const { response } = await relay(target, jarId, req);
    return response;
  } catch (e) {
    if (e instanceof ProxyError)
      return errorPage(e.message, e.status, target);
    return errorPage(
      "An unexpected error occurred while relaying this page.",
      500,
      target
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
export const HEAD = handle;
