import "server-only";
import { demoMode } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Competitor, CompetitorAd, MetaAd, MetaCampaign, PnlMapping, Shop, Thresholds } from "@/lib/types";
import type { AiMatch } from "@/lib/engine/competitors";
import type { MorningBrief } from "@/lib/adapters/ai";
import { demoCompetitorAds, demoCompetitors, demoMeta, demoShops } from "./demo";

/**
 * Accès aux tables. Appelé uniquement après requireViewer() (pages, actions) ou depuis la
 * tâche planifiée protégée par CRON_SECRET : la clé secrète est donc utilisée côté serveur
 * seulement, derrière une vérification d'appartenance.
 */

interface ShopRow {
  id: string;
  slug: string;
  name: string;
  market: string;
  meta_ad_account_id: string | null;
  thresholds: Thresholds | null;
  pnl: PnlMapping | null;
}

const toShop = (r: ShopRow): Shop => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  market: r.market,
  metaAdAccountId: r.meta_ad_account_id,
  thresholds: r.thresholds,
  pnl: r.pnl,
});

export async function listShops(): Promise<Shop[]> {
  if (demoMode) return demoShops;
  const { data, error } = await supabaseAdmin().from("shops").select("*").order("sort");
  if (error) throw error;
  return (data as ShopRow[]).map(toShop);
}

export async function getShop(slug: string): Promise<Shop | null> {
  const shops = await listShops();
  return shops.find((s) => s.slug === slug) ?? null;
}

export async function updateShopSettings(shopId: string, patch: { thresholds?: Thresholds | null; pnl?: PnlMapping | null; meta_ad_account_id?: string | null; name?: string }) {
  if (demoMode) return;
  const { error } = await supabaseAdmin().from("shops").update(patch).eq("id", shopId);
  if (error) throw error;
}

// ---------- Meta ----------
export interface MetaSnapshot {
  fetchedAt: string;
  campaigns: MetaCampaign[];
  ads: MetaAd[];
}

export async function readMetaSnapshot(shop: Shop, today: Date): Promise<MetaSnapshot | null> {
  if (demoMode) return { fetchedAt: today.toISOString(), ...demoMeta(shop, today) };
  const { data, error } = await supabaseAdmin().from("meta_snapshots").select("*").eq("shop_id", shop.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fetchedAt: data.fetched_at, campaigns: data.campaigns, ads: data.ads };
}

export async function writeMetaSnapshot(shop: Shop, snap: MetaSnapshot) {
  const db = supabaseAdmin();
  const { error } = await db.from("meta_snapshots").upsert({
    shop_id: shop.id,
    fetched_at: snap.fetchedAt,
    campaigns: snap.campaigns,
    ads: snap.ads,
  });
  if (error) throw error;
  const rows = snap.ads.flatMap((ad) =>
    ad.days.map((d) => ({
      shop_id: shop.id,
      ad_id: ad.id,
      date: d.date,
      spend: d.spend,
      impressions: d.impressions,
      link_clicks: d.linkClicks,
      add_to_cart: d.addToCart,
      checkouts: d.checkouts,
      purchases: d.purchases,
      value: d.value,
    })),
  );
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e2 } = await db.from("meta_ad_days").upsert(rows.slice(i, i + 500));
    if (e2) throw e2;
  }
}

export async function readScripts(shop: Shop): Promise<Map<string, string>> {
  if (demoMode) return new Map();
  const { data, error } = await supabaseAdmin().from("ad_scripts").select("ad_id,script").eq("shop_id", shop.id);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.ad_id as string, r.script as string]));
}

export async function saveScript(shop: Shop, adId: string, script: string, userId: string) {
  if (demoMode) return;
  const db = supabaseAdmin();
  if (!script.trim()) {
    await db.from("ad_scripts").delete().eq("ad_id", adId);
    return;
  }
  const { error } = await db
    .from("ad_scripts")
    .upsert({ ad_id: adId, shop_id: shop.id, script: script.trim(), updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------- Concurrents ----------
export async function listCompetitors(shop: Shop): Promise<Competitor[]> {
  if (demoMode) return demoCompetitors(shop);
  const { data, error } = await supabaseAdmin().from("competitors").select("*").eq("shop_id", shop.id).order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, shopId: r.shop_id, name: r.name, brandtrackerId: r.brandtracker_id, active: r.active }));
}

export async function listAllCompetitors(): Promise<(Competitor & { shopSlug: string })[]> {
  if (demoMode) return [];
  const { data, error } = await supabaseAdmin().from("competitors").select("*, shops(slug)").eq("active", true);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    shopId: r.shop_id,
    name: r.name,
    brandtrackerId: r.brandtracker_id,
    active: r.active,
    shopSlug: (r.shops as { slug: string } | null)?.slug ?? "",
  }));
}

