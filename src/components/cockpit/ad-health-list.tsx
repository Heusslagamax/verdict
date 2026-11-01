"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { FileText, Film, ImageIcon } from "lucide-react";
import type { AdView } from "@/lib/data/views";
import type { Thresholds, VerdictCode } from "@/lib/types";
import { eur, int, pct, roas as fmtRoas } from "@/lib/format";
import { roasCeiling, zoneOf } from "@/lib/zones";
import { Stamp, VERDICT_STYLE } from "@/components/ui";
import { Delta, RoasGauge, Sparkline } from "@/components/charts/mini";
import { AdDrawer } from "@/components/ad-drawer";
import { useAdParam } from "./url-state";

const PRIORITY: VerdictCode[] = ["cut", "iterate", "watch", "keep", "wait"];
const ROLE: Record<string, string> = {
  milieu: "Milieu de terrain",
  attaquant: "Attaquant",
  remplaçant: "Remplaçant",
  muet: "Sans diffusion",
  nouveau: "Nouvelle",
};

type Sort = "priority" | "spend" | "roas";

/**
 * Santé pub par pub. Chaque ligne se lit de gauche à droite comme une phrase :
 * quelle créa → quel verdict et pourquoi → où est son ROAS sur le couloir → combien elle coûte
 * → ce qu'elle rapporte → comment elle évolue.
 */
