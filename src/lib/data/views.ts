import "server-only";
import { features, demoMode } from "@/lib/env";
import { ageInDays, sumDays, totalsFor, windowDays } from "@/lib/engine/metrics";
import { decideCampaign, judgeAd } from "@/lib/engine/verdict";
import { readCompetitorAd } from "@/lib/engine/competitors";
import { fetchPnlDays, pnlRoas } from "@/lib/adapters/pnl";
import type {
  AdVerdict,
  CampaignDecision,
  Competitor,
  CompetitorAd,
  CompetitorRead,
  Creative,
  MetaAd,
  Shop,
  Thresholds,
  Totals,
  Window,
} from "@/lib/types";
import type { AiMatch } from "@/lib/engine/competitors";
import * as repo from "./repo";
import { ensureFreshMeta, ownScripts } from "./sync";

export interface AdView {
  id: string;
  name: string;
  status: string;
  ageDays: number;
  creative: Creative;
  totals: Totals;
  lifetimeSpend: number;
  share: number;
  verdict: AdVerdict | null;
  /** Dépense et ROAS jour par jour sur 7 jours (sparklines). */
  trend: { date: string; spend: number; roas: number | null }[];
  hasScript: boolean;
  script: string | null;
}

export interface AdsetView {
  id: string;
  name: string;
  ads: AdView[];
}

export interface CampaignView {
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  lifetimeSpend: number;
  totals: Totals;
  decision: CampaignDecision | null;
  adsets: AdsetView[];
  counts: Record<AdVerdict["code"], number>;
}

export interface CockpitView {
  shop: Shop;
  shops: { slug: string; name: string }[];
  window: Window;
  fetchedAt: string | null;
  syncError: string | null;
  thresholds: Thresholds | null;
  shopTotals: Totals;
  pnl: { roas3d: number | null; roasYesterday: number | null; error: string | null } | null;
  campaigns: CampaignView[];
  sources: { meta: boolean; pnl: boolean; demo: boolean };
}

const emptyCounts = (): CampaignView["counts"] => ({ keep: 0, iterate: 0, cut: 0, watch: 0, wait: 0 });

export async function buildCockpit(slug: string, window: Window, today = new Date()): Promise<CockpitView | null> {
  const shops = await repo.listShops();
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return null;

  const [{ snap, error: syncError }, scripts, pnl] = await Promise.all([
    ensureFreshMeta(shop, today),
    repo.readScripts(shop),
    loadPnl(shop, today),
  ]);

  const ads: MetaAd[] = snap?.ads ?? [];
  const t = shop.thresholds;
  const last7 = new Set(windowDays("7d", today));

  const campaigns: CampaignView[] = (snap?.campaigns ?? [])
    .map((c) => {
      const cAds = ads.filter((a) => a.campaignId === c.id);
      const cDays = cAds.flatMap((a) => a.days);
      const totals = totalsFor(cDays, window, today);
      const decision = t
        ? decideCampaign({
            campaign: c,
            thresholds: t,
            pnl: pnl && !pnl.error ? pnl : null,
            meta3d: totalsFor(cDays, "3d", today),
            metaYesterday: totalsFor(cDays, "1d", today),
            today,
          })
        : null;
      const counts = emptyCounts();
      const adsets = new Map<string, AdsetView>();
      for (const a of cAds) {
        const w = totalsFor(a.days, window, today);
        const verdict = t
          ? judgeAd({ window: w, lifetimeSpend: a.lifetimeSpend, ageDays: ageInDays(a.createdTime, today), campaignWindow: totals, thresholds: t })
          : null;
        if (verdict) counts[verdict.code]++;
        const view: AdView = {
          id: a.id,
          name: a.name,
          status: a.status,
          ageDays: ageInDays(a.createdTime, today),
          creative: a.creative,
          totals: w,
          lifetimeSpend: a.lifetimeSpend,
          share: totals.spend > 0 ? w.spend / totals.spend : 0,
          verdict,
          trend: a.days
            .filter((d) => last7.has(d.date))
            .map((d) => ({ date: d.date, spend: d.spend, roas: d.spend > 0 ? d.value / d.spend : null })),
          hasScript: scripts.has(a.id),
          script: scripts.get(a.id) ?? null,
        };
        const set = adsets.get(a.adsetId) ?? { id: a.adsetId, name: a.adsetName, ads: [] };
        set.ads.push(view);
        adsets.set(a.adsetId, set);
      }
      for (const s of adsets.values()) s.ads.sort((x, y) => y.totals.spend - x.totals.spend);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        dailyBudget: c.dailyBudget,
        lifetimeSpend: c.lifetimeSpend,
        totals,
        decision,
        adsets: [...adsets.values()],
        counts,
      };
    })
    // Campagnes actives d'abord, puis par dépense sur la période.
    .sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || b.totals.spend - a.totals.spend);

  return {
    shop,
    shops: shops.map((s) => ({ slug: s.slug, name: s.name })),
    window,
    fetchedAt: snap?.fetchedAt ?? null,
    syncError,
    thresholds: t,
    shopTotals: totalsFor(
      ads.filter((a) => campaigns.find((c) => c.id === a.campaignId)?.status === "ACTIVE").flatMap((a) => a.days),
      window,
      today,
    ),
    pnl,
    campaigns,
    sources: { meta: features.meta, pnl: features.pnl && Boolean(shop.pnl), demo: demoMode },
  };
}

