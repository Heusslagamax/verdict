import { NextResponse, type NextRequest } from "next/server";
import { env, features } from "@/lib/env";
import * as repo from "@/lib/data/repo";
import { runAiMatches, syncCompetitors, syncMeta } from "@/lib/data/sync";
import { briefPayload, buildCockpit, buildRadar } from "@/lib/data/views";
import { writeMorningBrief } from "@/lib/adapters/ai";

/**
 * Tâche du matin (Vercel Cron, voir vercel.json) : Meta, photo TrendTrack du jour,
 * comparaison IA des scripts et brief du matin pour chaque boutique.
 * Protégée par CRON_SECRET (Vercel l'envoie en en-tête Authorization).
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  if (!features.supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });

  const report: Record<string, unknown> = {};
  for (const shop of await repo.listShops()) {
    const r: Record<string, unknown> = {};
    r.meta = await syncMeta(shop);
    r.trendtrack = await syncCompetitors(shop);
    if (features.ai) {
      r.ai = await runAiMatches(shop);
      try {
        const [cockpit, radar] = await Promise.all([buildCockpit(shop.slug, "3d"), buildRadar(shop.slug)]);
        if (cockpit) {
          await repo.saveBrief(shop, await writeMorningBrief(briefPayload(cockpit, radar)), null);
          r.brief = "ok";
        }
      } catch (e) {
        r.brief = e instanceof Error ? e.message : String(e);
      }
    }
    report[shop.slug] = r;
  }
  return NextResponse.json(report);
}
