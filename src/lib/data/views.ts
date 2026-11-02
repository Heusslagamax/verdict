import "server-only";
import { unstable_cache } from "next/cache";
import { demoMode, platform } from "@/lib/env";
import { getCredentials, type Workspace } from "@/lib/workspace";
import { ageInDays, lastDays, sumDays, totalsFor } from "@/lib/engine/metrics";
import { decideCampaign, judgeAd } from "@/lib/engine/verdict";
import { readCompetitorAd } from "@/lib/engine/competitors";
import { fetchPnlDays, pnlRoas } from "@/lib/adapters/pnl";
import type {
  AdDay,
  AdVerdict,
  CampaignDecision,
  Competitor,
  CompetitorAd,
  CompetitorRead,
  Creative,
  MetaAd,
  PnlMapping,
  Shop,
  Thresholds,
  Totals,
  Window,
} from "@/lib/types";
import type { AiMatch } from "@/lib/engine/competitors";
import { suggestSources, type Suggestion } from "@/lib/engine/sources";
import * as repo from "./repo";
import { ensureFreshMeta, ownScripts } from "./sync";

/** Un jour sur l'axe des graphiques (14 derniers jours complets). */
export interface DayPoint {
  date: string;
  spend: number;
  value: number;
  purchases: number;
  addToCart: number;
  roas: number | null;
}

export const SERIES_DAYS = 14;

function series(days: AdDay[], axis: string[]): DayPoint[] {
  const by = new Map<string, DayPoint>();
  for (const d of days) {
    const p = by.get(d.date) ?? { date: d.date, spend: 0, value: 0, purchases: 0, addToCart: 0, roas: null };
    p.spend += d.spend;
    p.value += d.value;
    p.purchases += d.purchases;
    p.addToCart += d.addToCart;
    by.set(d.date, p);
  }
  return axis.map((date) => {
    const p = by.get(date) ?? { date, spend: 0, value: 0, purchases: 0, addToCart: 0, roas: null };
    return { ...p, roas: p.spend > 0 ? p.value / p.spend : null };
  });
}

/** Résultat estimé avant frais fixes : CA × marge avant pub − dépense (marge = 1 / BE). */
export function estimatedProfit(totals: Totals, t: Thresholds | null): number | null {
  if (!t || !(t.be > 0)) return null;
  return totals.value / t.be - totals.spend;
}

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
  /** Totaux de la période précédente (même durée), pour la tendance. */
  prev: Totals;
  /** Jour par jour sur 14 jours. */
  trend: DayPoint[];
  hasScript: boolean;
  script: string | null;
  /** D'où vient cette pub : copie confirmée d'une pub concurrente, pub originale, ou inconnu. */
  source: AdSource;
  /** Pubs concurrentes probables (scripts, textes, IA), à confirmer. */
  suggestions: Suggestion[];
}

export type AdSource =
  | { status: "confirmed"; competitorAdId: string; competitorId: string | null; method: string }
  | { status: "original" }
  | { status: "none" };

/** Version légère d'une pub concurrente, pour afficher la source et la choisir à la main. */
export interface CompetitorAdLite {
  id: string;
  competitorId: string;
  competitorName: string;
  text: string;
  thumbnailUrl: string | null;
  mediaType: "image" | "video" | null;
  reach: number | null;
  daysRunning: number | null;
  active: boolean;
}

export interface AdsetView {
  id: string;
  name: string;
  ads: AdView[];
  totals: Totals;
  prev: Totals;
  share: number;
  counts: Record<AdVerdict["code"], number>;
  trend: DayPoint[];
}

export interface CampaignView {
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  lifetimeSpend: number;
  totals: Totals;
  prev: Totals;
  profit: number | null;
  prevProfit: number | null;
  /** Jour par jour sur 14 jours (courbes). */
  series: DayPoint[];
  decision: CampaignDecision | null;
  adsets: AdsetView[];
  counts: Record<AdVerdict["code"], number>;
}

