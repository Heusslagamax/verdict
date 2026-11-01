import type { CampaignView, CompetitorAdLite, PnlView } from "@/lib/data/views";
import type { Thresholds, Window } from "@/lib/types";
import { WINDOW_DAYS } from "@/lib/engine/metrics";
import { eur, int, pct, roas as fmtRoas, WINDOW_LABEL } from "@/lib/format";
import { zoneOf } from "@/lib/zones";
import { RoasTrend } from "@/components/charts/roas-trend";
import { DecisionMatrix, Glyph } from "@/components/charts/decision-matrix";
import { Delta, Kpi, Sparkline } from "@/components/charts/mini";
import { VERDICT_STYLE } from "@/components/ui";
import { DecisionCard } from "./decision-card";
import { AdsetHealth } from "./adset-health";
import { TodoList } from "./todo-list";
import { AdHealthList } from "./ad-health-list";

/**
 * Une campagne, lue de haut en bas comme un pilote lit son tableau de bord :
 * 1. la décision du jour et 4 chiffres clés ; 2. deux graphiques pour comprendre pourquoi ;
 * 3. quoi faire, et la santé de chaque adset ; 4. le détail pub par pub.
 */
export function CampaignBoard({
  c,
  t,
  window,
  shopSlug,
  pnl,
  competitorAds,
}: {
  c: CampaignView;
  competitorAds: CompetitorAdLite[];
  t: Thresholds | null;
  window: Window;
  shopSlug: string;
  pnl: PnlView | null;
}) {
  const ads = c.adsets.flatMap((s) => s.ads);
  const wd = WINDOW_DAYS[window];
  const wl = WINDOW_LABEL[window].toLowerCase();
  const zone = t ? zoneOf(c.totals.roas, t) : null;
  const pnlByDate = new Map((pnl?.days ?? []).map((d) => [d.date, d.roas]));
  const showPnl = Boolean(pnl && !pnl.error && pnl.days.some((d) => d.roas != null));

  // Titres-constats : un graphique dit ce qu'il montre.
  const daysUnderBe = t ? c.series.slice(-wd).filter((d) => d.roas != null && d.roas < t.be).length : 0;
  const trendTitle =
    c.totals.roas == null
      ? "Aucune vente sur la période"
      : `ROAS ${wl} : ${fmtRoas(c.totals.roas)}${zone ? `, ${zone.short}` : ""}`;
  const trendSub = t
    ? daysUnderBe
      ? `${daysUnderBe} jour${daysUnderBe > 1 ? "s" : ""} sur ${wd} sous le break-even (${fmtRoas(t.be)}).`
      : `Aucun jour sous le break-even (${fmtRoas(t.be)}) sur la période.`
    : "";
  const bySpend = [...ads].sort((a, b) => b.share - a.share);
  const top2 = bySpend.slice(0, 2).reduce((a, x) => a + x.share, 0);
  const leaks = ads.filter((a) => t && a.share >= 0.3 && (a.totals.roas ?? 0) < t.be);
  const matrixTitle = leaks.length
    ? `${leaks.length} pub${leaks.length > 1 ? "s" : ""} prend${leaks.length > 1 ? "nent" : ""} 30 % du budget sous le BE`
    : bySpend.length > 1
      ? `Les 2 premières pubs prennent ${pct(top2)} du budget`
      : "Répartition du budget";

  const profitTone = c.profit == null ? undefined : c.profit >= 0 ? "var(--keep)" : "var(--cut)";
  const budgetUse = c.dailyBudget ? c.totals.spend / (c.dailyBudget * wd) : null;

  return (
    <section className="space-y-4" aria-labelledby={`c-${c.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`c-${c.id}`} className="truncate text-[19px] font-semibold tracking-[-0.02em]">
          {c.name}
        </h2>
        <p className="text-[12px] text-chalk-3">
          CBO · {c.dailyBudget != null ? `${eur(c.dailyBudget, 0)}/jour` : "budget non lu"} · {c.adsets.length} adset{c.adsets.length > 1 ? "s" : ""} ·{" "}
          {ads.length} pubs · {eur(c.lifetimeSpend, 0)} depuis le lancement
        </p>
      </header>

      {/* 1. Décision + chiffres clés */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <DecisionCard d={c.decision} t={t} budget={c.dailyBudget} pnlError={pnl?.error ?? null} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Kpi
            label={`ROAS Meta · ${wl}`}
            value={fmtRoas(c.totals.roas)}
            tone={zone?.color}
            delta={<Delta now={c.totals.roas} prev={c.prev.roas} />}
            chart={<Sparkline values={c.series.map((d) => d.roas)} t={t} windowDays={wd} width={104} height={34} />}
            context={
              t ? (
                <>
                  {zone ? <span style={{ color: zone.color }}>{zone.label}</span> : "Pas de vente"} · BE {fmtRoas(t.be)} · target {fmtRoas(t.target)}
                </>
              ) : (
                "Seuils manquants"
              )
            }
          />
          <Kpi
            label={`Résultat estimé · ${wl}`}
            value={c.profit == null ? "—" : `${c.profit >= 0 ? "+" : "−"}${eur(Math.abs(c.profit), 0)}`}
            tone={profitTone}
            delta={<Delta now={c.profit} prev={c.prevProfit} kind="abs" />}
            context={<>CA Meta {eur(c.totals.value, 0)} × marge avant pub − dépense. Avant frais fixes.</>}
          />
          <Kpi
            label={`Dépense · ${wl}`}
            value={eur(c.totals.spend, 0)}
            delta={<Delta now={c.totals.spend} prev={c.prev.spend} goodWhenUp={c.totals.roas != null && t != null && c.totals.roas >= t.be} />}
            chart={<SpendBars values={c.series.map((d) => d.spend)} windowDays={wd} />}
            context={budgetUse != null ? `${pct(budgetUse)} du budget prévu (${eur(c.dailyBudget! * wd, 0)})` : "Budget non lu"}
          />
          <Kpi
            label={`Achats · ${wl}`}
            value={int(c.totals.purchases)}
            delta={<Delta now={c.totals.purchases} prev={c.prev.purchases} />}
            context={
              <>
                CPA {eur(c.totals.cpa, 0)} · coût/ajout panier{" "}
                <span style={{ color: t && c.totals.costPerAtc != null && c.totals.costPerAtc > t.atcTarget ? "var(--cut)" : undefined }}>
                  {eur(c.totals.costPerAtc)}
                </span>
                {t ? ` (cible ${eur(t.atcTarget, 0)})` : ""}
              </>
            }
          />
        </div>
      </div>

      {/* 2. Comprendre : la tendance et le terrain */}
      {t ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold">{trendTitle}</h3>
                <p className="mt-0.5 text-[12px] text-chalk-3">{trendSub}</p>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-chalk-2">
                <li className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full bg-signal" /> ROAS Meta (campagne)
                </li>
                {showPnl ? (
                  <li className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full bg-pnl" /> ROAS P&amp;L (boutique)
                  </li>
                ) : null}
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2 rounded-[2px] bg-chalk-3" /> Dépense du jour
                </li>
              </ul>
            </div>
            <div className="mt-4">
              <RoasTrend
                points={c.series.map((d) => ({ date: d.date, roas: d.roas, pnlRoas: pnlByDate.get(d.date) ?? null, spend: d.spend, purchases: d.purchases }))}
                t={t}
                budget={c.dailyBudget}
                windowDays={wd}
                showPnl={showPnl}
              />
            </div>
            <ZoneLegend />
          </div>

          <div className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
            <h3 className="text-[15px] font-semibold">{matrixTitle}</h3>
            <p className="mt-0.5 text-[12px] text-chalk-3">
              Chaque pub selon sa part du budget et son ROAS ({wl}). En bas à droite : ce que Meta finance à perte.
            </p>
            <div className="mt-4">
              <DecisionMatrix
                t={t}
                ads={ads.map((a) => ({
                  id: a.id,
                  name: a.name,
                  share: a.share,
                  roas: a.totals.roas,
                  spend: a.totals.spend,
                  purchases: a.totals.purchases,
                  code: a.verdict?.code ?? null,
                }))}
              />
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-chalk-2">
              {(["cut", "iterate", "keep", "watch", "wait"] as const).map((code) => (
                <li key={code} className="flex items-center gap-1.5">
                  <svg width={14} height={14} aria-hidden>
                    <Glyph code={code} cx={7} cy={7} size={5} />
                  </svg>
                  {VERDICT_STYLE[code].label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* 3. Agir : la liste du jour et la santé des adsets */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
          <h3 className="text-[15px] font-semibold">À faire aujourd&apos;hui</h3>
          <p className="mb-4 mt-0.5 text-[12px] text-chalk-3">Les verdicts du moteur, les plus urgents d&apos;abord. Clique une pub pour la voir.</p>
          <TodoList ads={ads} />
        </div>
        <div className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
          <h3 className="text-[15px] font-semibold">
            Santé des adsets <span className="num text-[13px] font-normal text-chalk-3">{c.adsets.length}</span>
          </h3>
          <p className="mt-0.5 text-[12px] text-chalk-3">ROAS {wl} sur le couloir (rond creux : période précédente) et verdicts de leurs pubs.</p>
          <div className="mt-2">
            <AdsetHealth adsets={c.adsets} t={t} windowDays={wd} />
          </div>
        </div>
      </div>

      {/* 4. Détail pub par pub */}
      <div className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
        <h3 className="text-[15px] font-semibold">
          Santé pub par pub <span className="num text-[13px] font-normal text-chalk-3">{ads.length}</span>
        </h3>
        <p className="mb-4 mt-0.5 text-[12px] text-chalk-3">
          Aiguille : ROAS {wl}. Rond creux : période précédente. Les jauges partagent la même échelle, elles se comparent d&apos;une ligne à l&apos;autre.
        </p>
        <AdHealthList ads={ads} thresholds={t} shopSlug={shopSlug} campaignId={c.id} windowDays={wd} competitorAds={competitorAds} />
      </div>
    </section>
  );
}

function ZoneLegend() {
  const items = [
    { label: "Perte forte (< −20 %)", color: "var(--cut)" },
    { label: "Sous le BE", color: "var(--watch)" },
    { label: "Rentable, mince", color: "var(--chalk-3)" },
    { label: "Range target", color: "var(--keep)" },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule-1 pt-3 text-[11px] text-chalk-3">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: i.color, opacity: 0.7 }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function SpendBars({ values, windowDays }: { values: number[]; windowDays: number }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  return (
    <svg width={104} height={34} aria-hidden className="block">
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / max) * 32);
        return (
          <rect
            key={i}
            x={i * (104 / n) + 1}
            y={34 - h}
            width={104 / n - 2}
            height={h}
            rx={1.5}
            fill={i >= n - windowDays ? "var(--chalk-3)" : "var(--ink-4)"}
          />
        );
      })}
    </svg>
  );
}
