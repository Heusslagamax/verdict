import type { AdVerdict, Thresholds, Totals } from "@/lib/types";

/**
 * Règles du Studio Ads. Chaque règle reprend une consigne écrite des skills de l'utilisateur
 * (Zecom « Expert créatives », crea-1-1, bibliothèque e-com DTC) et cite sa section : le Studio
 * n'invente pas de méthode. Le moteur choisit QUELLES itérations faire à partir des chiffres ;
 * l'IA ne fait que les écrire, dans le cadre de ces règles.
 */

export type Element =
  | "traduction_1_1"
  | "hook"
  | "body"
  | "angle"
  | "message"
  | "format"
  | "duree"
  | "acteur_lieu"
  | "offre";

export const ELEMENT_LABEL: Record<Element, string> = {
  traduction_1_1: "Traduction 1:1",
  hook: "Hook",
  body: "Body",
  angle: "Angle",
  message: "Message",
  format: "Format",
  duree: "Durée",
  acteur_lieu: "Acteur / lieu",
  offre: "Offre",
};

export interface Rule {
  id: string;
  title: string;
  /** Section de la skill d'où vient la règle. */
  source: string;
  /** La règle telle que l'IA doit l'appliquer. */
  text: string;
}

export const RULES = {
  "Z-3.2-SPEND": {
    id: "Z-3.2-SPEND",
    title: "Itérer ce qui a le plus dépensé",
    source: "Zecom créas 3.2",
    text: "On itère sur ce qui a le plus dépensé chez soi, pas sur le meilleur ROAS : une créa à gros spend est un milieu de terrain qui fait jouer toute la CBO.",
  },
  "Z-3.2-LOSER": {
    id: "Z-3.2-LOSER",
    title: "Jamais les losers",
    source: "Zecom créas 3.2",
    text: "On n'itère jamais sur une créa que Meta ne pousse pas (quelques euros de dépense) : il ne la pousse pas pour une bonne raison.",
  },
  "Z-5.1-HOOKS": {
    id: "Z-5.1-HOOKS",
    title: "Sur un gagnant : les hooks d'abord",
    source: "Zecom créas 5.1",
    text: "Sur un gagnant : 15 à 20 hooks, puis 15 à 20 body/CTA sur le meilleur hook. Itérer à la mort.",
  },
  "Z-5.2-HOOK": {
    id: "Z-5.2-HOOK",
    title: "Un vrai nouveau hook",
    source: "Zecom créas 5.2",
    text: "Le hook fait 60 à 70 % de la performance (2 à 6 premières secondes). Hook = headline + sous-titre + voix + footage. Nouveau plan de 3-4 s + nouvelle accroche = oui ; paraphrase sur le même visuel = non.",
  },
  "Z-5.2-MIDSHOT": {
    id: "Z-5.2-MIDSHOT",
    title: "Les plans du milieu font d'excellents hooks",
    source: "Zecom créas 5.2 et 5.4",
    text: "Prendre un plan du milieu (5-7 s) de la vidéo, ou le hook d'une autre vidéo du concurrent, avec une autre accroche.",
  },
  "Z-5.2-BODY": {
    id: "Z-5.2-BODY",
    title: "Body : tout changer, pas intervertir",
    source: "Zecom créas 5.2",
    text: "Body = voix et footages différents (tous changés), rééquilibrage des parties (ex. bénéfices 10 → 20 s), version storytelling, preuve sociale martelée. Intervertir les plans ou ajouter des transitions n'est pas une itération.",
  },
  "Z-5.2-FORMAT": {
    id: "Z-5.2-FORMAT",
    title: "Changer de format ou de durée",
    source: "Zecom créas 5.2",
    text: "Format (mashup → statique, GIF 5-10 s, VSL, UGC face cam) et durée (35 s → 12, 20, 55 s ; court = synthèse, long = éducation) sont de vraies itérations. 9:16 → 1:1 n'en est pas une.",
  },
  "Z-5.2-ACTEUR": {
    id: "Z-5.2-ACTEUR",
    title: "Acteur et lieu",
    source: "Zecom créas 5.2",
    text: "Changer l'âge, le sexe ou l'origine de l'acteur (les gens se projettent dans ceux qui leur ressemblent), ou le lieu (salon → voiture, garage, jardin).",
  },
  "Z-5.3-OFFRE": {
    id: "Z-5.3-OFFRE",
    title: "Statique offre",
    source: "Zecom créas 5.3",
    text: "Même visuel avec 1+1 / 2+2 / 3+3, prix, prix + réduction, ou prix à l'unité (« 19,99 € l'unité »). Sur un statique gagnant : changer 3 à 6 éléments.",
  },
  "Z-10-MESSAGE": {
    id: "Z-10-MESSAGE",
    title: "Nouveau message pour une nouvelle poche",
    source: "Zecom créas 10 et 12.1",
    text: "Chaque message consomme une poche d'audience. Quand une créa s'essouffle, ce n'est pas un nouveau concept sur le même message qui débloque : c'est un nouveau message ou un nouvel angle. Déclinaison type : un métier, un lieu, un avatar par créa.",
  },
  "Z-12.1-FATIGUE": {
    id: "Z-12.1-FATIGUE",
    title: "Créa qui s'essouffle",
    source: "Zecom créas 12.1",
    text: "Déclin progressif = poche épuisée ou footage fatigue : nouveaux messages/angles et nouveaux B-rolls, pas une reformulation.",
  },
  "Z-12.1-ADS": {
    id: "Z-12.1-ADS",
    title: "CPC élevé, intention correcte : c'est la pub",
    source: "Zecom créas 12.1 (7)",
    text: "CPC > 0,70 € avec un taux d'ajout au panier > 8 % : le problème vient plutôt de la pub (accroche, angle), pas du site.",
  },
  "Z-12.1-SITE": {
    id: "Z-12.1-SITE",
    title: "CPC bas, peu d'ajouts : c'est le site ou l'offre",
    source: "Zecom créas 12.1 (7) et 5.3",
    text: "CPC < 0,70 € avec moins de 8 % d'ajouts au panier : la pub fait cliquer, c'est la page ou l'offre qui bloque. Côté pub, l'itération utile est un statique offre ; la cartouche offre se joue sur le site.",
  },
  "Z-4.0-1TO1": {
    id: "Z-4.0-1TO1",
    title: "Concurrente : traduction 1:1 d'abord",
    source: "Zecom créas 1 et 4.0, crea-1-1 §4",
    text: "Une créa concurrente se reprend d'abord en 1:1 strict : même script, mêmes biais, même structure (hook, problème, agitation, solution, démo, preuve, objections, bénéfices, réassurance, offre, CTA), même montage et rythme. Pas de lip-sync. Les itérations maison viennent ensuite.",
  },
  "C-3-LOCAL": {
    id: "C-3-LOCAL",
    title: "Localiser, pas traduire",
    source: "crea-1-1 §3 et §17",
    text: "Sens marketing > naturel > fidélité littérale. Adapter langue, ton, prénoms, unités, prix, avis, CTA au pays. Le hook traduit doit jouer le même rôle (curiosité, douleur, désir, pattern interrupt) : ne jamais l'abîmer pour coller au mot à mot.",
  },
  "Z-6.6-COPY": {
    id: "Z-6.6-COPY",
    title: "Ad copy de la top ad",
    source: "Zecom créas 6.6",
    text: "Par défaut, l'ad copy est celle de la top ad du concurrent, traduite. Une vidéo d'un angle totalement différent garde sa propre copy.",
  },
  "Z-5.1-FAUX": {
    id: "Z-5.1-FAUX",
    title: "Pas de faux volume",
    source: "Zecom créas 5.1",
    text: "Reformuler en gardant la même créa = faux volume : même poche d'audience, spend bloqué. Chaque itération doit changer un élément réel (plan, voix, message, format…).",
  },
  "Z-6.5-HONNETE": {
    id: "Z-6.5-HONNETE",
    title: "Honnêteté publicitaire",
    source: "Zecom créas 6.5, bibliothèque DTC §15",
    text: "Aucun faux témoignage, faux avis, fausse autorité, fausse urgence ni founder story inventée. Témoignages et autorités seulement s'ils sont réels ; sinon storytelling à la 3e personne qui ne se présente pas comme un vrai témoignage.",
  },
  "B-7-UN": {
    id: "B-7-UN",
    title: "Règle du un",
    source: "Bibliothèque DTC §7",
    text: "Une pub = un avatar, un désir, un message. Empiler les bénéfices détruit la croyance.",
  },
  "B-8-HOOK": {
    id: "B-8-HOOK",
    title: "Un hook fait une seule chose",
    source: "Bibliothèque DTC §8",
    text: "Hook = émotion + écart de curiosité + enjeu. Il appelle l'avatar, le problème OU la solution, et attire la bonne personne. Démarrer dans l'action ; un hook qui contient du corps de script tue la pub.",
  },
  "Z-11-AWARENESS": {
    id: "Z-11-AWARENESS",
    title: "Niveaux de conscience : pas trop tôt",
    source: "Zecom créas 11",
    text: "Sous ~5 000 €/jour de CA, pas de créas unaware ou problem aware délibérées : rester en product et solution aware, en variant angles et messages.",
  },
} satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;