export interface PnlView {
  roas3d: number | null;
  roasYesterday: number | null;
  error: string | null;
  /** ROAS du P&L jour par jour (toute la boutique), aligné sur l'axe des graphiques. */
  days: { date: string; roas: number | null }[];
}

export interface CockpitView {
  shop: Shop;
  shops: { slug: string; name: string }[];
  window: Window;
  fetchedAt: string | null;
  syncError: string | null;
  thresholds: Thresholds | null;
  shopTotals: Totals;
  pnl: PnlView | null;
  /** Campagnes de la période demandée (= byWindow[window]). */
  campaigns: CampaignView[];
  /** Les trois périodes calculées d'un coup : changer de période ne repasse pas par le serveur. */
  byWindow: Record<Window, CampaignView[]>;
  /** La photo Meta est périmée : le navigateur lance la resynchronisation en arrière-plan. */
  stale: boolean;
  /** Pubs concurrentes relevées (sources possibles de mes pubs). */
  competitorAds: CompetitorAdLite[];
  sources: { meta: boolean; pnl: boolean; demo: boolean };
}

const emptyCounts = (): CampaignView["counts"] => ({ keep: 0, iterate: 0, cut: 0, watch: 0, wait: 0 });

export async function buildCockpit(
  ws: Workspace,
  slug: string,
  window: Window,
  today = new Date(),
  opts: { blockOnStaleMeta?: boolean } = {},
): Promise<CockpitView | null> {
  const shops = await repo.listShopsForView(ws.id);
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return null;
  const creds = await getCredentials(ws.id);

  const [{ snap, error: syncError, stale }, scripts, pnl, competitors, links, matches] = await Promise.all([
    ensureFreshMeta(shop, creds, today, { block: opts.blockOnStaleMeta }),
    repo.readScripts(shop),
    loadPnl(ws, shop, today),
    repo.listCompetitors(shop),
    repo.readSourceLinks(shop),
    repo.readMatches(shop),
  ]);
  const [compAds, aiMatches] = await Promise.all([repo.readCompetitorAds(competitors, today), repo.readAiMatches(competitors)]);

  const ads: MetaAd[] = snap?.ads ?? [];
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  const competitorAds: CompetitorAdLite[] = compAds.map((c) => ({
    id: c.id,
    competitorId: c.competitorId,
    competitorName: names.get(c.competitorId) ?? "",
    text: (c.transcript ?? c.body ?? "").slice(0, 320),
    thumbnailUrl: c.thumbnailUrl,
    mediaType: c.mediaType,
    reach: c.reach,
    daysRunning: c.daysRunning,
    active: c.status === "active",
  }));
  const confirmed = new Map(links.filter((l) => l.status === "confirmed").map((l) => [l.adId, l]));
  const suggestions = suggestSources(
    ads.map((a) => ({ id: a.id, name: a.name, script: scripts.get(a.id) ?? null, body: a.creative.body })),
    compAds.map((c) => ({ id: c.id, competitorId: c.competitorId, transcript: c.transcript, body: c.body })),
    links,
    aiMatches,
  );
  // Rapprochement (images + script + fiches, jugé par l'IA) : prioritaire sur les simples ressemblances de texte.
  const rejected = new Set(links.filter((l) => l.status === "rejected").map((l) => `${l.adId}:${l.competitorAdId}`));
  const RELATION = { copie_1_1: [0.97, "Copie 1:1"], iteration: [0.85, "Itération"], meme_angle: [0.6, "Même angle"] } as const;
  for (const m of matches) {
    if (m.relation === "different" || confirmed.has(m.adId) || rejected.has(`${m.adId}:${m.competitorAdId}`)) continue;
    const [base, label] = RELATION[m.relation];
    const score = base - (m.confidence === "faible" ? 0.15 : m.confidence === "moyenne" ? 0.05 : 0);
    const list = (suggestions.get(m.adId) ?? []).filter((x) => x.competitorAdId !== m.competitorAdId);
    list.push({ competitorAdId: m.competitorAdId, competitorId: m.competitorId ?? "", score, method: "ia", reason: `Rapprochement · ${label} (confiance ${m.confidence}) : ${m.evidence}` });
    suggestions.set(m.adId, list.sort((x, y) => y.score - x.score).slice(0, 3));
  }
  const sourceOf = (adId: string): AdSource => {
    const l = confirmed.get(adId);
    if (!l) return { status: "none" };
    if (!l.competitorAdId) return { status: "original" };
    return { status: "confirmed", competitorAdId: l.competitorAdId, competitorId: l.competitorId, method: l.method };
  };
  const t = shop.thresholds;
  const axis = lastDays(SERIES_DAYS, today);

  const campaignsFor = (window: Window): CampaignView[] =>
    (snap?.campaigns ?? [])
    .map((c) => {
      const cAds = ads.filter((a) => a.campaignId === c.id);
      const cDays = cAds.flatMap((a) => a.days);
      const totals = totalsFor(cDays, window, today);
      const prev = totalsFor(cDays, window, today, 1);
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
          prev: totalsFor(a.days, window, today, 1),
          trend: series(a.days, axis),
          hasScript: scripts.has(a.id),
          script: scripts.get(a.id) ?? null,
          source: sourceOf(a.id),
          suggestions: suggestions.get(a.id) ?? [],
        };
        const set =
          adsets.get(a.adsetId) ??
          ({ id: a.adsetId, name: a.adsetName, ads: [], totals: totals, prev, share: 0, counts: emptyCounts(), trend: [] } as AdsetView);
        set.ads.push(view);
        if (verdict) set.counts[verdict.code]++;
        adsets.set(a.adsetId, set);
      }
      for (const s of adsets.values()) {
        s.ads.sort((x, y) => y.totals.spend - x.totals.spend);
        const setDays = cAds.filter((a) => a.adsetId === s.id).flatMap((a) => a.days);
        s.totals = totalsFor(setDays, window, today);
        s.prev = totalsFor(setDays, window, today, 1);
        s.share = totals.spend > 0 ? s.totals.spend / totals.spend : 0;
        s.trend = series(setDays, axis);
      }
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        dailyBudget: c.dailyBudget,
        lifetimeSpend: c.lifetimeSpend,
        totals,
        prev,
        profit: estimatedProfit(totals, t),
        prevProfit: estimatedProfit(prev, t),
        series: series(cDays, axis),
        decision,
        adsets: [...adsets.values()].sort((x, y) => y.totals.spend - x.totals.spend),
        counts,
      };
    })
    // Campagnes actives d'abord, puis par dépense sur la période.
    .sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || b.totals.spend - a.totals.spend);

  const byWindow: Record<Window, CampaignView[]> = { "1d": campaignsFor("1d"), "3d": campaignsFor("3d"), "7d": campaignsFor("7d") };
  const campaigns = byWindow[window];

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
    byWindow,
    stale,
    competitorAds,
    sources: {
      meta: Boolean(creds.meta && shop.metaAdAccountId),
      pnl: Boolean(platform.googleSheets && ws.pnlSpreadsheetId && pnlReady(shop)),
      demo: demoMode || ws.id === "demo",
    },
  };
}

