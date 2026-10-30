/**
 * Moteur de décision — méthode Zecom (Module 12 + lives DROP 4/5).
 *
 * Deux niveaux :
 *  1. La CAMPAGNE (CBO) : arbre J1/J2/J4 en testing, puis scénarios de scaling 1 à 4
 *     sur le ROAS 3 jours / hier. Le ROAS vient du P&L (DAILY REPORT) quand il est
 *     disponible : c'est la source de vérité de l'utilisateur. Meta sert de repli.
 *  2. Chaque AD de la CBO : la méthode juge la campagne, pas l'ad isolée. Les verdicts
 *     par ad appliquent donc les règles CBO de Zecom : « 3 jours avant de juger une
 *     nouvelle créa », « ne pas couper un milieu de terrain d'une campagne rentable »,
 *     « garder les attaquants et les décliner », et les seuils J2 (ROAS < 1, coût/ATC
 *     > 20 % de l'AOV) pour couper.
 */
import type {
  AdVerdict,
  CampaignDecision,
  MetaCampaign,
  Thresholds,
  Totals,
} from "@/lib/types";

export const PALIERS = [50, 100, 150, 200, 300, 400, 500, 700, 1000] as const;

export function nextPalier(budget: number, skip = 0): number {
  const idx = PALIERS.findIndex((p) => p > budget + 0.5);
  if (idx === -1) return PALIERS[PALIERS.length - 1];
  return PALIERS[Math.min(idx + skip, PALIERS.length - 1)];
}

