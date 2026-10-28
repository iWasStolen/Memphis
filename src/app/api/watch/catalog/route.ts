import { getWatchCatalog } from "@/lib/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { movies, anime, cachedAt } = await getWatchCatalog();
    if (!movies.length && !anime.length)
      return Response.json(
        { error: "The video catalog is temporarily unavailable. Try again shortly." },
        { status: 502 }
      );
    return Response.json({ movies, anime, cachedAt });
  } catch {
    return Response.json(
      { error: "The video catalog is temporarily unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
