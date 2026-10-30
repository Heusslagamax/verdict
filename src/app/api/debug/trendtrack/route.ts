import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/lib/auth";
import { features } from "@/lib/env";
import { fetchTopAds, normalizeTopAdRow } from "@/lib/adapters/trendtrack";

/**
 * Contrôle du premier branchement TrendTrack : montre une ligne brute et sa version
 * normalisée (coût : 1 crédit). Usage : /api/debug/trendtrack?bt=<brandtrackerId>
 */
export async function GET(req: NextRequest) {
  await requireViewer();
  if (!features.trendtrack) return NextResponse.json({ error: "TRENDTRACK_API_KEY manquante" }, { status: 400 });
  const bt = req.nextUrl.searchParams.get("bt");
  if (!bt) return NextResponse.json({ error: "paramètre bt manquant" }, { status: 400 });
  const { rows } = await fetchTopAds(bt, { sortBy: "currentRank", status: "active", limit: 1 });
  return NextResponse.json({ raw: rows[0] ?? null, normalized: rows[0] ? normalizeTopAdRow(rows[0], "debug") : null });
}
