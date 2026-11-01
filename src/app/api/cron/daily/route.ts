import { NextResponse, type NextRequest } from "next/server";
import { env, platform } from "@/lib/env";
import * as repo from "@/lib/data/repo";
import { runAiMatches, syncCompetitors, syncMeta } from "@/lib/data/sync";
import { briefPayload, buildCockpit, buildRadar } from "@/lib/data/views";
import { writeMorningBrief } from "@/lib/adapters/ai";
import { getCredentials } from "@/lib/workspace";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Tâche du matin (Vercel Cron, voir vercel.json) : pour chaque espace et chaque boutique,
 * relevé Meta, photo TrendTrack, comparaison IA des scripts et brief, avec les clés de
 * l'espace. Un espace sans clé est simplement sauté pour ce service.
 * Protégée par CRON_SECRET (Vercel l'envoie en en-tête Authorization).
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  if (!platform.supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });

  const { data: wsRows } = await supabaseAdmin().from("workspaces").select("id, name, pnl_spreadsheet_id");
  const shopsByWs = await repo.listAllShopsByWorkspace();
  const report: Record<string, unknown> = {};

  for (const ws of wsRows ?? []) {
    const workspace = { id: ws.id as string, name: ws.name as string, role: "owner" as const, pnlSpreadsheetId: ws.pnl_spreadsheet_id as string | null };
    const creds = await getCredentials(workspace.id);
    for (const shop of shopsByWs.get(workspace.id) ?? []) {
      const r: Record<string, unknown> = {};
      if (creds.meta) r.meta = await syncMeta(shop, creds);
      if (creds.trendtrack) r.trendtrack = await syncCompetitors(shop, creds);
      if (creds.anthropic) {
        r.ai = await runAiMatches(shop, creds);
        try {
          const [cockpit, radar] = await Promise.all([buildCockpit(workspace, shop.slug, "3d"), buildRadar(workspace, shop.slug)]);
          if (cockpit) {
            await repo.saveBrief(shop, await writeMorningBrief(creds.anthropic, briefPayload(cockpit, radar)), null);
            r.brief = "ok";
          }
        } catch (e) {
          r.brief = e instanceof Error ? e.message : String(e);
        }
      }
      report[`${workspace.name} / ${shop.name}`] = r;
    }
  }
  return NextResponse.json(report);
}
