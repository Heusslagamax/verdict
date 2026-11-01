import type { Thresholds } from "@/lib/types";

/**
 * Le « couloir » ROAS : cinq zones tirées des seuils de la boutique. C'est la langue
 * visuelle commune du cockpit — la courbe, la jauge de chaque pub et la matrice
 * utilisent exactement les mêmes zones, dans les mêmes couleurs.
 */
export type ZoneCode = "loss" | "under" | "thin" | "range" | "above";

export interface Zone {
  code: ZoneCode;
  label: string;
  /** Phrase courte pour un titre ou une infobulle. */
  short: string;
  color: string;
  wash: string;
}

export const ZONES: Record<ZoneCode, Zone> = {
  loss: { code: "loss", label: "Perte forte", short: "en perte forte", color: "var(--cut)", wash: "var(--zone-loss)" },
  under: { code: "under", label: "Sous le BE", short: "sous le break-even", color: "var(--watch)", wash: "var(--zone-under)" },
  thin: { code: "thin", label: "Rentable, marge mince", short: "rentable, marge mince", color: "var(--chalk-2)", wash: "var(--zone-thin)" },
  range: { code: "range", label: "Dans la range", short: "dans la range target", color: "var(--keep)", wash: "var(--zone-range)" },
  above: { code: "above", label: "Au-dessus du target", short: "au-dessus du target", color: "var(--keep)", wash: "var(--zone-above)" },
};

export const ZONE_ORDER: ZoneCode[] = ["loss", "under", "thin", "range", "above"];

export function zoneOf(roas: number | null | undefined, t: Thresholds): Zone | null {
  if (roas == null || !Number.isFinite(roas)) return null;
  if (roas < t.loss20) return ZONES.loss;
  if (roas < t.be) return ZONES.under;
  if (roas < t.targetLow) return ZONES.thin;
  if (roas < t.target) return ZONES.range;
  return ZONES.above;
}

/** Bornes basses de chaque zone (la zone « loss » commence à 0). */
export function zoneBounds(t: Thresholds): { code: ZoneCode; from: number; to: number }[] {
  return [
    { code: "loss", from: 0, to: t.loss20 },
    { code: "under", from: t.loss20, to: t.be },
    { code: "thin", from: t.be, to: t.targetLow },
    { code: "range", from: t.targetLow, to: t.target },
    { code: "above", from: t.target, to: Number.POSITIVE_INFINITY },
  ];
}

/** Haut d'échelle lisible pour un axe ROAS : couvre le target, le saut de palier et les données. */
export function roasCeiling(t: Thresholds, values: (number | null | undefined)[]): number {
  const data = Math.max(0, ...values.filter((v): v is number => v != null && Number.isFinite(v)));
  const floor = Math.max(t.jump ?? t.target * 1.3, t.target * 1.25);
  const raw = Math.max(floor, Math.min(data * 1.08, floor * 2.2));
  return Math.ceil(raw * 2) / 2;
}