export function previousPalier(budget: number): number {
  const lower = PALIERS.filter((p) => p < budget - 0.5);
  return lower.length ? lower[lower.length - 1] : PALIERS[0];
}

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d).replace(".", ",");
const eur = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(2).replace(".", ",")} €`;

interface CampaignInput {
  campaign: MetaCampaign;
  thresholds: Thresholds;
  /** ROAS tirés du P&L (DAILY REPORT). Prioritaires. */
  pnl?: { roas3d: number | null; roasYesterday: number | null } | null;
  /** Repli Meta, calculé sur les ads de la campagne. */
  meta3d: Totals;
  metaYesterday: Totals;
  today: Date;
}

export function decideCampaign(input: CampaignInput): CampaignDecision {
  const { campaign: c, thresholds: t } = input;
  const spend = c.lifetimeSpend;
  const roasCum = spend > 0 ? c.lifetimeValue / spend : null;
  const cpc = c.lifetimeLinkClicks > 0 ? spend / c.lifetimeLinkClicks : null;
  const costAtc = c.lifetimeAddToCart > 0 ? spend / c.lifetimeAddToCart : null;
  const base = {
    nextBudget: null as number | null,
    roasSource: "meta" as const,
    roas3d: null as number | null,
    roasYesterday: null as number | null,
  };

  // ---- Testing : jalons cumulés 50 / 100 / 200 € (Zecom section 9) ----
  if (spend < 45) {
    return {
      ...base,
      phase: "testing",
      action: "continuer",
      label: "Continuer",
      rule: `Moins de 50 € dépensés (${eur(spend)}) : on ne touche à rien avant le premier jalon.`,
      source: "Zecom 9 · avant J1",
      computation: `Dépense cumulée ${eur(spend)} < 50 €`,
    };
  }
  if (spend < 95) {
    if (c.lifetimePurchases >= 1) {
      return {
        ...base,
        phase: "testing",
        action: "continuer",
        label: "Continuer",
        rule: "J1 : au moins une vente, on continue 24 h sans regarder le reste.",
        source: "Zecom 9 · étape 1",
        computation: `${c.lifetimePurchases} vente(s) pour ${eur(spend)}`,
      };
    }
    const cut = cpc != null && cpc > 1;
    return {
      ...base,
      phase: "testing",
      action: cut ? "couper" : "continuer",
      label: cut ? "Couper" : "Continuer",
      rule: cut
        ? "J1 : 0 vente et CPC lien > 1 €. Vérifie d'abord dans Shopify qu'aucune vente ne manque, puis coupe."
        : "J1 : 0 vente mais CPC lien < 1 € (traction), on laisse 24 h de plus.",
      source: "Zecom 9 · étape 1",
      computation: `0 vente · CPC lien ${eur(cpc)} vs seuil 1,00 €`,
    };
  }
  if (spend < 190) {
    const r = roasCum ?? 0;
    let action: CampaignDecision["action"] = "continuer";
    let rule = "";
    if (r >= t.be) rule = `J2 : ROAS cumulé ${fmt(r)} ≥ BE ${fmt(t.be)}, on continue.`;
    else if (r < 1) {
      action = "couper";
      rule = `J2 : ROAS cumulé ${fmt(r)} < 1, on coupe.`;
    } else if (costAtc != null && costAtc < t.atcTarget) {
      rule = `J2 : ROAS ${fmt(r)} sous le BE mais coût/ATC ${eur(costAtc)} < ${eur(t.atcTarget)}, on continue.`;
    } else {
      action = "couper";
      rule = `J2 : ROAS ${fmt(r)} sous le BE et coût/ATC ${eur(costAtc)} > ${eur(t.atcTarget)}, on coupe.`;
    }
    return {
      ...base,
      phase: "testing",
      action,
      label: action === "couper" ? "Couper" : "Continuer",
      rule,
      source: "Zecom 9 · étape 2",
      computation: `ROAS cumulé = ${eur(c.lifetimeValue)} / ${eur(spend)} = ${fmt(roasCum)}`,
    };
  }

  // ---- J4 (≈ 200 €) si la campagne est encore jeune ----
  const daysLive = c.firstDeliveryDate
    ? Math.floor((input.today.getTime() - new Date(c.firstDeliveryDate).getTime()) / 86_400_000)
    : 99;
  if (daysLive <= 5 && spend < 300) {
    const r = roasCum ?? 0;
    const action: CampaignDecision["action"] =
      r >= t.target ? "scaling" : r >= t.loss20 ? "optimisation" : "couper";
    return {
      ...base,
      phase: "testing",
      action,
      label: action === "scaling" ? "Passer en scaling" : action === "optimisation" ? "Optimisation" : "Couper",
      rule:
        action === "scaling"
          ? `J4 : ROAS cumulé ${fmt(r)} ≥ target ${fmt(t.target)}, fin du testing, on passe au palier suivant.`
          : action === "optimisation"
            ? `J4 : ROAS ${fmt(r)} entre −20 % (${fmt(t.loss20)}) et target (${fmt(t.target)}) : traction, première cartouche.`
            : `J4 : ROAS ${fmt(r)} < −20 % (${fmt(t.loss20)}), on coupe.`,
      source: "Zecom 9 · étape 3",
      nextBudget: action === "scaling" ? nextPalier(c.dailyBudget ?? 50) : null,
      computation: `ROAS cumulé = ${eur(c.lifetimeValue)} / ${eur(spend)} = ${fmt(roasCum)}`,
    };
  }

  // ---- Scaling / optimisation : scénarios 1 à 4 (Zecom 10.2) ----
  const pnlOk = input.pnl && input.pnl.roas3d != null;
  const r3 = pnlOk ? input.pnl!.roas3d! : input.meta3d.roas;
  const ry = pnlOk ? input.pnl!.roasYesterday : input.metaYesterday.roas;
  const src = pnlOk ? ("pnl" as const) : ("meta" as const);
  const budget = c.dailyBudget ?? null;
  const out = { roasSource: src, roas3d: r3 ?? null, roasYesterday: ry ?? null };
  const srcLabel = src === "pnl" ? "P&L" : "Meta (P&L indisponible)";

  if (r3 == null) {
    return {
      ...out,
      phase: "inconnu",
      action: "ne_pas_toucher",
      label: "Données insuffisantes",
      rule: "Pas de ROAS sur les 3 derniers jours : rien à décider aujourd'hui.",
      source: "Zecom 10.2",
      nextBudget: null,
      computation: `Source ${srcLabel}`,
    };
  }

  if (r3 >= t.target) {
    if (ry != null && ry < t.be) {
      return {
        ...out,
        phase: "scaling",
        action: "ne_pas_toucher",
        label: "Ne pas toucher",
        rule: `Scénario 2 : 3 jours ≥ target (${fmt(r3)}) mais hier < BE (${fmt(ry)}). On ne panique pas.`,
        source: "Zecom 10.2 · scénario 2",
        nextBudget: budget,
        computation: `ROAS 3 j ${fmt(r3)} · hier ${fmt(ry)} · ${srcLabel}`,
      };
    }
    const jump = t.jump != null && r3 >= t.jump;
    const target = budget != null ? nextPalier(budget, jump ? 1 : 0) : null;
    return {
      ...out,
      phase: "scaling",
      action: "augmenter",
      label: jump ? "Augmenter (saut de palier)" : "Augmenter",
      rule: jump
        ? `Scénario 1 + ≥ 30 % de marge (ROAS 3 j ${fmt(r3)} ≥ ${fmt(t.jump)}) : on peut sauter un palier.`
        : `Scénario 1 : ROAS 3 j ${fmt(r3)} ≥ target ${fmt(t.target)} et hier ${fmt(ry)} ≥ BE ${fmt(t.be)}.`,
      source: "Zecom 10.2 · scénario 1",
      nextBudget: target,
      computation: `ROAS 3 j ${fmt(r3)} · hier ${fmt(ry)} · ${srcLabel}`,
    };
  }

  if (r3 >= t.targetLow) {
    return {
      ...out,
      phase: "scaling",
      action: "ne_pas_toucher",
      label: "Ne pas toucher",
      rule: `Scénario 3 : ROAS 3 j ${fmt(r3)} dans la range (${fmt(t.targetLow)}–${fmt(t.target)}), on stabilise.`,
      source: "Zecom 10.2 · scénario 3",
      nextBudget: budget,
      computation: `ROAS 3 j ${fmt(r3)} · ${srcLabel}`,
    };
  }

  if (budget != null && budget <= 50.5) {
    return {
      ...out,
      phase: "optimisation",
      action: "plancher",
      label: "Plancher : optimisation",
      rule: `Scénario 4 au plancher de 50 € (ROAS 3 j ${fmt(r3)} < ${fmt(t.targetLow)}) : on ne coupe pas, on repasse en optimisation (nouvelles créas + nouvelle offre). Échec des cartouches → couper.`,
      source: "Zecom 10.2 · plancher + 11.2",
      nextBudget: 50,
      computation: `ROAS 3 j ${fmt(r3)} · ${srcLabel}`,
    };
  }

  return {
    ...out,
    phase: "scaling",
    action: "descaler",
    label: "Descaler",
    rule: `Scénario 4 : ROAS 3 j ${fmt(r3)} < bas de range ${fmt(t.targetLow)}, on redescend d'un palier.`,
    source: "Zecom 10.2 · scénario 4",
    nextBudget: budget != null ? previousPalier(budget) : null,
    computation: `ROAS 3 j ${fmt(r3)} · ${srcLabel}`,
  };
}

