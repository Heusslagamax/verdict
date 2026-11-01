"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { ChevronDown, Film, ImageIcon, Sparkles } from "lucide-react";
import { ELEMENT_LABEL, RULES, type Diagnosis, type RuleId } from "@/lib/engine/studio";
import { Stamp } from "@/components/ui";
import type { VerdictCode } from "@/lib/types";
import { generateStudioAction } from "@/app/actions";

export interface StudioSourceItem {
  kind: "own" | "competitor";
  id: string;
  name: string;
  thumbnailUrl: string | null;
  isVideo: boolean;
  /** Ligne de chiffres déjà formatée. */
  facts: string;
  verdict: VerdictCode | null;
  text: string | null;
  diagnosis: Diagnosis;
  briefCount: number;
}

/**
 * Les sources d'itération, dans l'ordre de la méthode : mes pubs qui ont le plus dépensé
 * (Zecom 3.2), puis les créas concurrentes pas encore copiées, par portée.
 */
export function SourceList({ own, competitors, shopSlug, aiReady }: { own: StudioSourceItem[]; competitors: StudioSourceItem[]; shopSlug: string; aiReady: boolean }) {
  const [tab, setTab] = useState<"own" | "competitor">(own.length || !competitors.length ? "own" : "competitor");
  const list = tab === "own" ? own : competitors;
  return (
    <div>
      <div role="tablist" aria-label="Sources" className="flex rounded-[var(--radius-m)] border border-rule-1 bg-ink-well p-0.5">
        {(
          [
            ["own", "Mes gagnantes", own.length],
            ["competitor", "À récupérer", competitors.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx("press flex-1 rounded-[7px] px-3 py-1.5 text-[13px]", tab === id ? "bg-ink-4 text-chalk-1" : "text-chalk-3 hover:text-chalk-1")}
          >
            {label} <span className="num text-chalk-3">{n}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-[18px] text-chalk-3">
        {tab === "own"
          ? "Tes pubs qui portent la campagne, de la plus grosse dépense à la plus petite (Zecom 3.2). Les pubs que Meta ne pousse pas sont écartées."
          : "Créas concurrentes fortes qu'aucune de tes pubs ne copie encore, par portée. On commence toujours par le 1:1."}
      </p>
      <ul className="mt-3 space-y-2.5">
        {list.map((s) => (
          <SourceItem key={s.id} s={s} shopSlug={shopSlug} aiReady={aiReady} />
        ))}
        {!list.length ? (
          <li className="rounded-[var(--radius-m)] border border-dashed border-rule-2 px-4 py-6 text-center text-[13px] text-chalk-3">
            {tab === "own"
              ? "Aucune pub n'est encore une base d'itération : il faut une gagnante (ROAS ≥ target) ou un milieu de terrain rentable."
              : "Rien à récupérer : lance un relevé dans le radar."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function SourceItem({ s, shopSlug, aiReady }: { s: StudioSourceItem; shopSlug: string; aiReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const total = s.diagnosis.plan.reduce((a, p) => a + p.count, 0);
  return (
    <li className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-2/60 p-3.5">
      <div className="flex gap-3">
        <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-ink-3 outline outline-1 -outline-offset-1 outline-white/10">
          {s.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : s.isVideo ? (
            <Film className="size-4 text-chalk-3" aria-hidden />
          ) : (
            <ImageIcon className="size-4 text-chalk-3" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-[14px] font-medium">{s.name}</span>
            {s.verdict ? <Stamp code={s.verdict} /> : null}
          </div>
          <p className="num mt-0.5 text-[12px] text-chalk-3">{s.facts}</p>
          {s.text ? <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-chalk-2">{s.text}</p> : null}
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-5 text-chalk-1">{s.diagnosis.headline}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Plan d'itérations">
        {s.diagnosis.plan.map((p) => (
          <li key={`${p.element}-${p.ruleId}`} className="inline-flex h-6 items-center gap-1 rounded-[6px] bg-ink-3 px-2 text-[12px] text-chalk-2">
            <span className="num text-chalk-1">{p.count}</span> {ELEMENT_LABEL[p.element].toLowerCase()}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-[12px] text-chalk-3 hover:text-chalk-1"
      >
        <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden /> Pourquoi ce plan
      </button>
      {open ? (
        <ul className="mt-2 space-y-1.5 border-l border-rule-2 pl-3 text-[12px] leading-[18px]">
          {s.diagnosis.triggered.map((t) => (
            <li key={t.ruleId}>
              <span className="text-chalk-1">{RULES[t.ruleId as RuleId].title}</span> <span className="text-chalk-4">· {RULES[t.ruleId as RuleId].source}</span>
              <span className="block text-chalk-3">{t.why}</span>
            </li>
          ))}
          {s.diagnosis.plan.map((p) => (
            <li key={`r-${p.ruleId}-${p.element}`}>
              <span className="text-chalk-1">{ELEMENT_LABEL[p.element]}</span> <span className="text-chalk-4">· {RULES[p.ruleId].source}</span>
              <span className="block text-chalk-3">{RULES[p.ruleId].text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !aiReady}
          onClick={() =>
            start(async () => {
              const r = await generateStudioAction(shopSlug, s.kind, s.id);
              setMsg({ ok: r.ok, text: r.message });
            })
          }
          className="press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-m)] bg-chalk-1 px-3 text-[13px] font-medium text-ink-0 hover:bg-white disabled:opacity-50"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {pending ? "Rédaction des briefs… (20-40 s)" : `Générer ${total} brief${total > 1 ? "s" : ""}`}
        </button>
        {s.briefCount ? <span className="text-[12px] text-chalk-3">{s.briefCount} déjà produit{s.briefCount > 1 ? "s" : ""}</span> : null}
      </div>
      {msg ? <p role="status" className={clsx("mt-2 text-[12px]", msg.ok ? "text-keep" : "text-cut")}>{msg.text}</p> : null}
    </li>
  );
}