async function loadPnl(shop: Shop, today: Date) {
  if (!features.pnl || !shop.pnl) return null;
  try {
    const days = await fetchPnlDays(shop.pnl, today);
    return { ...pnlRoas(days, today), error: null };
  } catch (e) {
    return { roas3d: null, roasYesterday: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Radar concurrents ----------
export interface CompetitorAdView extends CompetitorAd {
  read: CompetitorRead;
  ai: AiMatch | null;
  competitorName: string;
}

export interface RadarView {
  shop: Shop;
  shops: { slug: string; name: string }[];
  competitors: (Competitor & { adCount: number })[];
  ads: CompetitorAdView[];
  lastSync: { at: string; ok: boolean; detail: string; credits: number | null } | null;
  sources: { trendtrack: boolean; ai: boolean; demo: boolean };
}

export async function buildRadar(slug: string, today = new Date()): Promise<RadarView | null> {
  const shops = await repo.listShops();
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return null;
  const competitors = await repo.listCompetitors(shop);
  const [ads, matches, owned, run] = await Promise.all([
    repo.readCompetitorAds(competitors, today),
    repo.readAiMatches(competitors),
    ownScripts(shop, today),
    repo.lastRun("trendtrack", shop.id),
  ]);
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  const views = ads.map((a) => {
    const ai = matches.get(`${a.competitorId}:${a.id}`) ?? null;
    return { ...a, ai, read: readCompetitorAd(a, owned, today, ai), competitorName: names.get(a.competitorId) ?? "" };
  });
  return {
    shop,
    shops: shops.map((s) => ({ slug: s.slug, name: s.name })),
    competitors: competitors.map((c) => ({ ...c, adCount: views.filter((v) => v.competitorId === c.id).length })),
    ads: views,
    lastSync: run ? { at: run.started_at, ok: run.ok, detail: run.detail, credits: run.credits_left } : null,
    sources: { trendtrack: features.trendtrack, ai: features.ai, demo: demoMode },
  };
}

/** Données envoyées à l'IA pour le brief : uniquement des chiffres déjà calculés. */
export function briefPayload(cockpit: CockpitView, radar: RadarView | null) {
  return {
    boutique: cockpit.shop.name,
    seuils: cockpit.thresholds,
    roasPnl: cockpit.pnl,
    campagnes: cockpit.campaigns
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({
        nom: c.name,
        budgetJour: c.dailyBudget,
        decision: c.decision && { action: c.decision.label, regle: c.decision.rule, budgetConseille: c.decision.nextBudget },
        ads: c.adsets.flatMap((s) =>
          s.ads.map((a) => ({
            nom: a.name,
            verdict: a.verdict?.label,
            regle: a.verdict?.rule,
            depense: round(a.totals.spend),
            roas: a.totals.roas && round(a.totals.roas),
            partDuSpend: round(a.share * 100),
          })),
        ),
      })),
    concurrents: radar?.ads
      .filter((a) => a.read.signals.some((s) => s !== "stable"))
      .slice(0, 30)
      .map((a) => ({
        id: a.id,
        concurrent: a.competitorName,
        signaux: a.read.signals,
        recuperable: a.read.recoverable,
        raison: a.read.recoverReason,
        jours: a.daysRunning,
        portee: a.reach,
        rang: a.currentRank,
        deltaRang: a.rankDelta,
        texte: (a.transcript ?? a.body ?? "").slice(0, 280),
      })),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
export { sumDays };
