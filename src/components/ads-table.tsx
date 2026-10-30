"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Film, ImageIcon, FileText } from "lucide-react";
import type { AdView } from "@/lib/data/views";
import type { Thresholds, VerdictCode } from "@/lib/types";
import { eur, int, pct, roas } from "@/lib/format";
import { Stamp, VERDICT_STYLE } from "./ui";
import { AdDrawer } from "./ad-drawer";

const ORDER: VerdictCode[] = ["cut", "iterate", "keep", "watch", "wait"];
const ROLE: Record<string, string> = {
  milieu: "milieu de terrain",
  attaquant: "attaquant",
  remplaçant: "remplaçant",
  muet: "sans diffusion",
  nouveau: "nouvelle",
};

export function AdsTable({
  ads,
  thresholds,
  shopSlug,
  campaignId,
}: {
  ads: AdView[];
  thresholds: Thresholds | null;
  shopSlug: string;
  campaignId: string;
}) {
  const [filter, setFilter] = useState<VerdictCode | "all">("all");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("ad");
  const open = ads.find((a) => a.id === openId) ?? null;

  const counts = useMemo(() => {
    const c: Record<VerdictCode, number> = { keep: 0, iterate: 0, cut: 0, watch: 0, wait: 0 };
    for (const a of ads) if (a.verdict) c[a.verdict.code]++;
    return c;
  }, [ads]);

  const rows = useMemo(
    () =>
      ads
        .filter((a) => filter === "all" || a.verdict?.code === filter)
        .sort((a, b) => b.totals.spend - a.totals.spend),
    [ads, filter],
  );

  const setAd = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("ad", id);
    else next.delete("ad");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div>
      <div role="toolbar" aria-label="Filtrer par verdict" className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-3">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          Toutes <span className="num text-chalk-3">{ads.length}</span>
        </Chip>
        {ORDER.filter((c) => counts[c] > 0).map((c) => (
          <Chip key={c} active={filter === c} onClick={() => setFilter(c)} color={VERDICT_STYLE[c].fg}>
            {VERDICT_STYLE[c].label} <span className="num">{counts[c]}</span>
          </Chip>
        ))}
      </div>

      {/* Bureau : tableau aligné. Téléphone : lignes sur deux niveaux. */}
      <div className="hidden lg:block">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[12px] text-chalk-3">
              <th className="pb-2 font-normal">Ad</th>
              <th className="pb-2 font-normal">Verdict</th>
              <th className="pb-2 text-right font-normal">Dépense</th>
              <th className="pb-2 text-right font-normal">Part</th>
              <th className="pb-2 text-right font-normal">ROAS</th>
              <th className="pb-2 text-right font-normal">Achats</th>
              <th className="pb-2 text-right font-normal">Coût/ATC</th>
              <th className="pb-2 text-right font-normal">CPC</th>
              <th className="pb-2 pl-4 font-normal">7 jours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                onClick={() => setAd(a.id)}
                className="group cursor-pointer border-t border-rule-1 align-middle hover:bg-ink-2/60"
              >
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-3">
                    <Thumb ad={a} />
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="block max-w-full truncate text-left font-medium text-chalk-1 group-hover:underline group-hover:decoration-rule-3 group-hover:underline-offset-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAd(a.id);
                        }}
                      >
                        {a.name}
                      </button>
                      <div className="truncate text-[12px] text-chalk-3">
                        {a.verdict ? ROLE[a.verdict.role] : null} · {a.ageDays} j
                        {a.hasScript ? <FileText aria-label="script enregistré" className="ml-1.5 inline size-3 align-[-1px] text-chalk-3" /> : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-2">
                  {a.verdict ? <Stamp code={a.verdict.code} /> : <span className="text-chalk-4">—</span>}
                </td>
                <td className="num py-2.5 text-right">{eur(a.totals.spend)}</td>
                <td className="py-2.5 text-right">
                  <span className="num text-chalk-2">{pct(a.share)}</span>
                </td>
                <td className="num py-2.5 text-right" style={{ color: roasColor(a.totals.roas, thresholds) }}>
                  {roas(a.totals.roas)}
                </td>
                <td className="num py-2.5 text-right text-chalk-2">{int(a.totals.purchases)}</td>
                <td
                  className="num py-2.5 text-right"
                  style={{ color: thresholds && a.totals.costPerAtc != null && a.totals.costPerAtc > thresholds.atcTarget ? "var(--cut)" : "var(--chalk-2)" }}
                >
                  {eur(a.totals.costPerAtc)}
                </td>
                <td className="num py-2.5 text-right text-chalk-2">{eur(a.totals.cpc)}</td>
                <td className="py-2.5 pl-4">
                  <Bars trend={a.trend} target={thresholds?.target ?? null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="lg:hidden">
        {rows.map((a) => (
          <li key={a.id} className="border-t border-rule-1">
            <button type="button" onClick={() => setAd(a.id)} className="flex w-full items-center gap-3 py-3 text-left">
              <Thumb ad={a} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-medium">{a.name}</span>
                  <span className="num shrink-0 text-[14px]" style={{ color: roasColor(a.totals.roas, thresholds) }}>
                    {roas(a.totals.roas)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {a.verdict ? <Stamp code={a.verdict.code} /> : <span />}
                  <span className="num text-[12px] text-chalk-3">
                    {eur(a.totals.spend, 0)} · {pct(a.share)} · {int(a.totals.purchases)} achat{a.totals.purchases > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {!rows.length ? <p className="border-t border-rule-1 py-6 text-[13px] text-chalk-3">Aucune ad dans ce filtre.</p> : null}

      <AdDrawer ad={open} thresholds={thresholds} shopSlug={shopSlug} campaignId={campaignId} onClose={() => setAd(null)} />
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
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[7px] bg-ink-3 outline outline-1 -outline-offset-1 outline-white/10"
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

function Bars({ trend, target }: { trend: AdView["trend"]; target: number | null }) {
  const max = Math.max(...trend.map((d) => d.spend), 1);
  const days = trend.slice(-7);
  return (
    <div className="flex h-6 items-end gap-[3px]" aria-label="Dépense des 7 derniers jours">
      {Array.from({ length: 7 }).map((_, i) => {
        const d = days[i - (7 - days.length)];
        const h = d ? Math.max(2, (d.spend / max) * 24) : 2;
        const hit = d && target != null && d.roas != null && d.roas >= target;
        return (
          <span
            key={i}
            title={d ? `${d.date} · ${eur(d.spend)} · ROAS ${roas(d.roas)}` : "pas de dépense"}
            className="w-[6px] rounded-[2px]"
            style={{ height: h, background: !d ? "var(--ink-3)" : hit ? "var(--signal)" : "var(--chalk-4)" }}
          />
        );
      })}
    </div>
  );
}

export function roasColor(v: number | null, t: Thresholds | null): string {
  if (v == null || !t) return "var(--chalk-3)";
  if (v >= t.target) return "var(--keep)";
  if (v >= t.be) return "var(--chalk-1)";
  if (v >= t.loss20) return "var(--watch)";
  return "var(--cut)";
}