/**
 * Le P&L change une fois par jour : on le garde 5 minutes au lieu de relire le Google Sheets
 * à chaque page. Clé : fichier + colonnes + jour.
 */
const cachedPnlDays = unstable_cache(
  async (spreadsheetId: string, mapping: PnlMapping, day: string) => fetchPnlDays(spreadsheetId, mapping, new Date(`${day}T12:00:00Z`)),
  ["pnl-days"],
  { revalidate: 300 },
);

const pnlReady = (shop: Shop) => Boolean(shop.pnl?.spendColumn && shop.pnl?.salesColumn && shop.pnl?.roasColumn);

async function loadPnl(ws: Workspace, shop: Shop, today: Date): Promise<PnlView | null> {
  if (!platform.googleSheets || !ws.pnlSpreadsheetId || !pnlReady(shop)) return null;
  try {
    const days = await cachedPnlDays(ws.pnlSpreadsheetId, shop.pnl!, today.toISOString().slice(0, 10));
    const by = new Map(days.map((d) => [d.date, d]));
    return {
      ...pnlRoas(days, today),
      error: null,
      days: lastDays(SERIES_DAYS, today).map((date) => {
        const d = by.get(date);
        return { date, roas: d ? (d.roas ?? (d.spend > 0 ? d.sales / d.spend : null)) : null };
      }),
    };
  } catch (e) {
    return { roas3d: null, roasYesterday: null, error: e instanceof Error ? e.message : String(e), days: [] };
  }
}

