"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { ArrowRight, Check, ChevronDown, Film, ImageIcon, Minus, X } from "lucide-react";
import type { RapprochementRow } from "@/lib/data/rapprochement";
import { compact, eur } from "@/lib/format";
import { confirmSourceAction, confirmSureMatchesAction, rejectSourceAction } from "@/app/actions";

const RELATION = {
  copie_1_1: { label: "Copie 1:1", color: "var(--keep)" },
  iteration: { label: "Itération", color: "var(--signal)" },
  meme_angle: { label: "Même angle", color: "var(--watch)" },
  different: { label: "Différente", color: "var(--chalk-4)" },
} as const;

const CRITERIA = [
  ["images", "Images"],
  ["script", "Script"],
  ["angle", "Angle"],
  ["hook", "Hook"],
  ["offre", "Offre"],
] as const;

type Filter = "todo" | "confirmed" | "none" | "all";

export function RapprochementResults({ rows, slug }: { rows: RapprochementRow[]; slug: string }) {
  const state = (r: RapprochementRow) =>
    r.link.some((l) => l.status === "confirmed") ? "confirmed" : r.matches.some((m) => !r.link.some((l) => l.competitorAdId === m.competitorAdId)) ? "todo" : "none";
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => state(r) === "todo") ? "todo" : "all"));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const counts = { todo: 0, confirmed: 0, none: 0, all: rows.length } as Record<Filter, number>;
  for (const r of rows) counts[state(r)]++;
  const sure = rows.filter((r) => state(r) === "todo" && r.matches.some((m) => m.confidence === "haute" && (m.relation === "copie_1_1" || m.relation === "iteration"))).length;
  const list = rows.filter((r) => filter === "all" || state(r) === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filtrer" className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {(
            [
              ["todo", "À confirmer"],
              ["confirmed", "Confirmées"],
              ["none", "Sans correspondance"],
              ["all", "Toutes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={clsx(
                "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12px]",
                filter === id ? "border-rule-3 bg-ink-3 text-chalk-1" : "border-rule-1 text-chalk-2 hover:border-rule-2",
              )}
            >
              {label} <span className="num text-chalk-3">{counts[id]}</span>
            </button>
          ))}
        </div>
        {sure ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setMsg((await confirmSureMatchesAction(slug)).message))}
            className="press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-m)] bg-chalk-1 px-3 text-[13px] font-medium text-ink-0 hover:bg-white disabled:opacity-50"
          >
            <Check className="size-3.5" aria-hidden /> {sure > 1 ? `Confirmer les ${sure} correspondances sûres` : "Confirmer la correspondance sûre"}
          </button>
        ) : null}
      </div>
      {msg ? <p role="status" className="mt-2 text-[12px] text-keep">{msg}</p> : null}

      <ul className="mt-4 space-y-3">
        {list.map((r) => (
          <Row key={r.ad.id} r={r} slug={slug} />
        ))}
        {!list.length ? (
          <li className="rounded-[var(--radius-l)] border border-dashed border-rule-2 px-5 py-10 text-center text-[13px] text-chalk-3">
            {rows.length ? "Rien dans ce filtre." : "Aucune pub active sur 14 jours pour cette boutique."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Row({ r, slug }: { r: RapprochementRow; slug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirmedId = r.link.find((l) => l.status === "confirmed")?.competitorAdId ?? null;
  const rejected = new Set(r.link.filter((l) => l.status === "rejected").map((l) => l.competitorAdId));
  const best = r.matches.find((m) => m.competitorAdId === confirmedId) ?? r.matches.find((m) => !rejected.has(m.competitorAdId)) ?? null;
  const others = r.matches.filter((m) => m !== best && !rejected.has(m.competitorAdId));

  return (
    <li className={clsx("rounded-[var(--radius-l)] border border-rule-1 bg-ink-1", pending && "opacity-70")}>
      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
        <Creative thumb={r.ad.thumbnailUrl} isVideo={r.ad.isVideo} title={r.ad.name} sub={`${eur(r.ad.spend14, 0)} sur 14 j${r.ad.analyzed ? "" : " · pas encore analysée"}`} />

        <div className="min-w-0">
          {best ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ArrowRight className="size-4 text-chalk-4" aria-hidden />
                <span className="inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium" style={{ color: RELATION[best.relation].color, background: "var(--ink-3)" }}>
                  {RELATION[best.relation].label}
                </span>
                <span className="text-[12px] text-chalk-3">confiance {best.confidence}</span>
                {confirmedId === best.competitorAdId ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-keep">
                    <Check className="size-3.5" aria-hidden /> confirmée
                  </span>
                ) : null}
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Critères">
                {CRITERIA.map(([k, label]) => {
                  const on = best.criteria[k];
                  return (
                    <li
                      key={k}
                      className={clsx("inline-flex h-6 items-center gap-1 rounded-[6px] border px-1.5 text-[11px]", on ? "border-rule-3 text-chalk-1" : "border-rule-1 text-chalk-4")}
                    >
                      {on ? <Check className="size-3 text-keep" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                      {label}
                      {k === "images" && best.imageShare > 0 ? <span className="num text-chalk-3">{Math.round(best.imageShare * 100)} %</span> : null}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[12px] leading-[18px] text-chalk-2">{best.evidence}</p>
            </>
          ) : (
            <p className="text-[13px] text-chalk-3">{r.ad.analyzed ? "Aucune créa concurrente correspondante." : "Lance le rapprochement pour analyser cette pub."}</p>
          )}
        </div>

        {best ? (
          <Creative
            thumb={best.competitorThumb}
            isVideo
            title={best.competitorName}
            sub={`${best.reach != null ? `${compact(best.reach)} portée` : ""}${best.daysRunning != null ? ` · ${best.daysRunning} j` : ""}`}
            text={best.competitorText}
          />
        ) : (
          <div />
        )}
      </div>

      {best || (r.ad.analyzed && !confirmedId) ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule-1 px-4 py-3">
          {best && confirmedId !== best.competitorAdId ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => void (await confirmSourceAction(slug, { adId: r.ad.id, competitorAdId: best.competitorAdId, competitorId: best.competitorId, method: "ia" })))}
                className="press inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-chalk-1 px-2.5 text-[12px] font-medium text-ink-0 disabled:opacity-50"
              >
                <Check className="size-3.5" aria-hidden /> C&apos;est la source
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => void (await rejectSourceAction(slug, { adId: r.ad.id, competitorAdId: best.competitorAdId, competitorId: best.competitorId })))}
                className="press inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-rule-2 px-2.5 text-[12px] text-chalk-2 hover:border-rule-3 disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden /> Pas ça
              </button>
            </>
          ) : null}
          {!best && !confirmedId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await confirmSourceAction(slug, { adId: r.ad.id, competitorAdId: "", competitorId: null })))}
              className="press inline-flex h-8 items-center rounded-[7px] border border-rule-2 px-2.5 text-[12px] text-chalk-2 hover:border-rule-3 disabled:opacity-50"
            >
              C&apos;est une pub originale
            </button>
          ) : null}
          {best ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="ml-auto inline-flex h-8 items-center gap-1 text-[12px] text-chalk-3 hover:text-chalk-1"
            >
              <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden /> Voir les images comparées
              {others.length ? ` · ${others.length} autre${others.length > 1 ? "s" : ""} candidate${others.length > 1 ? "s" : ""}` : ""}
            </button>
          ) : null}
        </div>
      ) : null}

      {open && best ? (
        <div className="space-y-4 border-t border-rule-1 p-4">
          {best.framePairs.length ? (
            <div>
              <p className="eyebrow">Plans retrouvés chez le concurrent</p>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {best.framePairs.slice(0, 6).map((p) => (
                  <li key={`${p.a}-${p.b}`} className="rounded-[var(--radius-m)] border border-rule-1 p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <FrameImg slug={slug} kind="own" refId={r.ad.id} t={p.a} label={`toi · ${p.a} s`} />
                      <FrameImg slug={slug} kind="competitor" refId={best.competitorAdId} t={p.b} label={`eux · ${p.b} s`} />
                    </div>
                    <p className="num mt-1 text-[11px] text-chalk-3">écart {p.distance}/64</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[12px] text-chalk-3">Aucun plan identique mesuré : le rapprochement repose sur le script, l&apos;angle ou le hook.</p>
          )}
          {others.length ? (
            <div>
              <p className="eyebrow">Autres candidates</p>
              <ul className="mt-2 space-y-2">
                {others.map((m) => (
                  <li key={m.competitorAdId} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-m)] border border-rule-1 p-2.5 text-[12px]">
                    <span className="font-medium" style={{ color: RELATION[m.relation].color }}>
                      {RELATION[m.relation].label}
                    </span>
                    <span className="text-chalk-2">{m.competitorName}</span>
                    <span className="min-w-0 flex-1 text-chalk-3">{m.evidence}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => void (await confirmSourceAction(slug, { adId: r.ad.id, competitorAdId: m.competitorAdId, competitorId: m.competitorId, method: "ia" })))}
                      className="press inline-flex h-7 items-center rounded-[7px] border border-rule-2 px-2 text-[12px] hover:border-rule-3 disabled:opacity-50"
                    >
                      C&apos;est celle-ci
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Creative({ thumb, isVideo, title, sub, text }: { thumb: string | null; isVideo: boolean; title: string; sub: string; text?: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-ink-3 outline outline-1 -outline-offset-1 outline-white/10">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
        ) : isVideo ? (
          <Film className="size-4 text-chalk-3" aria-hidden />
        ) : (
          <ImageIcon className="size-4 text-chalk-3" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{title}</p>
        <p className="text-[12px] text-chalk-3">{sub}</p>
        {text ? <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-chalk-2">{text}</p> : null}
      </div>
    </div>
  );
}

function FrameImg({ slug, kind, refId, t, label }: { slug: string; kind: "own" | "competitor"; refId: string; t: number; label: string }) {
  const q = new URLSearchParams({ shop: slug, kind, ref: refId, t: String(t) });
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/fingerprint?${q}`} alt={label} loading="lazy" className="aspect-[9/16] w-full rounded-[6px] bg-ink-3 object-cover" />
      <figcaption className="mt-0.5 text-[10px] text-chalk-3">{label}</figcaption>
    </figure>
  );
}
