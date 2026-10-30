"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireViewer } from "@/lib/auth";
import { demoMode, features } from "@/lib/env";
import * as repo from "@/lib/data/repo";
import { runAiMatches, syncCompetitors, syncMeta } from "@/lib/data/sync";
import { briefPayload, buildCockpit, buildRadar } from "@/lib/data/views";
import { writeMorningBrief } from "@/lib/adapters/ai";
import { lookup } from "@/lib/adapters/trendtrack";
import type { Thresholds } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

const DEMO: ActionResult = { ok: false, message: "Mode démo : branche Supabase et tes clés pour activer cette action." };

async function shopOrThrow(slug: string) {
  const shop = await repo.getShop(slug);
  if (!shop) throw new Error("Boutique introuvable");
  return shop;
}

export async function refreshMeta(slug: string): Promise<ActionResult> {
  await requireViewer();
  if (demoMode) return DEMO;
  const r = await syncMeta(await shopOrThrow(slug));
  revalidatePath(`/${slug}`);
  return { ok: r.ok, message: r.ok ? `Meta à jour : ${r.detail}` : `Meta : ${r.detail}` };
}

export async function refreshCompetitors(slug: string): Promise<ActionResult> {
  await requireViewer();
  if (demoMode) return DEMO;
  const shop = await shopOrThrow(slug);
  const r = await syncCompetitors(shop);
  if (r.ok && features.ai) await runAiMatches(shop);
  revalidatePath(`/${slug}/radar`);
  return { ok: r.ok, message: r.ok ? `Concurrents à jour : ${r.detail}` : r.detail };
}

const FlagInput = z.object({
  slug: z.string(),
  competitorId: z.string(),
  adId: z.string(),
  flag: z.enum(["deja_teste", "iteration", "ignore"]).nullable(),
});

export async function setFlag(input: z.infer<typeof FlagInput>): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (demoMode) return DEMO;
  const v = FlagInput.parse(input);
  await repo.setCompetitorFlag(v.competitorId, v.adId, v.flag, viewer.id);
  revalidatePath(`/${v.slug}/radar`);
  return { ok: true, message: v.flag ? "Créa marquée" : "Marque retirée" };
}

export async function saveAdScript(slug: string, adId: string, script: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (demoMode) return DEMO;
  await repo.saveScript(await shopOrThrow(slug), adId, z.string().max(8000).parse(script), viewer.id);
  revalidatePath(`/${slug}`);
  return { ok: true, message: "Script enregistré" };
}

const ThresholdsInput = z.object({
  be: z.number().positive(),
  targetLow: z.number().positive(),
  target: z.number().positive(),
  loss20: z.number().positive(),
  jump: z.number().positive().nullable(),
  atcTarget: z.number().positive(),
  aov: z.number().positive(),
});

const PnlInput = z.object({
  dateColumn: z.string().regex(/^[A-Z]{1,2}$/),
  spendColumn: z.string().regex(/^[A-Z]{1,2}$/),
  salesColumn: z.string().regex(/^[A-Z]{1,2}$/),
  roasColumn: z.string().regex(/^[A-Z]{1,2}$/),
});

export async function saveShopSettings(
  slug: string,
  input: { thresholds: Thresholds | null; pnl: z.infer<typeof PnlInput> | null; metaAdAccountId: string | null },
): Promise<ActionResult> {
  await requireViewer();
  if (demoMode) return DEMO;
  const shop = await shopOrThrow(slug);
  const thresholds = input.thresholds ? ThresholdsInput.parse(input.thresholds) : null;
  if (thresholds && !(thresholds.loss20 < thresholds.be && thresholds.be < thresholds.targetLow && thresholds.targetLow <= thresholds.target)) {
    return { ok: false, message: "Seuils incohérents : il faut −20 % < BE < bas de range ≤ target." };
  }
  await repo.updateShopSettings(shop.id, {
    thresholds,
    pnl: input.pnl ? PnlInput.parse(input.pnl) : null,
    meta_ad_account_id: input.metaAdAccountId?.replace(/^act_/, "").trim() || null,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Réglages enregistrés" };
}

export async function addCompetitorAction(slug: string, query: string): Promise<ActionResult> {
  await requireViewer();
  if (demoMode) return DEMO;
  if (!features.trendtrack) return { ok: false, message: "Ajoute d'abord ta clé TrendTrack." };
  const q = z.string().min(2).max(200).parse(query.trim());
  const isUuid = /^[0-9a-f-]{36}$/i.test(q);
  let id = isUuid ? q : null;
  let name = q;
  if (!id) {
    const hits = await lookup(q);
    const hit = hits[0] as Record<string, unknown> | undefined;
    id = (hit?.brandtrackerId ?? hit?.brandtracker_id ?? hit?.id ?? null) as string | null;
    name = (hit?.name ?? q) as string;
  }
  if (!id) return { ok: false, message: `Aucune marque suivie trouvée pour « ${q} ». Ajoute-la d'abord au Brand Tracker de TrendTrack.` };
  await repo.addCompetitor(await shopOrThrow(slug), name, id);
  revalidatePath("/", "layout");
  return { ok: true, message: `${name} ajouté. Il sera relevé au prochain rafraîchissement.` };
}

export async function removeCompetitorAction(competitorId: string): Promise<ActionResult> {
  await requireViewer();
  if (demoMode) return DEMO;
  await repo.removeCompetitor(z.string().parse(competitorId));
  revalidatePath("/", "layout");
  return { ok: true, message: "Concurrent retiré" };
}

export async function generateBrief(slug: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (demoMode) return DEMO;
  if (!features.ai) return { ok: false, message: "Ajoute ta clé API Anthropic pour activer le brief." };
  const shop = await shopOrThrow(slug);
  const [cockpit, radar] = await Promise.all([buildCockpit(slug, "3d"), buildRadar(slug)]);
  if (!cockpit) return { ok: false, message: "Cockpit indisponible" };
  try {
    const brief = await writeMorningBrief(briefPayload(cockpit, radar));
    await repo.saveBrief(shop, brief, viewer.id);
    await repo.logRun("ai", shop.id, true, "brief généré");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await repo.logRun("ai", shop.id, false, msg);
    return { ok: false, message: `IA : ${msg}` };
  }
  revalidatePath(`/${slug}/brief`);
  return { ok: true, message: "Brief prêt" };
}