export async function addCompetitor(shop: Shop, name: string, brandtrackerId: string) {
  if (demoMode) return;
  const { error } = await supabaseAdmin().from("competitors").upsert(
    { shop_id: shop.id, name, brandtracker_id: brandtrackerId, active: true },
    { onConflict: "shop_id,brandtracker_id" },
  );
  if (error) throw error;
}

export async function removeCompetitor(competitorId: string) {
  if (demoMode) return;
  const { error } = await supabaseAdmin().from("competitors").delete().eq("id", competitorId);
  if (error) throw error;
}

export async function readCompetitorAds(competitors: Competitor[], today: Date): Promise<CompetitorAd[]> {
  if (demoMode) return competitors.flatMap((c) => demoCompetitorAds(c, today));
  if (!competitors.length) return [];
  const ids = competitors.map((c) => c.id);
  const db = supabaseAdmin();
  const [{ data: ads, error }, { data: flags }] = await Promise.all([
    db.from("competitor_ads").select("*").in("competitor_id", ids),
    db.from("competitor_flags").select("*").in("competitor_id", ids),
  ]);
  if (error) throw error;
  const flagMap = new Map((flags ?? []).map((f) => [`${f.competitor_id}:${f.ad_id}`, f.flag as CompetitorAd["userFlag"]]));
  return (ads ?? []).map((r) => ({
    ...(r.data as CompetitorAd),
    status: r.status,
    previousStatus: r.previous_status,
    userFlag: flagMap.get(`${r.competitor_id}:${r.id}`) ?? null,
  }));
}

export async function writeCompetitorAds(competitor: Competitor, ads: CompetitorAd[], today: Date) {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("competitor_ads").select("id,status").eq("competitor_id", competitor.id);
  const prev = new Map((existing ?? []).map((r) => [r.id as string, r.status as string]));
  const date = today.toISOString().slice(0, 10);
  if (!ads.length) return;
  const { error } = await db.from("competitor_ads").upsert(
    ads.map((a) => ({
      competitor_id: competitor.id,
      id: a.id,
      data: a,
      status: a.status,
      previous_status: prev.get(a.id) ?? null,
      first_seen_at: a.firstSeenAt,
      updated_at: today.toISOString(),
    })),
  );
  if (error) throw error;
  await db.from("competitor_rank_history").upsert(
    ads.map((a) => ({ competitor_id: competitor.id, ad_id: a.id, date, status: a.status, rank: a.currentRank, reach: a.reach })),
  );
}

export async function setCompetitorFlag(competitorId: string, adId: string, flag: CompetitorAd["userFlag"], userId: string) {
  if (demoMode) return;
  const db = supabaseAdmin();
  if (!flag) {
    await db.from("competitor_flags").delete().eq("competitor_id", competitorId).eq("ad_id", adId);
    return;
  }
  const { error } = await db
    .from("competitor_flags")
    .upsert({ competitor_id: competitorId, ad_id: adId, flag, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function readAiMatches(competitors: Competitor[]): Promise<Map<string, AiMatch>> {
  if (demoMode || !competitors.length) return new Map();
  const { data } = await supabaseAdmin().from("ai_matches").select("*").in("competitor_id", competitors.map((c) => c.id));
  return new Map((data ?? []).map((r) => [`${r.competitor_id}:${r.ad_id}`, r.result as AiMatch]));
}

export async function writeAiMatch(competitorId: string, adId: string, result: AiMatch) {
  const { error } = await supabaseAdmin().from("ai_matches").upsert({ competitor_id: competitorId, ad_id: adId, result });
  if (error) throw error;
}

// ---------- Brief & journal ----------
export async function latestBrief(shop: Shop): Promise<{ content: MorningBrief; createdAt: string } | null> {
  if (demoMode) return null;
  const { data } = await supabaseAdmin()
    .from("briefs")
    .select("content,created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { content: data.content as MorningBrief, createdAt: data.created_at } : null;
}

export async function saveBrief(shop: Shop, content: MorningBrief, userId: string | null) {
  const { error } = await supabaseAdmin().from("briefs").insert({ shop_id: shop.id, content, created_by: userId });
  if (error) throw error;
}

export async function logRun(source: "meta" | "trendtrack" | "ai" | "pnl", shopId: string | null, ok: boolean, detail: string, credits?: number | null) {
  if (demoMode) return;
  await supabaseAdmin()
    .from("sync_runs")
    .insert({ source, shop_id: shopId, finished_at: new Date().toISOString(), ok, detail: detail.slice(0, 500), credits_left: credits ?? null });
}

export async function lastRun(source: "meta" | "trendtrack" | "ai" | "pnl", shopId: string | null) {
  if (demoMode) return null;
  let q = supabaseAdmin().from("sync_runs").select("*").eq("source", source).order("started_at", { ascending: false }).limit(1);
  if (shopId) q = q.eq("shop_id", shopId);
  const { data } = await q.maybeSingle();
  return data as { started_at: string; ok: boolean; detail: string; credits_left: number | null } | null;
}
