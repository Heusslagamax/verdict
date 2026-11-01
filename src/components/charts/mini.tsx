import clsx from "clsx";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Thresholds, VerdictCode } from "@/lib/types";
import { roas as fmtRoas } from "@/lib/format";
import { zoneBounds, zoneOf, type ZoneCode } from "@/lib/zones";
import { VERDICT_STYLE } from "@/components/ui";

const GAUGE: Record<ZoneCode, string> = {
  loss: "var(--gauge-loss)",
  under: "var(--gauge-under)",
  thin: "var(--gauge-thin)",
  range: "var(--gauge-range)",
  above: "var(--gauge-above)",
};

/**
 * Jauge ROAS (bullet chart) : le couloir des seuils en piste, une aiguille pour la valeur,
 * un repère creux pour la période précédente. Même échelle `ceil` pour toutes les pubs
 * d'une liste, pour que les jauges se comparent d'une ligne à l'autre.
 */
export function RoasGauge({
  value,
  prev,
  t,
  ceil,
  className,
  height = 8,
}: {
  value: number | null;
  prev?: number | null;
  t: Thresholds;
  ceil: number;
  className?: string;
  height?: number;
}) {
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), ceil) / ceil) * 100}%`;
  const z = zoneOf(value, t);
  return (
    <div
      className={clsx("relative w-full", className)}
      style={{ height: height + 8 }}
      role="img"
      aria-label={value == null ? "ROAS indisponible" : `ROAS ${fmtRoas(value)}, ${z?.short ?? ""}`}
    >
      <div className="absolute inset-x-0 flex gap-[2px]" style={{ top: 4, height }}>
        {zoneBounds(t).map((b) => {
          const from = Math.min(b.from, ceil);
          const to = Math.min(b.to, ceil);
          if (to <= from) return null;
          return (
            <span
              key={b.code}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: to - from, flexBasis: 0, background: GAUGE[b.code], opacity: value == null ? 0.4 : 1 }}
            />
          );
        })}
      </div>
      {prev != null && Number.isFinite(prev) ? (
        <span
          aria-hidden
          className="absolute -translate-x-1/2 rounded-full border-2 border-chalk-3 bg-ink-1"
          style={{ left: pos(prev), top: 4 + height / 2 - 4, width: 8, height: 8 }}
        />
      ) : null}
      {value != null ? (
        <span
          aria-hidden
          className="absolute -translate-x-1/2 rounded-full bg-chalk-1 shadow-[0_0_0_2px_var(--ink-1)]"
          style={{ left: pos(value), top: 0, width: 3, height: height + 8 }}
        />
      ) : null}
    </div>
  );
}

/** Mini-courbe de ROAS (14 jours) avec la ligne du target ; le dernier point prend la couleur de sa zone. */
export function Sparkline({
  values,
  t,
  width = 112,
  height = 30,
  windowDays = 7,
}: {
  values: (number | null)[];
  t: Thresholds | null;
  width?: number;
  height?: number;
  windowDays?: number;
}) {
  const n = values.length;
  const max = Math.max(t ? t.target * 1.3 : 1, ...values.filter((v): v is number => v != null)) * 1.05;
  const x = (i: number) => 3 + (i / Math.max(1, n - 1)) * (width - 6);
  const y = (v: number) => 3 + (height - 6) * (1 - Math.min(v, max) / max);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const last = [...values.keys()].reverse().find((i) => values[i] != null);
  const lastZone = last != null && t ? zoneOf(values[last], t) : null;
  return (
    <svg width={width} height={height} aria-hidden className="block overflow-visible">
      <rect x={x(Math.max(0, n - windowDays))} y={0} width={width - x(Math.max(0, n - windowDays))} height={height} fill="rgba(148,170,210,0.05)" rx={3} />
      {t ? <line x1={0} x2={width} y1={y(t.target)} y2={y(t.target)} stroke="var(--keep)" strokeOpacity={0.45} /> : null}
      {t ? <line x1={0} x2={width} y1={y(t.be)} y2={y(t.be)} stroke="var(--watch)" strokeOpacity={0.4} /> : null}
      <path d={d} fill="none" stroke="var(--chalk-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last != null ? <circle cx={x(last)} cy={y(values[last]!)} r={3} fill={lastZone?.color ?? "var(--chalk-2)"} stroke="var(--ink-1)" strokeWidth={1.5} /> : null}
    </svg>
  );
}

const MIX_ORDER: VerdictCode[] = ["cut", "watch", "wait", "keep", "iterate"];

/** Répartition des verdicts d'un adset : barre fine segmentée, une couleur par verdict, 2 px d'écart. */
export function VerdictMix({ counts, className }: { counts: Record<VerdictCode, number>; className?: string }) {
  const total = MIX_ORDER.reduce((a, c) => a + counts[c], 0);
  if (!total) return <div className={clsx("h-1.5 rounded-full bg-ink-3", className)} />;
  return (
    <div
      className={clsx("flex h-1.5 gap-[2px]", className)}
      role="img"
      aria-label={MIX_ORDER.filter((c) => counts[c]).map((c) => `${counts[c]} ${VERDICT_STYLE[c].label.toLowerCase()}`).join(", ")}
    >
      {MIX_ORDER.filter((c) => counts[c]).map((c) => (
        <span key={c} className="h-full rounded-full" style={{ flexGrow: counts[c], flexBasis: 0, background: VERDICT_STYLE[c].fg }} />
      ))}
    </div>
  );
}

/** Variation vs la période précédente. `goodWhenUp` dit si la hausse est une bonne nouvelle. */
export function Delta({
  now,
  prev,
  goodWhenUp = true,
  kind = "pct",
  quiet = false,
}: {
  now: number | null;
  prev: number | null;
  goodWhenUp?: boolean;
  kind?: "pct" | "abs";
  /** Dans une liste : ne rien afficher plutôt que « pas de comparaison ». */
  quiet?: boolean;
}) {
  if (now == null || prev == null || !Number.isFinite(now) || !Number.isFinite(prev) || (kind === "pct" && prev === 0)) {
    return quiet ? null : <span className="text-[12px] text-chalk-4">pas de comparaison</span>;
  }
  const diff = kind === "pct" ? (now - prev) / Math.abs(prev) : now - prev;
  const flat = Math.abs(kind === "pct" ? diff : diff / Math.max(1, Math.abs(prev))) < 0.02;
  const good = flat ? null : diff > 0 === goodWhenUp;
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const text =
    kind === "pct"
      ? `${diff > 0 ? "+" : "−"}${Math.abs(Math.round(diff * 100))} %`
      : `${diff > 0 ? "+" : "−"}${Math.abs(Math.round(diff)).toLocaleString("fr-FR")} €`;
  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap text-[12px] font-medium"
      style={{ color: good == null ? "var(--chalk-3)" : good ? "var(--keep)" : "var(--cut)" }}
    >
      <Icon className="size-3.5" aria-hidden />
      {flat ? "stable" : text}
    </span>
  );
}

/** Tuile de chiffre clé : libellé, grand chiffre, comparaison, contexte, et éventuellement une mini-courbe. */
export function Kpi({
  label,
  value,
  tone,
  delta,
  context,
  chart,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  delta?: ReactNode;
  context?: ReactNode;
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex min-w-0 flex-col justify-between gap-3 rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-3.5 sm:p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="eyebrow">{label}</span>
        {delta}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="figure truncate text-[24px] sm:text-[30px]" style={{ color: tone ?? "var(--chalk-1)" }}>
          {value}
        </div>
        {chart ? <div className="hidden sm:block">{chart}</div> : null}
      </div>
      {context ? <div className="text-[12px] leading-4 text-chalk-3">{context}</div> : null}
    </div>
  );
}
