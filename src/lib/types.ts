// Types du domaine partagés par le moteur, les adaptateurs et l'interface.

export type ShopSlug = string;

export interface Thresholds {
  /** ROAS break-even (marge nette nulle). */
  be: number;
  /** Bas de la range target (15 % de marge nette). */
  targetLow: number;
  /** ROAS target (20 % de marge nette) = haut de la range. */
  target: number;
  /** ROAS −20 % de perte = BE × 0,8. */
  loss20: number;
  /** ROAS « saut de palier » (30 % de marge nette), facultatif. */
  jump?: number | null;
  /** Coût par ajout au panier cible = 20 % de l'AOV. */
  atcTarget: number;
  /** Panier moyen de référence (prix offre 1 en testing). */
  aov: number;
}

export interface Shop {
  id: string;
  slug: ShopSlug;
  name: string;
  market: string;
  metaAdAccountId: string | null;
  thresholds: Thresholds | null;
  pnl: PnlMapping | null;
  /** Fiche produit courte (produit, offre, promesse, avatar) : contexte du Studio Ads. */
  productBrief: string | null;
}

/** Où lire le bloc de la boutique dans l'onglet DAILY REPORT du P&L. */
export interface PnlMapping {
  dateColumn: string; // ex. "A"
  spendColumn: string; // FB Ads Costs, ex. "F"
  salesColumn: string; // Total Sales, ex. "J"
  roasColumn: string; // ROAS du jour, ex. "M"
}

export interface AdDay {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  linkClicks: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
  value: number;
}

export interface Creative {
  id: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  videoId: string | null;
  body: string | null;
  title: string | null;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  createdTime: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  creative: Creative;
  days: AdDay[];
  /** Dépense depuis le lancement de l'ad. */
  lifetimeSpend: number;
  /** Script saisi à la main (ou transcrit) pour comparer avec les créas concurrentes. */
  script?: string | null;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  createdTime: string;
  /** Dépense et CA cumulés depuis le lancement (Meta). */
  lifetimeSpend: number;
  lifetimeValue: number;
  lifetimeAddToCart: number;
  lifetimeLinkClicks: number;
  lifetimePurchases: number;
  firstDeliveryDate: string | null;
}

export interface PnlDay {
  date: string;
  spend: number;
  sales: number;
  roas: number | null;
}

export type Window = "1d" | "3d" | "7d";

export interface Totals {
  spend: number;
  impressions: number;
  linkClicks: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
  value: number;
  roas: number | null;
  cpc: number | null;
  ctr: number | null;
  costPerAtc: number | null;
  cpa: number | null;
  aov: number | null;
}

export type VerdictCode = "keep" | "iterate" | "cut" | "watch" | "wait";

export interface AdVerdict {
  code: VerdictCode;
  label: string;
  /** Rôle dans la CBO, au sens « équipe de foot » Zecom. */
  role: "milieu" | "attaquant" | "remplaçant" | "muet" | "nouveau";
  /** Phrase courte qui explique la règle appliquée. */
  rule: string;
  /** Référence de la règle dans la méthode (ex. « Zecom 10.5 »). */
  source: string;
}

export type CampaignPhase = "testing" | "optimisation" | "scaling" | "inconnu";

export type CampaignActionCode =
  | "couper"
  | "continuer"
  | "scaling"
  | "optimisation"
  | "augmenter"
  | "ne_pas_toucher"
  | "descaler"
  | "plancher";

export interface CampaignDecision {
  phase: CampaignPhase;
  action: CampaignActionCode;
  label: string;
  rule: string;
  source: string;
  /** Budget conseillé après décision (palier), si applicable. */
  nextBudget: number | null;
  /** D'où vient le ROAS utilisé : P&L (prioritaire) ou Meta. */
  roasSource: "pnl" | "meta";
  roas3d: number | null;
  roasYesterday: number | null;
  /** Calcul affiché à l'utilisateur. */
  computation: string;
}

export interface Competitor {
  id: string;
  shopId: string;
  name: string;
  brandtrackerId: string;
  active: boolean;
}

export interface CompetitorAd {
  id: string;
  competitorId: string;
  status: "active" | "inactive";
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  daysRunning: number | null;
  mediaType: "image" | "video" | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  body: string | null;
  transcript: string | null;
  landingUrl: string | null;
  cta: string | null;
  reach: number | null;
  reachDelta7d: number | null;
  estimatedSpend: number | null;
  currentRank: number | null;
  previousRank: number | null;
  rankDelta: number | null;
  /** Statut vu au précédent relevé (pour détecter les coupes). */
  previousStatus?: "active" | "inactive" | null;
  userFlag?: "deja_teste" | "iteration" | "ignore" | null;
}

export type CompetitorSignal = "montante" | "winner" | "coupee" | "nouvelle" | "stable";

export interface CompetitorRead {
  signals: CompetitorSignal[];
  recoverable: boolean;
  recoverReason: string;
  closestOwnAd: { adId: string; name: string; similarity: number } | null;
}
