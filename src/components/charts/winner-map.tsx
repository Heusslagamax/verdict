"use client";

import { useState } from "react";
import type { CompetitorAdView } from "@/lib/data/views";
import { compact } from "@/lib/format";
import { useWidth } from "./shared";

const M = { left: 44, right: 14, top: 14, bottom: 34 };
const HEIGHT = 280;
/** Seuil « validée » du moteur concurrents : 14 jours de diffusion. */
const VALIDATED_DAYS = 14;

/**
 * La carte des winners : durée de diffusion × portée. Une créa qui tourne longtemps et
 * touche beaucoup de monde est une créa qui rapporte au concurrent — les données plutôt que
 * la théorie. Mise en avant : les créas à récupérer (accent), le reste en gris ; les coupées
 * en carré creux.
 */
export function WinnerMap({ ads }: { ads: CompetitorAdView[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const pts = ads.filter((a) => a.daysRunning != null && a.reach != null && a.reach > 0);
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const xMax = Math.max(30, ...pts.map((a) => a.daysRunning! * 1.08));
  const reachMax = Math.max(10_000, ...pts.map((a) => a.reach!));
  const lo = 3; // 1 000
  const hi = Math.max(5, Math.ceil(Math.log10(reachMax)));
  const x = (d: number) => M.left + (d / xMax) * plotW;
  const y = (r: number) => M.top + plotH - ((Math.log10(Math.max(r, 10 ** lo)) - lo) / (hi - lo)) * plotH;
  const midReach = 10 ** ((lo + hi) / 2);

  const order = [...pts].sort((a, b) => Number(a.read.recoverable) - Number(b.read.recoverable));
  const h = pts.find((a) => a.id === hover) ?? null;

  return (
    <div ref={ref} className="relative" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="Créas concurrentes selon leur durée de diffusion et leur portée" className="block">
          <rect x={x(VALIDATED_DAYS)} y={M.top} width={M.left + plotW - x(VALIDATED_DAYS)} height={y(midReach) - M.top} fill="var(--zone-range)" />
          {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((p) => (
            <g key={p}>
              <line x1={M.left} x2={M.left + plotW} y1={y(10 ** p)} y2={y(10 ** p)} stroke="var(--rule-1)" />
              <text x={M.left - 8} y={y(10 ** p) + 4} textAnchor="end" className="num fill-chalk-4 text-[10px]">
                {compact(10 ** p)}
              </text>
            </g>
          ))}
          <line x1={x(VALIDATED_DAYS)} x2={x(VALIDATED_DAYS)} y1={M.top} y2={M.top + plotH} stroke="var(--rule-3)" />
          <text x={x(VALIDATED_DAYS) + 6} y={M.top + plotH - 6} className="fill-chalk-4 text-[10px]">
            validée ≥ 14 j
          </text>
          <text x={M.left + plotW - 8} y={M.top + 14} textAnchor="end" className="eyebrow fill-chalk-4 text-[10px]">
            Winners
          </text>
          <text x={M.left + 8} y={M.top + 14} className="eyebrow fill-chalk-4 text-[10px]">
            Tests qui percent
          </text>
          <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} stroke="var(--rule-2)" />
          {[0, 7, 14, 21, 30, 45, 60, 90, 120].filter((d) => d <= xMax).map((d) => (
            <text key={d} x={x(d)} y={HEIGHT - 16} textAnchor="middle" className="num fill-chalk-4 text-[10px]">
              {d} j
            </text>
          ))}
          <text x={M.left + plotW} y={HEIGHT - 2} textAnchor="end" className="fill-chalk-3 text-[10.5px]">
            jours de diffusion →
          </text>
          <text x={M.left} y={M.top - 4} className="fill-chalk-3 text-[10.5px]">
            ↑ portée
          </text>

          {order.map((a) => {
            const cx = x(a.daysRunning!);
            const cy = y(a.reach!);
            const cut = a.read.signals.includes("coupee");
            const on = hover === a.id;
            const color = a.read.recoverable ? "var(--signal)" : "var(--chalk-4)";
            return (
              <g key={a.id} onPointerEnter={() => setHover(a.id)} onPointerLeave={() => setHover(null)}>
                <circle cx={cx} cy={cy} r={13} fill="transparent" />
                {cut ? (
                  <rect x={cx - 5} y={cy - 5} width={10} height={10} rx={2} fill="var(--ink-1)" stroke="var(--cut)" strokeWidth={2} />
                ) : (
                  <circle cx={cx} cy={cy} r={on ? 7 : 5.5} fill={color} stroke="var(--ink-1)" strokeWidth={2} />
                )}
              </g>
            );
          })}
        </svg>
      ) : null}
      {h ? (
        <div
          className="pointer-events-none absolute z-10 w-[240px] rounded-[var(--radius-m)] border border-rule-2 bg-ink-3 p-3 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          style={{ left: Math.min(x(h.daysRunning!) + 14, width - 248), top: Math.max(4, y(h.reach!) - 40) }}
        >
          <div className="font-medium text-chalk-1">{h.competitorName}</div>
          <p className="mt-1 line-clamp-3 text-chalk-2">{h.transcript ?? h.body ?? "Sans texte"}</p>
          <div className="num mt-1.5 text-chalk-3">
            {h.daysRunning} j · portée {compact(h.reach)}
            {h.currentRank != null ? ` · rang #${h.currentRank}` : ""}
          </div>
          <div className="mt-1 text-chalk-3">{h.read.recoverable ? "À récupérer" : h.read.signals.includes("coupee") ? "Coupée" : h.read.recoverReason}</div>
        </div>
      ) : null}
    </div>
  );
}
