import "server-only";
import type { Workspace } from "@/lib/workspace";
import type { Shop, Thresholds, VerdictCode } from "@/lib/types";
import { diagnoseCompetitor, diagnoseOwn, RULES, type Diagnosis, type RuleId } from "@/lib/engine/studio";
import { buildCockpit, buildRadar, type AdView, type CompetitorAdView } from "./views";
import * as repo from "./repo";

export interface OwnStudioSource {
  ad: AdView;
  campaignName: string;
  diagnosis: Diagnosis;
}

export interface CompetitorStudioSource {
  ad: CompetitorAdView;
  diagnosis: Diagnosis;
}

export interface LaunchResult {
  name: string;
  spend: number;
  roas: number | null;
  verdict: VerdictCode | null;
}

export interface StudioView {
  shop: Shop;
  thresholds: Thresholds | null;
  dailyRevenue: number;
  own: OwnStudioSource[];
  /** Pubs à moi écartées (losers, perdantes) : nombre seulement. */
  ownExcluded: number;
  competitors: CompetitorStudioSource[];
  briefs: repo.StudioBriefRow[];
  /** Mes pubs Meta, pour relier un brief à la pub lancée. */
  launchable: { id: string; name: string }[];
  results: Record<string, LaunchResult>;
  sources: { ai: boolean; demo: boolean };
}

export async function buildStudio(ws: Workspace, slug: string, today = new Date()): Promise<StudioView | null> {
  const [cockpit, radar] = await Promise.all([buildCockpit(ws, slug, "7d", today), buildRadar(ws, slug, today)]);
  if (!cockpit) return null;
  const t = cockpit.thresholds;
  const active = cockpit.campaigns.filter((c) => c.status === "ACTIVE");
  const dailyRevenue = active.reduce((a, c) => a + c.totals.value, 0) / 7;

  const own: OwnStudioSource[] = [];
  let ownExcluded = 0;
  if (t) {
    for (const c of active) {
      for (const ad of c.adsets.flatMap((s) => s.ads)) {
        const diagnosis = diagnoseOwn(
          {
            name: ad.name,
            verdict: ad.verdict,
            share: ad.share,
            totals: ad.totals,
            lifetimeSpend: ad.lifetimeSpend,
            roasByDay: ad.trend.map((d) => d.roas),
            spendByDay: ad.trend.map((d) => d.spend),
            isVideo: Boolean(ad.creative.videoId),
          },
          t,
          { dailyRevenue },
        );
        if (diagnosis.eligible) own.push({ ad, campaignName: c.name, diagnosis });
        else ownExcluded++;
      }
    }
  }
  // Zecom 3.2 : ce qui a le plus dépensé d'abord.
  own.sort((a, b) => b.ad.totals.spend - a.ad.totals.spend);

  const competitors: CompetitorStudioSource[] = (radar?.ads ?? [])
    .filter((a) => a.read.recoverable && !a.copiedBy.length)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 30)
    .map((ad) => ({ ad, diagnosis: diagnoseCompetitor({ mediaType: ad.mediaType, hasScript: Boolean(ad.transcript ?? ad.body) }, { dailyRevenue }) }));

  const briefs = await repo.listStudioBriefs(cockpit.shop);
  const allAds = cockpit.campaigns.flatMap((c) => c.adsets.flatMap((s) => s.ads));
  const results: Record<string, LaunchResult> = {};
  for (const b of briefs) {
    if (!b.launchedAdId) continue;
    const ad = allAds.find((a) => a.id === b.launchedAdId);
    if (ad) results[ad.id] = { name: ad.name, spend: ad.totals.spend, roas: ad.totals.roas, verdict: ad.verdict?.code ?? null };
  }

  return {
    shop: cockpit.shop,
    thresholds: t,
    dailyRevenue,
    own,
    ownExcluded,
    competitors,
    briefs,
    launchable: allAds.map((a) => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name)),
    results,
    sources: { ai: Boolean(radar?.sources.ai), demo: cockpit.sources.demo },
  };
}

const LANG: Record<string, string> = {
  IT: "italien",
  FR: "français",
  ES: "espagnol",
  DE: "allemand",
  NL: "néerlandais",
  PT: "portugais",
  FI: "finnois",
  PL: "polonais",
  GB: "anglais",
  US: "anglais",
  BE: "français",
  CH: "français",
  AT: "allemand",
};

/** Ce qu'on envoie à l'IA : uniquement des faits (chiffres, scripts) et le cadre (plan, règles). */
export function studioPayload(view: StudioView, source: OwnStudioSource | CompetitorStudioSource) {
  const d = source.diagnosis;
  const ruleIds = [...new Set<RuleId>([...d.plan.map((p) => p.ruleId), ...d.triggered.map((x) => x.ruleId), ...d.guardrails])];
  const isOwn = "campaignName" in source;
  const existing = view.briefs.filter((b) => b.sourceId === source.ad.id).map((b) => `${b.element} : ${b.title}`);
  return {
    boutique: {
      nom: view.shop.name,
      marche: view.shop.market,
      langueDesScripts: LANG[view.shop.market] ?? "langue du marché",
      ficheProduit: view.shop.productBrief ?? "(non renseignée : déduis le produit des scripts)",
      seuils: view.thresholds,
      caParJour: Math.round(view.dailyRevenue),
    },
    source: isOwn
      ? {
          type: "ma pub",
          nom: source.ad.name,
          format: source.ad.creative.videoId ? "vidéo" : "statique",
          verdict: source.ad.verdict?.label,
          role: source.ad.verdict?.role,
          chiffres7j: {
            depense: round(source.ad.totals.spend),
            partDuBudget: round(source.ad.share * 100),
            roas: source.ad.totals.roas && round(source.ad.totals.roas),
            cpc: source.ad.totals.cpc && round(source.ad.totals.cpc),
            ctr: source.ad.totals.ctr && round(source.ad.totals.ctr * 100),
            coutAjoutPanier: source.ad.totals.costPerAtc && round(source.ad.totals.costPerAtc),
            achats: source.ad.totals.purchases,
          },
          script: source.ad.script ?? "(script non saisi : appuie-toi sur le texte d'annonce et le nom)",
          texteAnnonce: source.ad.creative.body,
        }
      : {
          type: "pub concurrente à récupérer",
          concurrent: source.ad.competitorName,
          format: source.ad.mediaType === "image" ? "statique" : "vidéo",
          joursDeDiffusion: source.ad.daysRunning,
          portee: source.ad.reach,
          transcription: source.ad.transcript,
          texteAnnonce: source.ad.body,
        },
    diagnostic: { constat: d.headline, regles: d.triggered },
    plan: d.plan.map((p) => ({ element: p.element, nombre: p.count, regle: p.ruleId })),
    regles: Object.fromEntries(ruleIds.map((id) => [id, `${RULES[id].title} (${RULES[id].source}) : ${RULES[id].text}`])),
    gardeFous: d.guardrails,
    dejaProduits: existing,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
