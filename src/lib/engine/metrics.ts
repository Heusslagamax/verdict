import type { AdDay, Totals, Window } from "@/lib/types";

const DAY_MS = 86_400_000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Jours couverts par une fenêtre, en excluant aujourd'hui (journée incomplète). */
export const WINDOW_DAYS: Record<Window, number> = { "1d": 1, "3d": 3, "7d": 7 };

/**
 * Jours couverts par une fenêtre, en excluant aujourd'hui (journée incomplète).
 * `shift` décale d'autant de fenêtres vers le passé (1 = la période précédente).
 */
export function windowDays(window: Window, today: Date, shift = 0): string[] {
  const n = WINDOW_DAYS[window];
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(isoDay(new Date(today.getTime() - (i + shift * n) * DAY_MS)));
  return out;
}

/** Les n derniers jours complets, du plus ancien au plus récent (axe des graphiques). */
export function lastDays(n: number, today: Date): string[] {
  const out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(isoDay(new Date(today.getTime() - i * DAY_MS)));
  return out;
}

export function sumDays(days: AdDay[]): Totals {
  const t = days.reduce(
    (acc, d) => {
      acc.spend += d.spend;
      acc.impressions += d.impressions;
      acc.linkClicks += d.linkClicks;
      acc.addToCart += d.addToCart;
      acc.checkouts += d.checkouts;
      acc.purchases += d.purchases;
      acc.value += d.value;
      return acc;
    },
    { spend: 0, impressions: 0, linkClicks: 0, addToCart: 0, checkouts: 0, purchases: 0, value: 0 },
  );
  return {
    ...t,
    roas: t.spend > 0 ? t.value / t.spend : null,
    cpc: t.linkClicks > 0 ? t.spend / t.linkClicks : null,
    ctr: t.impressions > 0 ? t.linkClicks / t.impressions : null,
    costPerAtc: t.addToCart > 0 ? t.spend / t.addToCart : null,
    cpa: t.purchases > 0 ? t.spend / t.purchases : null,
    aov: t.purchases > 0 ? t.value / t.purchases : null,
  };
}

export function totalsFor(days: AdDay[], window: Window, today: Date, shift = 0): Totals {
  const keep = new Set(windowDays(window, today, shift));
  return sumDays(days.filter((d) => keep.has(d.date)));
}

export function ageInDays(createdIso: string, today: Date): number {
  return Math.max(0, Math.floor((today.getTime() - new Date(createdIso).getTime()) / DAY_MS));
}

/** Seuils Zecom calculés depuis les entrées produit (formules section 7.2). */
export function thresholdsFromInputs(input: {
  price: number;
  cogs: number;
  pspPct: number; // 0.03
  pspFixed: number; // 0.30
  taxPct: number; // TVA en % du TTC (0.1667) ou URSSAF (0.123)
  otherPct: number;
}) {
  const f = input.pspPct + input.pspFixed / input.price + input.taxPct + input.otherPct;
  const m = 1 - input.cogs / input.price - f;
  const be = 1 / m;
  const safeInv = (x: number) => (x > 0 ? 1 / x : Number.POSITIVE_INFINITY);
  return {
    be,
    targetLow: safeInv(m - 0.15),
    target: safeInv(m - 0.2),
    // Le fichier « Calcul ROAS BE & TARGET » de l'utilisateur fait foi : ROAS où la
    // marge nette vaut −20 % (1 / (m + 0,20)), et non BE × 0,8.
    loss20: 1 / (m + 0.2),
    jump: safeInv(m - 0.3),
    atcTarget: 0.2 * input.price,
    aov: input.price,
    marginBeforeAds: m,
  };
}
