// Formatage français, partagé serveur / navigateur.

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max });

const n0 = nf(0, 0);
const n2 = nf(2, 2);

export const dash = "—";

export function eur(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return dash;
  return `${(decimals === 0 ? n0 : n2).format(v)} €`;
}

export function roas(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return dash;
  return n2.format(v);
}

export function int(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return dash;
  return n0.format(v);
}

export function pct(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return dash;
  return `${nf(decimals, decimals).format(v * 100)} %`;
}

export function compact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return dash;
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function signed(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return dash;
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${n0.format(Math.abs(v))}`;
}

export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "jamais";
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export const WINDOW_LABEL = { "1d": "Hier", "3d": "3 jours", "7d": "7 jours" } as const;
