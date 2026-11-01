import { NextResponse, type NextRequest } from "next/server";
import { getCredentials, requireWorkspace } from "@/lib/workspace";
import { fetchTopAds, normalizeTopAdRow } from "@/lib/adapters/trendtrack";

/**
 * Contrôle du branchement TrendTrack de l'espace actif : une ligne brute et sa version
 * normalisée (coût : 1 crédit). Usage : /api/debug/trendtrack?bt=<brandtrackerId>
 */
export async function GET(req: NextRequest) {
  const { workspace } = await requireWorkspace();
  const { trendtrack } = await getCredentials(workspace.id);
  if (!trendtrack) return NextResponse.json({ error: "Clé TrendTrack absente pour cet espace" }, { status: 400 });
  const bt = req.nextUrl.searchParams.get("bt");
  if (!bt || !/^[0-9a-f-]{36}$/i.test(bt)) return NextResponse.json({ error: "paramètre bt manquant ou invalide" }, { status: 400 });
  const { rows } = await fetchTopAds(trendtrack, bt, { sortBy: "currentRank", status: "active", limit: 1 });
  return NextResponse.json({ raw: rows[0] ?? null, normalized: rows[0] ? normalizeTopAdRow(rows[0], "debug") : null });
}