export interface PlanItem {
  element: Element;
  count: number;
  ruleId: RuleId;
}

export interface Diagnosis {
  eligible: boolean;
  /** Pourquoi cette source (ou pourquoi pas). */
  headline: string;
  /** Règles déclenchées par les chiffres, avec la raison chiffrée. */
  triggered: { ruleId: RuleId; why: string }[];
  /** Ce qu'il faut produire : élément × nombre, chaque ligne justifiée par une règle. */
  plan: PlanItem[];
  /** Garde-fous rappelés à l'IA pour chaque brief. */
  guardrails: RuleId[];
}

export const MAX_BRIEFS = 5;
const ALWAYS: RuleId[] = ["Z-5.1-FAUX", "Z-6.5-HONNETE", "B-7-UN", "B-8-HOOK"];
const pct = (v: number) => `${Math.round(v * 100)} %`;
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

export interface OwnSource {
  name: string;
  verdict: Pick<AdVerdict, "code" | "role"> | null;
  /** Part du budget de la campagne sur la période. */
  share: number;
  totals: Totals;
  lifetimeSpend: number;
  /** ROAS jour par jour, du plus ancien au plus récent (14 jours). */
  roasByDay: (number | null)[];
  spendByDay: number[];
  isVideo: boolean;
}

/** Une pub à moi mérite-t-elle des itérations, et lesquelles ? */
export function diagnoseOwn(ad: OwnSource, t: Thresholds, ctx: { dailyRevenue: number }): Diagnosis {
  const triggered: Diagnosis["triggered"] = [];
  const plan: PlanItem[] = [];
  const add = (element: Element, count: number, ruleId: RuleId) => {
    const have = plan.reduce((a, p) => a + p.count, 0);
    const n = Math.min(count, MAX_BRIEFS - have);
    if (n > 0) plan.push({ element, count: n, ruleId });
  };
  const w = ad.totals;
  const winner = w.roas != null && w.roas >= t.target;
  const midfield = ad.share >= 0.3 && w.roas != null && w.roas >= t.be;

  // Zecom 3.2 : jamais les losers.
  if (w.spend < t.aov * 0.5 && ad.lifetimeSpend < t.aov * 1.5) {
    return {
      eligible: false,
      headline: `Pas assez de dépense (${num(w.spend)} € sur la période) : Meta ne la pousse pas, on n'itère pas dessus.`,
      triggered: [{ ruleId: "Z-3.2-LOSER", why: `${num(w.spend)} € dépensés, moins d'un demi panier moyen.` }],
      plan: [],
      guardrails: ALWAYS,
    };
  }
  if (!winner && !midfield) {
    return {
      eligible: false,
      headline: `ROAS ${num(w.roas)} sous le BE ${num(t.be)} sans être un milieu de terrain : pas une base d'itération.`,
      triggered: [{ ruleId: "Z-3.2-SPEND", why: `${pct(ad.share)} du budget, ROAS ${num(w.roas)}.` }],
      plan: [],
      guardrails: ALWAYS,
    };
  }

  triggered.push({
    ruleId: "Z-3.2-SPEND",
    why: `${pct(ad.share)} du budget de la campagne, ${num(w.spend)} € sur la période, ROAS ${num(w.roas)}.`,
  });

  // Essoufflement : ROAS des 3 derniers jours nettement sous celui des 7 jours d'avant.
  const recent = avgRoas(ad.roasByDay.slice(-3), ad.spendByDay.slice(-3));
  const before = avgRoas(ad.roasByDay.slice(-10, -3), ad.spendByDay.slice(-10, -3));
  const fatigue = recent != null && before != null && before > 0 && recent < before * 0.75;
  if (fatigue) {
    triggered.push({ ruleId: "Z-12.1-FATIGUE", why: `ROAS 3 derniers jours ${num(recent)} contre ${num(before)} les 7 jours d'avant (−${pct(1 - recent! / before!)}).` });
  }

  // Pub ou site ? (repères Zecom 12.1-7)
  const atcRate = w.linkClicks > 0 ? w.addToCart / w.linkClicks : null;
  const siteSide = w.cpc != null && atcRate != null && w.cpc <= 0.7 && atcRate < 0.08;
  const adSide = w.cpc != null && atcRate != null && w.cpc > 0.7 && atcRate >= 0.08;
  if (adSide) triggered.push({ ruleId: "Z-12.1-ADS", why: `CPC ${num(w.cpc)} € et ${pct(atcRate!)} d'ajouts au panier.` });
  if (siteSide) triggered.push({ ruleId: "Z-12.1-SITE", why: `CPC ${num(w.cpc)} € mais seulement ${pct(atcRate!)} d'ajouts au panier.` });

  if (winner) {
    triggered.push({ ruleId: "Z-5.1-HOOKS", why: `ROAS ${num(w.roas)} ≥ target ${num(t.target)} : c'est un gagnant.` });
    add("hook", fatigue ? 2 : 3, "Z-5.1-HOOKS");
    if (fatigue) add("message", 1, "Z-10-MESSAGE");
    add(ad.isVideo ? "duree" : "offre", 1, ad.isVideo ? "Z-5.2-FORMAT" : "Z-5.3-OFFRE");
    add("body", 1, "Z-5.2-BODY");
  } else {
    // Milieu de terrain rentable sous le target : apporter de la fraîcheur sans casser ce qui tient.
    add("hook", 2, "Z-5.2-HOOK");
    add("message", fatigue ? 2 : 1, "Z-10-MESSAGE");
    add("acteur_lieu", 1, "Z-5.2-ACTEUR");
  }
  if (siteSide) add("offre", 1, "Z-12.1-SITE");
  if (ad.isVideo && !winner) add("format", 1, "Z-5.2-FORMAT");

  const guardrails: RuleId[] = [...ALWAYS, "Z-5.2-HOOK"];
  if (ctx.dailyRevenue < 5000) guardrails.push("Z-11-AWARENESS");

  return {
    eligible: true,
    headline: winner
      ? `Gagnante : ROAS ${num(w.roas)} au-dessus du target avec ${pct(ad.share)} du budget. On décline ses hooks.`
      : `Milieu de terrain : ${pct(ad.share)} du budget à ROAS ${num(w.roas)}, rentable. On lui apporte de la fraîcheur.`,
    triggered,
    plan,
    guardrails,
  };
}

