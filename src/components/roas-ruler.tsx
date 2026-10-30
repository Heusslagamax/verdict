import clsx from "clsx";
import { roas as fr, eur } from "@/lib/format";
import type { Thresholds, VerdictCode } from "@/lib/types";
import { VERDICT_STYLE } from "./ui";

export interface RulerPoint {
  id: string;
  name: string;
  roas: number | null;
  spend: number;
  purchases: number;
  code: VerdictCode | null;
}

/**
 * Élément signature : la règle ROAS. Les zones viennent des seuils de la boutique
 * (−20 %, BE, range target, au-delà du target). Chaque ad est un point placé à son ROAS,
 * dont la surface suit sa dépense. Les ads sans vente sont posées à 0.
 */
export function RoasRuler({ t, points, campaignRoas, onSelectHref }: { t: Thresholds; points: RulerPoint[]; campaignRoas: number | null; onSelectHref: (id: string) => string }) {
  const finite = points.map((p) => p.roas ?? 0);
  const max = Math.max(t.target * 1.45, Math.min(Math.max(...finite, 0) * 1.08, t.target * 2.2));
  const x = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const w = (a: number, b: number) => `${Math.max(0, ((Math.min(b, max) - a) / max) * 100)}%`;
  const maxSpend = Math.max(...points.map((p) => p.spend), 1);
  const shown = [...points].filter((p) => p.spend > 0).sort((a, b) => b.spend - a.spend);
  // Les ads sans vente forment un seul groupe à 0 plutôt qu'une pile illisible.
  const sold = shown.filter((p) => p.purchases > 0 && p.roas != null);
  const unsold = shown.filter((p) => !(p.purchases > 0 && p.roas != null));
  const unsoldSpend = unsold.reduce((a, p) => a + p.spend, 0);
  const labelled = new Set(sold.slice(0, 4).map((p) => p.id));
  const pos = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  // Étiquette ancrée à gauche ou à droite près des bords, centrée ailleurs.
  const anchor = (v: number) => (pos(v) < 8 ? "left-0" : pos(v) > 92 ? "right-0" : "left-1/2 -translate-x-1/2");

  const ticks: { v: number; label: string; strong?: boolean }[] = [
    { v: t.loss20, label: `−20 % ${fr(t.loss20)}` },
    { v: t.be, label: `BE ${fr(t.be)}`, strong: true },
    { v: t.targetLow, label: `${fr(t.targetLow)}` },
    { v: t.target, label: `target ${fr(t.target)}`, strong: true },
  ];

  return (
    <figure className="select-none" aria-label="Règle ROAS des ads de la campagne">
      <div className="relative h-[112px]">
        {/* Bande des zones */}
        <div className="absolute inset-x-0 top-[52px] h-3 overflow-hidden rounded-[4px] bg-ink-3">
          <div className="absolute inset-y-0" style={{ left: 0, width: w(0, t.loss20), background: "var(--zone-loss)" }} />
          <div className="absolute inset-y-0" style={{ left: x(t.loss20), width: w(t.loss20, t.be), background: "var(--zone-thin)" }} />
          <div className="absolute inset-y-0" style={{ left: x(t.targetLow), width: w(t.targetLow, t.target), background: "var(--zone-range)" }} />
          <div className="absolute inset-y-0" style={{ left: x(t.target), width: w(t.target, max), background: "var(--zone-jump)" }} />
        </div>

        {/* Repères */}
        {ticks.map((tk) => (
          <div key={tk.label} className="absolute top-[44px] h-7" style={{ left: x(tk.v) }}>
            <div className={clsx("h-full w-px", tk.strong ? "bg-chalk-2" : "bg-rule-3")} />
            <div className={clsx("num absolute top-9 -translate-x-1/2 whitespace-nowrap text-[11px]", tk.strong ? "text-chalk-2" : "hidden text-chalk-3 sm:block")}>
              {tk.label}
            </div>
          </div>
        ))}

        {/* ROAS de la campagne */}
        {campaignRoas != null ? (
          <div className="absolute top-[36px] h-11" style={{ left: x(campaignRoas) }}>
            <div className="h-full w-0.5 rounded bg-signal" />
          </div>
        ) : null}

        {/* Ads vendeuses */}
        {sold.map((p, i) => {
          const size = 8 + Math.sqrt(p.spend / maxSpend) * 20;
          const color = p.code ? VERDICT_STYLE[p.code].fg : "var(--chalk-2)";
          const above = i % 2 === 0;
          return (
            <a
              key={p.id}
              href={onSelectHref(p.id)}
              title={`${p.name} · ROAS ${fr(p.roas)} · ${eur(p.spend)}`}
              className="group absolute top-[58px] -translate-x-1/2 -translate-y-1/2"
              style={{ left: x(p.roas ?? 0) }}
            >
              <span
                className="block rounded-full ring-2 ring-ink-1 transition-transform duration-150 group-hover:scale-110"
                style={{ width: size, height: size, background: color, opacity: 0.92 }}
              />
              {labelled.has(p.id) ? (
                <span
                  className={clsx(
                    "num absolute hidden whitespace-nowrap text-[11px] text-chalk-2 group-hover:text-chalk-1 sm:block",
                    anchor(p.roas ?? 0),
                    above ? "-top-6" : "top-[calc(100%+30px)]",
                  )}
                >
                  {truncate(p.name, 18)}
                </span>
              ) : null}
            </a>
          );
        })}

        {/* Groupe des ads sans vente, posé à 0 */}
        {unsold.length ? (
          <div
            className="absolute top-[58px] -translate-y-1/2"
            style={{ left: 0 }}
            title={unsold.map((p) => `${p.name} · ${eur(p.spend)}`).join("\n")}
          >
            <span
              className="block rounded-full border-2 border-dashed border-chalk-3 bg-ink-1"
              style={{ width: 8 + Math.sqrt(unsoldSpend / maxSpend) * 20, height: 8 + Math.sqrt(unsoldSpend / maxSpend) * 20 }}
            />
            <span className="num absolute -top-6 left-0 whitespace-nowrap text-[11px] text-chalk-3">
              {unsold.length} sans vente<span className="hidden sm:inline"> · {eur(unsoldSpend, 0)}</span>
            </span>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-chalk-3">
        {campaignRoas != null ? (
          <span className="text-signal">
            Trait bleu = ROAS de la campagne <span className="num">{fr(campaignRoas)}</span>
          </span>
        ) : null}
        <span>Taille du point = dépense sur la période</span>
        <span>Cercle pointillé à 0 = ads sans vente, regroupées</span>
        <span>Zones : perte au-delà de −20 % · sous le BE · range target · au-dessus du target</span>
      </figcaption>
    </figure>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
