"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { ChevronDown, Languages, Trash2 } from "lucide-react";
import type { StudioBriefRow, BriefStatus } from "@/lib/data/repo";
import type { LaunchResult } from "@/lib/data/studio";
import { ELEMENT_LABEL, RULES, type Element } from "@/lib/engine/studio";
import { eur, roas as fmtRoas } from "@/lib/format";
import { Stamp } from "@/components/ui";
import { deleteBriefAction, updateBriefAction } from "@/app/actions";

const STATUS: { id: BriefStatus; label: string; dot: string }[] = [
  { id: "a_produire", label: "À produire", dot: "var(--signal)" },
  { id: "en_production", label: "En production", dot: "var(--watch)" },
  { id: "lancee", label: "Lancées", dot: "var(--keep)" },
  { id: "abandonnee", label: "Abandonnées", dot: "var(--chalk-4)" },
];

/** Les briefs du Studio et leur suivi : à produire → en production → lancée (avec son résultat Meta). */
export function BriefBoard({
  briefs,
  launchable,
  results,
  shopSlug,
}: {
  briefs: StudioBriefRow[];
  launchable: { id: string; name: string }[];
  results: Record<string, LaunchResult>;
  shopSlug: string;
}) {
  const [filter, setFilter] = useState<BriefStatus | "all">("a_produire");
  const counts = useMemo(() => Object.fromEntries(STATUS.map((s) => [s.id, briefs.filter((b) => b.status === s.id).length])) as Record<BriefStatus, number>, [briefs]);
  const rows = briefs.filter((b) => filter === "all" || b.status === filter);

  return (
    <div>
      <div role="tablist" aria-label="Statut des briefs" className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {STATUS.map((s) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={filter === s.id}
            onClick={() => setFilter(s.id)}
            className={clsx(
              "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12px]",
              filter === s.id ? "border-rule-3 bg-ink-3 text-chalk-1" : "border-rule-1 text-chalk-2 hover:border-rule-2",
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.dot }} />
            {s.label} <span className="num text-chalk-3">{counts[s.id]}</span>
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          onClick={() => setFilter("all")}
          className={clsx(
            "press inline-flex h-8 shrink-0 items-center rounded-[7px] border px-2.5 text-[12px]",
            filter === "all" ? "border-rule-3 bg-ink-3 text-chalk-1" : "border-rule-1 text-chalk-2 hover:border-rule-2",
          )}
        >
          Tous <span className="num ml-1.5 text-chalk-3">{briefs.length}</span>
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((b) => (
          <BriefCard key={b.id} b={b} launchable={launchable} result={b.launchedAdId ? (results[b.launchedAdId] ?? null) : null} shopSlug={shopSlug} />
        ))}
        {!rows.length ? (
          <li className="rounded-[var(--radius-l)] border border-dashed border-rule-2 px-5 py-10 text-center text-[13px] text-chalk-3">
            {briefs.length ? "Aucun brief dans ce statut." : "Pas encore de brief. Choisis une source à gauche et génère tes premières itérations."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function BriefCard({ b, launchable, result, shopSlug }: { b: StudioBriefRow; launchable: { id: string; name: string }[]; result: LaunchResult | null; shopSlug: string }) {
  const [open, setOpen] = useState(b.status === "a_produire");
  const [fr, setFr] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const patch = (p: { status?: BriefStatus; launchedAdId?: string | null }) =>
    start(async () => {
      const r = await updateBriefAction(shopSlug, b.id, p);
      setErr(r.ok ? null : r.message);
    });
  const c = b.brief;
  const label = ELEMENT_LABEL[b.element as Element] ?? b.element;

  return (
    <li className={clsx("rounded-[var(--radius-l)] border border-rule-1 bg-ink-1", pending && "opacity-70")} aria-busy={pending}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-[6px] bg-signal-wash px-2 text-[12px] font-medium text-signal">{label}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium leading-5 text-chalk-1">{b.title}</span>
          <span className="mt-0.5 block text-[12px] text-chalk-3">
            {b.sourceKind === "own" ? "Itération de" : "Reprise de"} {b.sourceLabel} · {new Date(b.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        </span>
        <ChevronDown className={clsx("mt-1 size-4 shrink-0 text-chalk-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-rule-1 p-4">
          <p className="text-[13px] leading-5 text-chalk-2">{c.why}</p>

          <div className="rounded-[var(--radius-m)] bg-ink-2 p-3">
            <p className="eyebrow">Hook · 3 premières secondes</p>
            <p className="mt-1.5 text-[15px] font-medium leading-6 text-chalk-1">« {c.hook.text} »</p>
            <p className="mt-1 text-[12px] leading-[18px] text-chalk-3">Plan : {c.hook.visual}</p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Script</p>
              <button type="button" onClick={() => setFr((v) => !v)} className="inline-flex items-center gap-1 text-[12px] text-chalk-3 hover:text-chalk-1">
                <Languages className="size-3.5" aria-hidden /> {fr ? "Version marché" : "Traduction française"}
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-[21px] text-chalk-1">{fr ? c.scriptFr : c.script}</p>
          </div>

          {c.shots.length ? (
            <div>
              <p className="eyebrow">Plan de montage</p>
              <ol className="mt-1.5 divide-y divide-rule-1 rounded-[var(--radius-m)] border border-rule-1">
                {c.shots.map((s, i) => (
                  <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-3 py-2 text-[12px] leading-[18px]">
                    <span className="num text-chalk-3">{s.at}</span>
                    <span>
                      <span className="text-chalk-1">{s.visual}</span>
                      {s.text ? <span className="block text-chalk-3">{s.text}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <dl className="grid gap-3 text-[12px] leading-[18px] sm:grid-cols-2">
            <div>
              <dt className="eyebrow">CTA</dt>
              <dd className="mt-1 text-chalk-1">{c.cta}</dd>
            </div>
            <div>
              <dt className="eyebrow">Production</dt>
              <dd className="mt-1 text-chalk-2">{c.production}</dd>
            </div>
            {c.adCopy ? (
              <div className="sm:col-span-2">
                <dt className="eyebrow">Texte d&apos;annonce</dt>
                <dd className="mt-1 whitespace-pre-line text-chalk-2">{c.adCopy}</dd>
              </div>
            ) : null}
          </dl>

          {b.ruleIds.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Règles appliquées">
              {b.ruleIds.map((id) => {
                const r = RULES[id as keyof typeof RULES];
                return r ? (
                  <li key={id} title={`${r.source} : ${r.text}`} className="inline-flex h-6 items-center rounded-[6px] border border-rule-2 px-2 text-[11px] text-chalk-3">
                    {r.title}
                  </li>
                ) : null;
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-rule-1 px-4 py-3">
        <select
          aria-label="Statut"
          value={b.status}
          disabled={pending}
          onChange={(e) => patch({ status: e.target.value as BriefStatus })}
          className="h-8 rounded-[7px] border border-rule-2 bg-ink-well px-2 text-[12px] text-chalk-1 focus:border-rule-3 focus:outline-none"
        >
          {STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label.replace(/s$/, "")}
            </option>
          ))}
        </select>
        <select
          aria-label="Pub lancée"
          value={b.launchedAdId ?? ""}
          disabled={pending}
          onChange={(e) => patch({ launchedAdId: e.target.value || null })}
          className="h-8 max-w-[220px] rounded-[7px] border border-rule-2 bg-ink-well px-2 text-[12px] text-chalk-1 focus:border-rule-3 focus:outline-none"
        >
          <option value="">Relier à la pub lancée…</option>
          {launchable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {result ? (
          <span className="inline-flex items-center gap-2 text-[12px] text-chalk-2">
            {result.verdict ? <Stamp code={result.verdict} /> : null}
            <span className="num">ROAS {fmtRoas(result.roas)} · {eur(result.spend, 0)} (7 j)</span>
          </span>
        ) : b.launchedAdId ? (
          <span className="text-[12px] text-chalk-3">Pas encore de chiffres sur 7 jours</span>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await deleteBriefAction(shopSlug, b.id)))}
          aria-label="Supprimer le brief"
          className="ml-auto grid size-8 place-items-center rounded-[7px] text-chalk-4 hover:bg-ink-2 hover:text-cut"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      {err ? <p className="px-4 pb-3 text-[12px] text-cut">{err}</p> : null}
    </li>
  );
}