export interface CompetitorSource {
  mediaType: "image" | "video" | null;
  hasScript: boolean;
}

/** Une créa concurrente à récupérer : 1:1 d'abord, puis des hooks tirés de ses plans. */
export function diagnoseCompetitor(ad: CompetitorSource, ctx: { dailyRevenue: number }): Diagnosis {
  const plan: PlanItem[] = [{ element: "traduction_1_1", count: 1, ruleId: "Z-4.0-1TO1" }];
  if (ad.mediaType === "image") {
    plan.push({ element: "offre", count: 2, ruleId: "Z-5.3-OFFRE" });
  } else {
    plan.push({ element: "hook", count: 2, ruleId: "Z-5.2-MIDSHOT" });
  }
  const guardrails: RuleId[] = [...ALWAYS, "C-3-LOCAL", "Z-6.6-COPY"];
  if (ctx.dailyRevenue < 5000) guardrails.push("Z-11-AWARENESS");
  return {
    eligible: true,
    headline: ad.hasScript
      ? "Créa concurrente pas encore copiée : traduction 1:1 d'abord, puis deux itérations."
      : "Créa concurrente sans transcription : le 1:1 se fera à partir de la vidéo elle-même ; les itérations restent indicatives.",
    triggered: [{ ruleId: "Z-4.0-1TO1", why: "Répliquer avant de créer : traduire ce qui a déjà dépensé chez un concurrent." }],
    plan,
    guardrails,
  };
}

function avgRoas(roas: (number | null)[], spend: number[]): number | null {
  let s = 0;
  let v = 0;
  roas.forEach((r, i) => {
    if (r == null || !(spend[i] > 0)) return;
    s += spend[i];
    v += r * spend[i];
  });
  return s > 0 ? v / s : null;
}

export const planSize = (d: Diagnosis) => d.plan.reduce((a, p) => a + p.count, 0);
