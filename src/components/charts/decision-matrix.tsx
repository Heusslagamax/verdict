"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Thresholds, VerdictCode } from "@/lib/types";
import { eur, pct, roas as fmtRoas } from "@/lib/format";
import { ZONES, zoneBounds, roasCeiling } from "@/lib/zones";
import { VERDICT_STYLE } from "@/components/ui";
import { ticks, useWidth } from "./shared";

export interface MatrixAd {
  id: string;
  name: string;
  share: number;
  roas: number | null;
  spend: number;
  purchases: number;
  code: VerdictCode | null;
}

const M = { left: 34, right: 14, top: 14, bottom: 34 };
const HEIGHT = 300;
/** Seuil Zecom du « milieu de terrain » : l'ad qui prend 30 % du budget porte la campagne. */
const MIDFIELD = 0.3;

/**
 * Le terrain : chaque pub placée selon sa part du budget (où Meta met l'argent) et son ROAS
 * (ce qu'elle rapporte). Les quatre coins se lisent sans légende : moteurs, attaquants,
 * fuite de budget, remplaçants. Forme + couleur du verdict, jamais la couleur seule.
 */
export function DecisionMatrix({ ads, t }: { ads: MatrixAd[]; t: Thresholds }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const plotted = ads.filter((a) => a.spend > 0);
  const silent = ads.length - plotted.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const xMax = Math.min(1, Math.max(0.5, ...plotted.map((a) => a.share * 1.15)));
  const ceil = roasCeiling(t, plotted.map((a) => a.roas));
  const x = (s: number) => M.left + (s / xMax) * plotW;
  // 12 px d'air sous le zéro : les pubs à ROAS 0 restent lisibles au-dessus de l'axe.
  const PAD = 12;
  const y = (r: number) => M.top + plotH - PAD - (Math.min(r, ceil) / ceil) * (plotH - PAD);
  const lowLabel = Math.min(y(t.be) + 16, M.top + plotH - 6);

  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("ad", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // Étiquettes directes, sélectives : les plus grosses parts et les pubs à couper, sans chevauchement.
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labelled = new Map<string, { x: number; anchor: "start" | "end" }>();
  [...plotted]
    .sort((a, b) => Number(b.code === "cut") - Number(a.code === "cut") || b.share - a.share)
    .slice(0, 5)
    .forEach((a) => {
      const px = x(a.share);
      const py = y(a.roas ?? 0);
      const w = Math.min(a.name.length, 18) * 6 + 8;
      const right = px + 10 + w < M.left + plotW;
      const b = right ? { x0: px + 8, x1: px + 10 + w, y0: py - 8, y1: py + 6 } : { x0: px - 10 - w, x1: px - 8, y0: py - 8, y1: py + 6 };
      if (boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) return;
      boxes.push(b);
      labelled.set(a.id, right ? { x: px + 10, anchor: "start" } : { x: px - 10, anchor: "end" });
    });

  const hovered = plotted.find((a) => a.id === hover) ?? null;
  const corner = "eyebrow fill-chalk-4 text-[10px] tracking-[0.06em]";

  return (
    <div ref={ref} className="relative" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="Part du budget et ROAS de chaque pub" className="block">
          {zoneBounds(t).map((z) => {
            const top = y(Math.min(z.to, ceil));
            const bottom = z.from === 0 ? M.top + plotH : y(Math.min(z.from, ceil));
            if (bottom - top <= 0) return null;
            return <rect key={z.code} x={M.left} y={top} width={plotW} height={bottom - top} fill={ZONES[z.code].wash} />;
          })}
          {ticks(ceil, 4).map((v) => (
            <text key={v} x={M.left - 8} y={y(v) + 4} textAnchor="end" className="num fill-chalk-4 text-[10px]">
              {v.toLocaleString("fr-FR")}
            </text>
          ))}
          <line x1={M.left} x2={M.left + plotW} y1={y(t.target)} y2={y(t.target)} stroke="var(--keep)" strokeOpacity={0.5} />
          <line x1={M.left} x2={M.left + plotW} y1={y(t.be)} y2={y(t.be)} stroke="var(--watch)" strokeOpacity={0.5} />
          {MIDFIELD < xMax ? (
            <line x1={x(MIDFIELD)} x2={x(MIDFIELD)} y1={M.top} y2={M.top + plotH} stroke="var(--rule-3)" />
          ) : null}
          <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} stroke="var(--rule-2)" />

          {/* Les quatre coins */}
          <text x={M.left + 8} y={M.top + 14} className={corner}>Attaquants</text>
          <text x={M.left + plotW - 8} y={M.top + 14} textAnchor="end" className={corner}>Moteurs</text>
          <text x={M.left + 8} y={lowLabel} className={corner}>Remplaçants</text>
          <text x={M.left + plotW - 8} y={lowLabel} textAnchor="end" className={corner}>Fuite de budget</text>

          {/* Axe des parts */}
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].filter((v) => v <= xMax + 1e-9).map((v) => (
            <text key={v} x={x(v)} y={HEIGHT - 16} textAnchor="middle" className="num fill-chalk-4 text-[10px]">
              {Math.round(v * 100)} %
            </text>
          ))}
          <text x={M.left + plotW} y={HEIGHT - 2} textAnchor="end" className="fill-chalk-3 text-[10.5px]">
            part du budget →
          </text>
          {MIDFIELD < xMax ? (
            <text x={x(MIDFIELD) + 6} y={M.top + plotH / 2} className="fill-chalk-4 text-[10px]">milieu ≥ 30 %</text>
          ) : null}

          {plotted.map((a) => (
            <g
              key={a.id}
              className="cursor-pointer"
              onPointerEnter={() => setHover(a.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => open(a.id)}
            >
              <circle cx={x(a.share)} cy={y(a.roas ?? 0)} r={14} fill="transparent" />
              <Glyph code={a.code} cx={x(a.share)} cy={y(a.roas ?? 0)} active={hover === a.id} />
              {labelled.has(a.id) ? (
                <text
                  x={labelled.get(a.id)!.x}
                  y={y(a.roas ?? 0) + 4}
                  textAnchor={labelled.get(a.id)!.anchor}
                  className="pointer-events-none fill-chalk-2 text-[11px]"
                >
                  {a.name.length > 18 ? `${a.name.slice(0, 17)}…` : a.name}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      ) : null}

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 w-[220px] rounded-[var(--radius-m)] border border-rule-2 bg-ink-3 p-3 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          style={{ left: Math.min(x(hovered.share) + 14, width - 228), top: Math.max(4, y(hovered.roas ?? 0) - 40) }}
        >
          <div className="truncate font-medium text-chalk-1">{hovered.name}</div>
          <div className="num mt-1.5 text-chalk-2">
            ROAS {fmtRoas(hovered.roas)} · {pct(hovered.share)} du budget
          </div>
          <div className="num text-chalk-3">
            {eur(hovered.spend, 0)} · {hovered.purchases} achat{hovered.purchases > 1 ? "s" : ""}
          </div>
          {hovered.code ? <div className="mt-1.5 text-chalk-2">Verdict : {VERDICT_STYLE[hovered.code].label}</div> : null}
          <div className="mt-1.5 text-chalk-4">Cliquer pour ouvrir la pub</div>
        </div>
      ) : null}
      {silent > 0 ? (
        <p className="absolute bottom-[-20px] left-0 text-[11px] text-chalk-4">
          {silent} pub{silent > 1 ? "s" : ""} sans dépense sur la période, non placée{silent > 1 ? "s" : ""}.
        </p>
      ) : null}
    </div>
  );
}