// ---------- Radar concurrents ----------
export interface CompetitorAdView extends CompetitorAd {
  read: CompetitorRead;
  ai: AiMatch | null;
  competitorName: string;
  /** Mes pubs confirmées comme copies de celle-ci. */
  copiedBy: { adId: string; name: string }[];
}

export interface RadarView {
  shop: Shop;
  shops: { slug: string; name: string }[];
  competitors: (Competitor & { adCount: number })[];
  ads: CompetitorAdView[];
  lastSync: { at: string; ok: boolean; detail: string; credits: number | null } | null;
  sources: { trendtrack: boolean; ai: boolean; demo: boolean };
}

export async function buildRadar(ws: Workspace, slug: string, today = new Date()): Promise<RadarView | null> {
  const shops = await repo.listShopsForView(ws.id);
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return null;
  const [competitors, creds] = await Promise.all([repo.listCompetitors(shop), getCredentials(ws.id)]);
  const ads = await repo.readCompetitorAds(competitors, today);
  const [matches, owned, run, links, snap] = await Promise.all([
    repo.readAiMatches(competitors),
    ownScripts(shop, today, { competitors, compAds: ads }),
    repo.lastRun("trendtrack", shop.id),
    repo.readSourceLinks(shop),
    repo.readMetaSnapshot(shop, today),
  ]);
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  const adNames = new Map((snap?.ads ?? []).map((a) => [a.id, a.name]));
  const copies = new Map<string, { adId: string; name: string }[]>();
  for (const l of links) {
    if (l.status !== "confirmed" || !l.competitorAdId) continue;
    copies.set(l.competitorAdId, [...(copies.get(l.competitorAdId) ?? []), { adId: l.adId, name: adNames.get(l.adId) ?? l.adId }]);
  }
  const views = ads.map((a) => {
    const ai = matches.get(`${a.competitorId}:${a.id}`) ?? null;
    const copiedBy = copies.get(a.id) ?? [];
    const read = readCompetitorAd(a, owned, today, ai);
    // Une créa déjà copiée (liaison confirmée) n'est plus « à récupérer ».
    if (copiedBy.length) {
      read.recoverable = false;
      read.recoverReason = `Déjà copiée : ${copiedBy.map((c) => c.name).join(", ")}.`;
    }
    return { ...a, ai, read, copiedBy, competitorName: names.get(a.competitorId) ?? "" };
  });
  return {
    shop,
    shops: shops.map((s) => ({ slug: s.slug, name: s.name })),
    competitors: competitors.map((c) => ({ ...c, adCount: views.filter((v) => v.competitorId === c.id).length })),
    ads: views,
    lastSync: run ? { at: run.started_at, ok: run.ok, detail: run.detail, credits: run.credits_left } : null,
    sources: { trendtrack: Boolean(creds.trendtrack), ai: Boolean(creds.anthropic), demo: demoMode || ws.id === "demo" },
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
