import { ArrowDownRight, ArrowUpRight, Hourglass, Pause, Wrench, X } from "lucide-react";
import type { CampaignDecision, CampaignActionCode, Thresholds, VerdictCode } from "@/lib/types";
import { eur, roas as fmtRoas } from "@/lib/format";
import { roasCeiling, zoneOf } from "@/lib/zones";
import { VERDICT_STYLE } from "@/components/ui";
import { RoasGauge } from "@/components/charts/mini";
import { PalierTrack } from "@/components/palier-track";

const TONE: Record<CampaignActionCode, VerdictCode> = {
  augmenter: "keep",
  scaling: "keep",
  continuer: "wait",
  ne_pas_toucher: "wait",
  optimisation: "watch",
  plancher: "watch",
  descaler: "watch",
  couper: "cut",
};

const ICON = {
  augmenter: ArrowUpRight,
  scaling: ArrowUpRight,
  descaler: ArrowDownRight,
  couper: X,
  continuer: Hourglass,
  ne_pas_toucher: Pause,
  optimisation: Wrench,
  plancher: Wrench,
} satisfies Record<CampaignActionCode, unknown>;

/** La décision du moteur, dite comme un ordre : un verbe, un montant. */
export function headline(d: CampaignDecision): string {
  const to = d.nextBudget != null ? `${eur(d.nextBudget, 0)}/jour` : "";
  switch (d.action) {
    case "augmenter":
      return to ? `Monter à ${to}` : d.label;
    case "scaling":
      return to ? `Passer en scaling à ${to}` : "Passer en scaling";
    case "descaler":
      return to ? `Redescendre à ${to}` : "Redescendre d'un palier";
    case "couper":
      return "Couper la campagne";
    case "continuer":
      return "Laisser tourner";
    case "ne_pas_toucher":
      return d.label === "Données insuffisantes" ? "Attendre plus de données" : "Ne pas toucher au budget";
    case "plancher":
      return "Plancher atteint : optimiser";
    case "optimisation":
      return "Passer en optimisation";
  }
}

/**
 * Le point focal de l'écran : ce que le moteur Zecom dit de faire aujourd'hui, pourquoi,
 * et où en est la santé de la campagne sur le couloir ROAS.
 */
export function DecisionCard({
  d,
  t,
  budget,
  pnlError,
}: {
  d: CampaignDecision | null;
  t: Thresholds | null;
  budget: number | null;
  pnlError: string | null;
}) {
  if (!d || !t) {
    return (
      <div className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
        <span className="eyebrow">Décision du jour</span>
        <p className="mt-3 text-[15px] text-watch">Renseigne les seuils de cette boutique dans Réglages pour obtenir la décision.</p>
      </div>
    );
  }
  const tone = VERDICT_STYLE[TONE[d.action]];
  const Icon = ICON[d.action];
  const health = d.roas3d ?? d.roasYesterday;
  const zone = zoneOf(health, t);
  const ceil = roasCeiling(t, [d.roas3d, d.roasYesterday]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-[var(--radius-l)] border border-rule-1 bg-ink-1">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone.fg }} />
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Décision du jour</span>
          <span className="text-[11px] text-chalk-4">{d.source}</span>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px]" style={{ background: tone.bg, color: tone.fg }}>
            <Icon className="size-5" aria-hidden />
          </span>
          <h3 className="figure text-[28px] leading-[34px] sm:text-[32px] sm:leading-[38px]" style={{ color: "var(--chalk-1)" }}>
            {headline(d)}
          </h3>
        </div>
        <p className="mt-3 max-w-[60ch] text-[14px] leading-[22px] text-chalk-2">{d.rule}</p>
      </div>

      <div className="mt-auto grid gap-4 border-t border-rule-1 p-5 pt-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-chalk-3">
              Santé · ROAS {d.roas3d != null ? "3 jours" : "d'hier"} {d.roasSource === "pnl" ? "du P&L" : "Meta"}
            </span>
            <span className="flex items-center gap-2">
              {zone ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: zone.color }}>
                  <span className="size-2 rounded-full" style={{ background: zone.color }} />
                  {zone.label}
                </span>
              ) : null}
              <span className="figure text-[22px]">{fmtRoas(health)}</span>
            </span>
          </div>
          <RoasGauge value={health} prev={d.roas3d != null ? d.roasYesterday : null} t={t} ceil={ceil} className="mt-2" height={10} />
          <div className="mt-1.5 flex justify-between text-[11px] text-chalk-4">
            <span className="num">BE {fmtRoas(t.be)}</span>
            <span className="num">range {fmtRoas(t.targetLow)} – {fmtRoas(t.target)}</span>
          </div>
          {d.roas3d != null && d.roasYesterday != null ? (
            <p className="mt-1 text-[11px] text-chalk-4">Aiguille : 3 jours · rond creux : hier ({fmtRoas(d.roasYesterday)})</p>
          ) : null}
          {d.roasSource === "meta" ? (
            <p className="mt-1 text-[11px] text-watch">{pnlError ? `P&L illisible (${pnlError}) : ROAS Meta utilisé.` : "P&L non branché : ROAS Meta utilisé."}</p>
          ) : null}
        </div>
        <div>
          <span className="text-[12px] text-chalk-3">Paliers · budget actuel {budget != null ? eur(budget, 0) : "non lu"}</span>
          <PalierTrack current={budget} next={d.nextBudget} />
        </div>
      </div>
    </div>
  );
}