/** Forme par verdict : rond garder, losange itérer, carré couper, triangle surveiller, anneau attendre. */
export function Glyph({ code, cx, cy, active = false, size = 6 }: { code: VerdictCode | null; cx: number; cy: number; active?: boolean; size?: number }) {
  const color = code ? VERDICT_STYLE[code].fg : "var(--chalk-3)";
  const s = active ? size + 1.5 : size;
  const ring = { stroke: "var(--ink-1)", strokeWidth: 2 };
  switch (code) {
    case "iterate":
      return <path d={`M${cx},${cy - s - 1.5}L${cx + s + 1.5},${cy}L${cx},${cy + s + 1.5}L${cx - s - 1.5},${cy}Z`} fill={color} {...ring} />;
    case "cut":
      return <rect x={cx - s + 0.5} y={cy - s + 0.5} width={2 * s - 1} height={2 * s - 1} rx={1.5} fill={color} {...ring} />;
    case "watch":
      return <path d={`M${cx},${cy - s - 1}L${cx + s + 1},${cy + s - 0.5}L${cx - s - 1},${cy + s - 0.5}Z`} fill={color} {...ring} />;
    case "wait":
      return <circle cx={cx} cy={cy} r={s - 1} fill="var(--ink-1)" stroke={color} strokeWidth={2.5} />;
    default:
      return <circle cx={cx} cy={cy} r={s} fill={color} {...ring} />;
  }
}
