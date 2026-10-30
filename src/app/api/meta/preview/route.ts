import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/lib/auth";
import { features } from "@/lib/env";
import { fetchAdPreview, fetchVideoSource } from "@/lib/adapters/meta";

/** Aperçu d'une ad (iframe officiel Meta) et, si vidéo, son URL source temporaire. */
export async function GET(req: NextRequest) {
  await requireViewer();
  if (!features.meta) return NextResponse.json({ iframe: null, video: null });
  const adId = req.nextUrl.searchParams.get("ad");
  const videoId = req.nextUrl.searchParams.get("video");
  const format = req.nextUrl.searchParams.get("format") ?? "MOBILE_FEED_STANDARD";
  if (!adId || !/^\d+$/.test(adId)) return NextResponse.json({ error: "ad manquant" }, { status: 400 });
  try {
    const [iframe, video] = await Promise.all([
      fetchAdPreview(adId, format),
      videoId && /^\d+$/.test(videoId) ? fetchVideoSource(videoId).catch(() => null) : Promise.resolve(null),
    ]);
    return NextResponse.json({ iframe, video }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