interface AdInput {
  window: Totals;
  lifetimeSpend: number;
  ageDays: number;
  campaignWindow: Totals;
  thresholds: Thresholds;
}

/** Verdict par ad dans une CBO (voir en-tête). */
export function judgeAd({ window: w, lifetimeSpend, ageDays, campaignWindow, thresholds: t }: AdInput): AdVerdict {
  const share = campaignWindow.spend > 0 ? w.spend / campaignWindow.spend : 0;
  const campaignHealthy = campaignWindow.roas != null && campaignWindow.roas >= t.targetLow;
  const enoughData = w.spend >= t.aov * 0.9 || lifetimeSpend >= t.aov * 1.5;
  const role: AdVerdict["role"] =
    ageDays < 3 ? "nouveau" : w.spend < 3 ? "muet" : share >= 0.3 ? "milieu" : w.roas != null && w.roas >= t.target ? "attaquant" : "remplaçant";

  if (ageDays < 3) {
    return {
      code: "wait",
      label: "Attendre",
      role,
      rule: `Nouvelle créa (${ageDays} j) : on attend 3 jours avant de la juger, elle peut faire baisser le ROAS de la campagne au début.`,
      source: "Zecom 10.5",
    };
  }

  if (w.roas != null && w.roas >= t.target) {
    return {
      code: "iterate",
      label: "Itérer",
      role,
      rule:
        role === "milieu"
          ? `Porte la campagne (${Math.round(share * 100)} % du spend) au-dessus du target (${fmt(w.roas)} ≥ ${fmt(t.target)}). Garde-la et décline son hook.`
          : `Attaquant : ROAS ${fmt(w.roas)} ≥ target ${fmt(t.target)} avec ${Math.round(share * 100)} % du spend. Garde-la et produis des itérations.`,
      source: "Zecom 10.5 · équipe de foot",
    };
  }

  if (role === "muet") {
    return {
      code: "watch",
      label: "Surveiller",
      role,
      rule: `Meta ne lui donne quasiment pas de spend (${eur(w.spend)}). Si tu veux vraiment la tester, mets-la dans une 2e CBO à 50 €.`,
      source: "Zecom 10.5 · étape 0",
    };
  }

  if (role === "milieu" && campaignHealthy) {
    return {
      code: "keep",
      label: "Garder",
      role,
      rule: `Milieu de terrain (${Math.round(share * 100)} % du spend) d'une campagne rentable : on ne la coupe pas, même à ROAS moyen (${fmt(w.roas)}).`,
      source: "Zecom 10.5 · équipe de foot",
    };
  }

  if (!enoughData) {
    return {
      code: "watch",
      label: "Surveiller",
      role,
      rule: `Pas encore assez de dépense pour trancher (${eur(w.spend)} sur la période, il faut environ un panier moyen : ${eur(t.aov)}).`,
      source: "Zecom 9 · paliers",
    };
  }

  const atcBad = w.addToCart === 0 || (w.costPerAtc != null && w.costPerAtc > t.atcTarget);

  if (w.roas == null || w.purchases === 0) {
    return atcBad
      ? {
          code: "cut",
          label: "Couper",
          role,
          rule: `${eur(w.spend)} dépensés, 0 vente et coût/ATC ${w.addToCart === 0 ? "sans ajout au panier" : `${eur(w.costPerAtc)} > ${eur(t.atcTarget)}`}.`,
          source: "Zecom 9 · règle J2 appliquée à l'ad",
        }
      : {
          code: "watch",
          label: "Surveiller",
          role,
          rule: `0 vente mais coût/ATC ${eur(w.costPerAtc)} sous ${eur(t.atcTarget)} : l'intention est là, on laisse tourner.`,
          source: "Zecom 9 · règle J2 appliquée à l'ad",
        };
  }

  if (w.roas < 1) {
    return {
      code: "cut",
      label: "Couper",
      role,
      rule: `ROAS ${fmt(w.roas)} < 1 sur ${eur(w.spend)} dépensés${role === "milieu" ? `, alors qu'elle prend ${Math.round(share * 100)} % du budget d'une campagne non rentable` : ""}.`,
      source: "Zecom 9 · règle J2 appliquée à l'ad",
    };
  }

  if (w.roas < t.be) {
    return atcBad
      ? {
          code: "cut",
          label: "Couper",
          role,
          rule: `ROAS ${fmt(w.roas)} sous le BE ${fmt(t.be)} et coût/ATC ${eur(w.costPerAtc)} > ${eur(t.atcTarget)}.`,
          source: "Zecom 9 · règle J2 appliquée à l'ad",
        }
      : {
          code: "watch",
          label: "Surveiller",
          role,
          rule: `ROAS ${fmt(w.roas)} sous le BE ${fmt(t.be)} mais coût/ATC ${eur(w.costPerAtc)} correct : on laisse tourner.`,
          source: "Zecom 9 · règle J2 appliquée à l'ad",
        };
  }

  return {
    code: "keep",
    label: "Garder",
    role,
    rule: `Rentable (ROAS ${fmt(w.roas)} ≥ BE ${fmt(t.be)}) mais sous le target ${fmt(t.target)}.`,
    source: "Zecom 7.2 · lecture ROAS",
  };
}
