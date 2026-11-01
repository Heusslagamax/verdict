import type { AdsetView } from "@/lib/data/views";
import type { Thresholds } from "@/lib/types";
import { eur, pct, roas as fmtRoas } from "@/lib/format";
import { roasCeiling, zoneOf } from "@/lib/zones";
import { Delta, RoasGauge, Sparkline, VerdictMix } from "@/components/charts/mini";
import { VERDICT_STYLE } from "@/components/ui";

/** Santé de chaque adset en une ligne : part du budget, ROAS sur le couloir, tendance, verdicts de ses pubs. */
export function AdsetHealth({ adsets, t, windowDays }: { adsets: AdsetView[]; t: Thresholds | null; windowDays: number }) {
  const ceil = t ? roasCeiling(t, adsets.map((s) => s.totals.roas)) : 0;
  return (
    <ul className="divide-y divide-rule-1">
      {adsets.map((s) => {
        const z = t ? zoneOf(s.totals.roas, t) : null;
        const n = s.ads.length;
        return (
          <li key={s.id} className="grid grid-cols-1 gap-3 py-3.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: z?.color ?? "var(--chalk-4)" }} />
                <span className="truncate text-[14px] font-medium">{s.name}</span>
              </div>
              <div className="mt-1 text-[12px] text-chalk-3">
                {n} pub{n > 1 ? "s" : ""} · <span className="num">{eur(s.totals.spend, 0)}</span> · {pct(s.share)} du budget
              </div>
              <VerdictMix counts={s.counts} className="mt-2 max-w-[260px]" />
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-chalk-3">
                {(["cut", "iterate", "keep", "watch", "wait"] as const)
                  .filter((c) => s.counts[c])
                  .map((c) => (
                    <span key={c} className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full" style={{ background: VERDICT_STYLE[c].fg }} />
                      {s.counts[c]} {VERDICT_STYLE[c].label.toLowerCase()}
                    </span>
                  ))}
              </div>
            </div>
            {t ? (
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px]" style={{ color: z?.color ?? "var(--chalk-3)" }}>
                    {z?.label ?? "Pas de vente"}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <Delta now={s.totals.roas} prev={s.prev.roas} quiet />
                    <span className="figure text-[20px]">{fmtRoas(s.totals.roas)}</span>
                  </span>
                </div>
                <RoasGauge value={s.totals.roas} prev={s.prev.roas} t={t} ceil={ceil} className="mt-1.5" />
              </div>
            ) : (
              <div />
            )}
            <div className="hidden md:block">
              <Sparkline values={s.trend.map((d) => d.roas)} t={t} windowDays={windowDays} width={128} height={36} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
