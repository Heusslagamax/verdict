import { NextResponse, type NextRequest } from "next/server";
import { getCredentials, requireWorkspace } from "@/lib/workspace";
import { fetchAdPreview, fetchVideoSource } from "@/lib/adapters/meta";

/** Aperçu d'une ad (iframe officiel Meta) et, si vidéo, son URL source temporaire. */
export async function GET(req: NextRequest) {
  const { workspace } = await requireWorkspace();
  const { meta } = await getCredentials(workspace.id);
  if (!meta) return NextResponse.json({ iframe: null, video: null });
  const adId = req.nextUrl.searchParams.get("ad");
  const videoId = req.nextUrl.searchParams.get("video");
  const format = req.nextUrl.searchParams.get("format") ?? "MOBILE_FEED_STANDARD";
  if (!adId || !/^\d+$/.test(adId)) return NextResponse.json({ error: "ad manquant" }, { status: 400 });
  try {
    // Le jeton de l'espace ne lit que les comptes de cet espace : une ad d'un autre BM échoue.
    const [iframe, video] = await Promise.all([
      fetchAdPreview(meta, adId, format),
      videoId && /^\d+$/.test(videoId) ? fetchVideoSource(meta, videoId).catch(() => null) : Promise.resolve(null),
    ]);
    return NextResponse.json({ iframe, video }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
