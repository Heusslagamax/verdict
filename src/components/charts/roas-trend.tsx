"use client";

import { useState } from "react";
import type { Thresholds } from "@/lib/types";
import { eur, int, roas as fmtRoas } from "@/lib/format";
import { ZONES, zoneBounds, zoneOf, roasCeiling } from "@/lib/zones";
import { dayLabel, linePath, longDay, ticks, useWidth } from "./shared";

export interface TrendPoint {
  date: string;
  roas: number | null;
  pnlRoas: number | null;
  spend: number;
  purchases: number;
}

const M = { left: 34, right: 78, top: 10 };
const ROAS_H = 196;
const GAP = 22;
const SPEND_H = 62;
const AXIS_H = 22;
const HEIGHT = M.top + ROAS_H + GAP + SPEND_H + AXIS_H;

/**
 * Le ROAS jour par jour posé sur le couloir des seuils, et la dépense du jour en dessous,
 * sur le même axe de temps (deux graphiques, jamais deux échelles sur un même tracé).
 */
export function RoasTrend({
  points,
  t,
  budget,
  windowDays,
  showPnl,
}: {
  points: TrendPoint[];
  t: Thresholds;
  budget: number | null;
  windowDays: number;
  showPnl: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const band = n ? plotW / n : 0;
  const cx = (i: number) => M.left + band * i + band / 2;

  const ceil = roasCeiling(t, [...points.map((p) => p.roas), ...points.map((p) => (showPnl ? p.pnlRoas : null))]);
  const yR = (v: number) => M.top + ROAS_H - (Math.min(v, ceil) / ceil) * ROAS_H;
  const spendMax = Math.max(1, budget ?? 0, ...points.map((p) => p.spend)) * 1.1;
  const spendTop = M.top + ROAS_H + GAP;
  const yS = (v: number) => spendTop + SPEND_H - (v / spendMax) * SPEND_H;
  const barW = Math.min(24, Math.max(4, band * 0.56));

  const metaPath = linePath(points.map((p, i) => (p.roas == null ? null : { x: cx(i), y: yR(p.roas) })));
  const pnlPath = showPnl ? linePath(points.map((p, i) => (p.pnlRoas == null ? null : { x: cx(i), y: yR(p.pnlRoas) })) ) : "";
  const lastMeta = [...points.keys()].reverse().find((i) => points[i].roas != null);
  const lastPnl = showPnl ? [...points.keys()].reverse().find((i) => points[i].pnlRoas != null) : undefined;
  const winStart = M.left + band * Math.max(0, n - windowDays);
  const labelEvery = band < 34 ? 3 : band < 52 ? 2 : 1;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left) / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  const h = hover != null ? points[hover] : null;
  const hz = h ? zoneOf(h.roas, t) : null;

  return (
    <div ref={ref} className="relative" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="ROAS et dépense jour par jour sur 14 jours" className="block">
          {/* Couloir des seuils */}
          {zoneBounds(t).map((z) => {
            const top = yR(Math.min(z.to, ceil));
            const bottom = yR(Math.min(z.from, ceil));
            if (bottom - top <= 0) return null;
            return <rect key={z.code} x={M.left} y={top} width={plotW} height={bottom - top} fill={ZONES[z.code].wash} />;
          })}
          {/* Période sélectionnée */}
          <rect x={winStart} y={M.top} width={M.left + plotW - winStart} height={ROAS_H} fill="rgba(148,170,210,0.05)" />
          <rect x={winStart} y={spendTop} width={M.left + plotW - winStart} height={SPEND_H} fill="rgba(148,170,210,0.05)" />

          {/* Graduations ROAS */}
          {ticks(ceil, 4).map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + plotW} y1={yR(v)} y2={yR(v)} stroke="var(--rule-1)" />
              <text x={M.left - 8} y={yR(v) + 4} textAnchor="end" className="num fill-chalk-4 text-[10px]">
                {v.toLocaleString("fr-FR")}
              </text>
            </g>
          ))}

          {/* Seuils nommés, étiquetés à droite */}
          {[
            { v: t.target, label: "Target", color: "var(--keep)" },
            { v: t.be, label: "BE", color: "var(--watch)" },
            { v: t.loss20, label: "−20 %", color: "var(--cut)" },
          ]
            .filter((l) => l.v < ceil)
            .map((l) => (
              <g key={l.label}>
                <line x1={M.left} x2={M.left + plotW + 6} y1={yR(l.v)} y2={yR(l.v)} stroke={l.color} strokeOpacity={0.55} />
                <text x={M.left + plotW + 10} y={yR(l.v) + 4} className="num text-[10.5px]" fill="var(--chalk-2)">
                  {l.label} {fmtRoas(l.v)}
                </text>
              </g>
            ))}

          {/* Courbes */}
          {pnlPath ? <path d={pnlPath} fill="none" stroke="var(--pnl)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
          <path d={metaPath} fill="none" stroke="var(--signal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) =>
            p.roas == null ? null : (
              <circle key={i} cx={cx(i)} cy={yR(p.roas)} r={i === lastMeta ? 4.5 : 2.5} fill="var(--signal)" stroke="var(--ink-1)" strokeWidth={2} />
            ),
          )}
          {lastPnl != null && points[lastPnl].pnlRoas != null ? (
            <circle cx={cx(lastPnl)} cy={yR(points[lastPnl].pnlRoas!)} r={4.5} fill="var(--pnl)" stroke="var(--ink-1)" strokeWidth={2} />
          ) : null}

          {/* Dépense du jour */}
          <line x1={M.left} x2={M.left + plotW} y1={spendTop + SPEND_H} y2={spendTop + SPEND_H} stroke="var(--rule-2)" />
          {points.map((p, i) => {
            if (p.spend <= 0) return null;
            const y = yS(p.spend);
            const hgt = spendTop + SPEND_H - y;
            const inWin = i >= n - windowDays;
            const r = Math.min(4, hgt, barW / 2);
            const x = cx(i) - barW / 2;
            return (
              <path
                key={i}
                d={`M${x},${spendTop + SPEND_H}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${spendTop + SPEND_H}Z`}
                fill={inWin ? "var(--chalk-3)" : "var(--ink-4)"}
              />
            );
          })}
          {budget ? (
            <g>
              <line x1={M.left} x2={M.left + plotW + 6} y1={yS(budget)} y2={yS(budget)} stroke="var(--chalk-3)" strokeOpacity={0.6} />
              <text x={M.left + plotW + 10} y={yS(budget) + 4} className="num text-[10.5px]" fill="var(--chalk-2)">
                {eur(budget, 0)}/j
              </text>
            </g>
          ) : null}
          <text x={M.left - 8} y={spendTop + 10} textAnchor="end" className="fill-chalk-4 text-[10px]">
            €
          </text>

          {/* Jours */}
          {points.map((p, i) =>
            (n - 1 - i) % labelEvery === 0 ? (
              <text key={p.date} x={cx(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-chalk-3 text-[10.5px]">
                {dayLabel(p.date)}
              </text>
            ) : null,
          )}

          {/* Survol */}
          {hover != null ? (
            <line x1={cx(hover)} x2={cx(hover)} y1={M.top} y2={spendTop + SPEND_H} stroke="var(--chalk-3)" strokeOpacity={0.5} />
          ) : null}
          <rect
            x={M.left}
            y={M.top}
            width={plotW}
            height={ROAS_H + GAP + SPEND_H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      ) : null}

      {h && hover != null ? (
        <div
          className="pointer-events-none absolute z-10 w-[208px] rounded-[var(--radius-m)] border border-rule-2 bg-ink-3 p-3 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          style={{ left: Math.min(Math.max(cx(hover) + 12, 0), width - 216), top: 8 }}
        >
          <div className="font-medium capitalize text-chalk-1">{longDay(h.date)}</div>
          <dl className="mt-2 space-y-1">
            <Row swatch="var(--signal)" k="ROAS Meta" v={fmtRoas(h.roas)} />
            {showPnl ? <Row swatch="var(--pnl)" k="ROAS P&L" v={fmtRoas(h.pnlRoas)} /> : null}
            <Row k="Dépense" v={eur(h.spend, 0)} />
            <Row k="Achats" v={int(h.purchases)} />
          </dl>
          {hz ? (
            <div className="mt-2 flex items-center gap-1.5 border-t border-rule-1 pt-2 text-chalk-2">
              <span className="size-2 rounded-full" style={{ background: hz.color }} />
              {hz.label}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ k, v, swatch }: { k: string; v: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-chalk-3">
        {swatch ? <span className="h-0.5 w-3 rounded-full" style={{ background: swatch }} /> : null}
        {k}
      </dt>
      <dd className="num text-chalk-1">{v}</dd>
    </div>
  );
}