export function AdHealthList({ ads, thresholds: t, shopSlug, campaignId, windowDays }: {
  ads: AdView[];
  thresholds: Thresholds | null;
  shopSlug: string;
  campaignId: string;
  windowDays: number;
}) {
  const [filter, setFilter] = useState<VerdictCode | "all">("all");
  const [sort, setSort] = useState<Sort>("priority");
  const [openId, setAd] = useAdParam();
  const open = ads.find((a) => a.id === openId) ?? null;
  const ceil = t ? roasCeiling(t, ads.map((a) => a.totals.roas)) : 0;
  const maxShare = Math.max(0.01, ...ads.map((a) => a.share));

  const counts = useMemo(() => {
    const c: Record<VerdictCode, number> = { keep: 0, iterate: 0, cut: 0, watch: 0, wait: 0 };
    for (const a of ads) if (a.verdict) c[a.verdict.code]++;
    return c;
  }, [ads]);

  const rows = useMemo(() => {
    const r = ads.filter((a) => filter === "all" || a.verdict?.code === filter);
    const rank = (a: AdView) => (a.verdict ? PRIORITY.indexOf(a.verdict.code) : 9);
    return r.sort((a, b) =>
      sort === "spend"
        ? b.totals.spend - a.totals.spend
        : sort === "roas"
          ? (b.totals.roas ?? -1) - (a.totals.roas ?? -1)
          : rank(a) - rank(b) || b.totals.spend - a.totals.spend,
    );
  }, [ads, filter, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div role="toolbar" aria-label="Filtrer par verdict" className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Toutes <span className="num text-chalk-3">{ads.length}</span>
          </Chip>
          {PRIORITY.filter((c) => counts[c] > 0).map((c) => (
            <Chip key={c} active={filter === c} onClick={() => setFilter(c)} color={VERDICT_STYLE[c].fg}>
              {VERDICT_STYLE[c].label} <span className="num">{counts[c]}</span>
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-chalk-3">
          Trier par
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-[7px] border border-rule-2 bg-ink-well px-2 text-[12px] text-chalk-1 focus:border-rule-3 focus:outline-none"
          >
            <option value="priority">Urgence</option>
            <option value="spend">Dépense</option>
            <option value="roas">ROAS</option>
          </select>
        </label>
      </div>

      {/* En-têtes (bureau) */}
      <div className="hidden grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_120px] gap-5 border-b border-rule-1 pb-2 text-[11px] text-chalk-4 xl:grid">
        <span>Pub · verdict et raison</span>
        <span>ROAS sur le couloir</span>
        <span>Dépense · part du budget</span>
        <span className="text-right">Achats · CPA</span>
        <span className="text-right">Coût / ajout panier</span>
        <span>ROAS 14 jours</span>
      </div>

      <ul className="divide-y divide-rule-1">
        {rows.map((a) => {
          const z = t ? zoneOf(a.totals.roas, t) : null;
          const atcBad = t != null && a.totals.costPerAtc != null && a.totals.costPerAtc > t.atcTarget;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setAd(a.id)}
                className="grid w-full grid-cols-2 gap-x-4 gap-y-3 py-3.5 text-left transition-colors hover:bg-ink-2/50 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_120px] xl:items-center xl:gap-5"
              >
                {/* Pub + verdict */}
                <div className="col-span-2 flex min-w-0 items-start gap-3 xl:col-span-1">
                  <Thumb ad={a} size={52} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-chalk-1">{a.name}</span>
                      {a.hasScript ? <FileText aria-label="script enregistré" className="size-3 shrink-0 text-chalk-3" /> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {a.verdict ? <Stamp code={a.verdict.code} /> : null}
                      <span className="text-[12px] text-chalk-3">
                        {a.verdict ? ROLE[a.verdict.role] : null} · {a.ageDays} j
                      </span>
                    </div>
                    {a.verdict ? <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-chalk-3">{a.verdict.rule}</p> : null}
                  </div>
                </div>

                {/* ROAS */}
                {t ? (
                  <div className="col-span-2 min-w-0 xl:col-span-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px]" style={{ color: z?.color ?? "var(--chalk-4)" }}>
                        {z?.label ?? (a.totals.spend > 0 ? "0 vente" : "Pas de dépense")}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
                        <Delta now={a.totals.roas} prev={a.prev.roas} quiet />
                        <span className="figure text-[19px]">{fmtRoas(a.totals.roas)}</span>
                      </span>
                    </div>
                    <RoasGauge value={a.totals.roas} prev={a.prev.roas} t={t} ceil={ceil} className="mt-1" />
                  </div>
                ) : (
                  <span className="figure text-[19px]">{fmtRoas(a.totals.roas)}</span>
                )}

                {/* Dépense + part */}
                <div className="col-span-2 min-w-0 xl:col-span-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="num text-[14px] text-chalk-1">{eur(a.totals.spend, 0)}</span>
                    <span className="num text-[12px] text-chalk-3">{pct(a.share)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-ink-3">
                    <div className="h-full rounded-full bg-chalk-3" style={{ width: `${(a.share / maxShare) * 100}%` }} />
                  </div>
                </div>

                {/* Achats */}
                <div className="xl:text-right">
                  <span className="text-[11px] text-chalk-4 xl:hidden">Achats · CPA</span>
                  <div>
                    <div className="num text-[14px] text-chalk-1">{int(a.totals.purchases)}</div>
                    <div className="num text-[12px] text-chalk-3">{eur(a.totals.cpa, 0)}</div>
                  </div>
                </div>

                {/* Coût / ATC */}
                <div className="text-right">
                  <span className="text-[11px] text-chalk-4 xl:hidden">Coût / ajout panier</span>
                  <div>
                    <div className="num text-[14px]" style={{ color: atcBad ? "var(--cut)" : "var(--chalk-1)" }}>
                      {eur(a.totals.costPerAtc)}
                    </div>
                    {t ? (
                      <div className="text-[12px]" style={{ color: atcBad ? "var(--cut)" : "var(--chalk-3)" }}>
                        {a.totals.costPerAtc == null ? "aucun ajout" : atcBad ? `> cible ${eur(t.atcTarget, 0)}` : `≤ cible ${eur(t.atcTarget, 0)}`}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="hidden xl:block">
                  <Sparkline values={a.trend.map((d) => d.roas)} t={t} windowDays={windowDays} width={120} height={34} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {!rows.length ? <p className="border-t border-rule-1 py-6 text-[13px] text-chalk-3">Aucune pub dans ce filtre.</p> : null}

      <AdDrawer ad={open} thresholds={t} shopSlug={shopSlug} campaignId={campaignId} windowDays={windowDays} onClose={() => setAd(null)} />
    </div>
  );
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12px]",
        active ? "border-rule-3 bg-ink-3 text-chalk-1" : "border-rule-1 text-chalk-2 hover:border-rule-2",
      )}
    >
      {color ? <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  );
}

export function Thumb({ ad, size = 44 }: { ad: AdView; size?: number }) {
  const src = ad.creative.thumbnailUrl ?? ad.creative.imageUrl;
  const isVideo = Boolean(ad.creative.videoId);
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] bg-ink-3 outline outline-1 -outline-offset-1 outline-white/10"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : isVideo ? (
        <Film className="size-4 text-chalk-3" aria-hidden />
      ) : (
        <ImageIcon className="size-4 text-chalk-3" aria-hidden />
      )}
      {isVideo && src ? (
        <span className="absolute bottom-0.5 right-0.5 rounded-[3px] bg-black/70 px-1 text-[9px] leading-[14px] text-white">▶</span>
      ) : null}
    </span>
  );
}

export function roasColor(v: number | null, t: Thresholds | null): string {
  if (!t) return "var(--chalk-3)";
  return zoneOf(v, t)?.color ?? "var(--chalk-3)";
}
