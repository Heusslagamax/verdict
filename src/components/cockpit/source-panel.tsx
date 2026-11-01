"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, Film, ImageIcon, Search, Sparkles, X } from "lucide-react";
import type { AdView, CompetitorAdLite } from "@/lib/data/views";
import { compact } from "@/lib/format";
import { clearSourceAction, confirmSourceAction, findSourceAiAction, rejectSourceAction } from "@/app/actions";

const METHOD: Record<string, string> = {
  manuel: "confirmée à la main",
  script: "script proche, confirmée",
  texte: "texte proche, confirmée",
  ia: "trouvée par l'IA, confirmée",
  studio: "reliée depuis le Studio",
};

/**
 * D'où vient cette pub. Verdict propose (scripts, textes, IA), l'utilisateur confirme :
 * c'est ce lien qui dit ensuite, dans le radar, ce qui est déjà copié et ce qui reste à copier.
 */
export function SourcePanel({ ad, competitorAds, shopSlug }: { ad: AdView; competitorAds: CompetitorAdLite[]; shopSlug: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [ai, setAi] = useState<{ competitorAdId: string; competitorId: string; reason: string; confidence: string } | null>(null);
  const byId = useMemo(() => new Map(competitorAds.map((c) => [c.id, c])), [competitorAds]);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? null : r.message);
      if (r.ok) {
        setEditing(false);
        setPicker(false);
        setAi(null);
      }
    });
  const confirm = (c: { id: string; competitorId: string | null }, method: "manuel" | "script" | "texte" | "ia" = "manuel", score?: number) =>
    run(() => confirmSourceAction(shopSlug, { adId: ad.id, competitorAdId: c.id, competitorId: c.competitorId, method, score }));

  const s = ad.source;
  const showChooser = editing || s.status === "none";

  return (
    <section aria-busy={pending}>
      <h3 className="text-[13px] font-medium text-chalk-2">Source concurrente</h3>

      {s.status === "confirmed" && !editing ? (
        <div className="mt-2">
          <SourceCard c={byId.get(s.competitorAdId) ?? null} fallbackId={s.competitorAdId} />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1 text-keep">
              <Check className="size-3.5" aria-hidden /> {METHOD[s.method] ?? "confirmée"}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="text-chalk-3 hover:text-chalk-1">
              Changer
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => clearSourceAction(shopSlug, ad.id))} className="text-chalk-3 hover:text-cut">
              Retirer
            </button>
          </div>
        </div>
      ) : null}

      {s.status === "original" && !editing ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[var(--radius-m)] border border-rule-1 bg-ink-2 px-3 py-2.5 text-[13px]">
          <span>Pub originale : aucune source concurrente.</span>
          <button type="button" onClick={() => setEditing(true)} className="text-[12px] text-chalk-3 hover:text-chalk-1">
            Changer
          </button>
        </div>
      ) : null}

      {showChooser ? (
        <div className="mt-2 space-y-2">
          {[...(ai ? [{ competitorAdId: ai.competitorAdId, competitorId: ai.competitorId, score: null, method: "ia" as const, reason: `IA (confiance ${ai.confidence}) : ${ai.reason}` }] : []), ...ad.suggestions]
            .filter((x, i, arr) => arr.findIndex((y) => y.competitorAdId === x.competitorAdId) === i)
            .map((sug) => (
              <div key={sug.competitorAdId} className="rounded-[var(--radius-m)] border border-dashed border-rule-3 p-2.5">
                <SourceCard c={byId.get(sug.competitorAdId) ?? null} fallbackId={sug.competitorAdId} compact />
                <p className="mt-1.5 text-[12px] text-chalk-3">
                  {sug.score != null ? <span className="num text-chalk-2">{Math.round(sug.score * 100)} % · </span> : null}
                  {sug.reason}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirm({ id: sug.competitorAdId, competitorId: sug.competitorId }, sug.method, sug.score ?? undefined)}
                    className="press inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-chalk-1 px-2.5 text-[12px] font-medium text-ink-0 disabled:opacity-50"
                  >
                    <Check className="size-3.5" aria-hidden /> C&apos;est la source
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      sug.method === "ia" && ai?.competitorAdId === sug.competitorAdId
                        ? setAi(null)
                        : run(() => rejectSourceAction(shopSlug, { adId: ad.id, competitorAdId: sug.competitorAdId, competitorId: sug.competitorId }))
                    }
                    className="press inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-rule-2 px-2.5 text-[12px] text-chalk-2 hover:border-rule-3 disabled:opacity-50"
                  >
                    <X className="size-3.5" aria-hidden /> Pas ça
                  </button>
                </div>
              </div>
            ))}

          {!ad.suggestions.length && !ai ? (
            <p className="text-[12px] text-chalk-3">
              Aucune source détectée automatiquement{ad.hasScript ? "" : " (colle le script de la pub ci-dessous pour améliorer la détection)"}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await findSourceAiAction(shopSlug, ad.id);
                  setAi(r.match ?? null);
                  setMsg(r.match ? null : r.message);
                })
              }
              className="press inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-rule-2 bg-ink-2 px-2.5 text-[12px] hover:border-rule-3 disabled:opacity-50"
            >
              <Sparkles className="size-3.5 text-signal" aria-hidden /> {pending ? "Recherche…" : "Chercher avec l'IA"}
            </button>
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              aria-expanded={picker}
              className="press inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-rule-2 bg-ink-2 px-2.5 text-[12px] hover:border-rule-3"
            >
              <Search className="size-3.5" aria-hidden /> Choisir à la main
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => confirm({ id: "", competitorId: null })}
              className="press inline-flex h-8 items-center rounded-[7px] px-2.5 text-[12px] text-chalk-3 hover:text-chalk-1 disabled:opacity-50"
            >
              Pub originale
            </button>
            {editing ? (
              <button type="button" onClick={() => setEditing(false)} className="h-8 px-1 text-[12px] text-chalk-4 hover:text-chalk-2">
                Annuler
              </button>
            ) : null}
          </div>

          {picker ? <Picker ads={competitorAds} onPick={(c) => confirm(c)} disabled={pending} /> : null}
        </div>
      ) : null}

      {msg ? <p role="status" className="mt-2 text-[12px] text-watch">{msg}</p> : null}
    </section>
  );
}

function Picker({ ads, onPick, disabled }: { ads: CompetitorAdLite[]; onPick: (c: CompetitorAdLite) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const competitors = [...new Map(ads.map((a) => [a.competitorId, a.competitorName])).entries()];
  const rows = ads
    .filter((a) => (who === "all" || a.competitorId === who) && (!q || a.text.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 40);
  return (
    <div className="rounded-[var(--radius-m)] border border-rule-2 bg-ink-well p-2">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher dans les textes…"
          className="h-8 min-w-0 flex-1 rounded-[7px] border border-rule-2 bg-ink-1 px-2 text-[12px] placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none"
        />
        {competitors.length > 1 ? (
          <select value={who} onChange={(e) => setWho(e.target.value)} className="h-8 rounded-[7px] border border-rule-2 bg-ink-1 px-2 text-[12px]">
            <option value="all">Tous</option>
            {competitors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <ul className="scrollbar-thin mt-2 max-h-[280px] space-y-1 overflow-y-auto">
        {rows.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(a)}
              className="w-full rounded-[7px] p-1.5 text-left hover:bg-ink-2 disabled:opacity-50"
            >
              <SourceCard c={a} fallbackId={a.id} compact />
            </button>
          </li>
        ))}
        {!rows.length ? <li className="p-2 text-[12px] text-chalk-3">Aucune pub concurrente ne correspond.</li> : null}
      </ul>
    </div>
  );
}

function SourceCard({ c, fallbackId, compact: small = false }: { c: CompetitorAdLite | null; fallbackId: string; compact?: boolean }) {
  if (!c) return <p className="text-[12px] text-chalk-3">Pub concurrente {fallbackId.slice(-8)} (plus dans le dernier relevé)</p>;
  return (
    <div className="flex gap-2.5">
      <span className={clsx("relative grid shrink-0 place-items-center overflow-hidden rounded-[7px] bg-ink-3", small ? "size-10" : "size-14")}>
        {c.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : c.mediaType === "video" ? (
          <Film className="size-4 text-chalk-3" aria-hidden />
        ) : (
          <ImageIcon className="size-4 text-chalk-3" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="font-medium text-chalk-1">{c.competitorName}</span>
          <span className="num text-chalk-3">
            {c.reach != null ? `${compact(c.reach)} portée` : ""}
            {c.daysRunning != null ? ` · ${c.daysRunning} j` : ""}
            {c.active ? "" : " · coupée"}
          </span>
        </div>
        <p className={clsx("mt-0.5 text-[12px] leading-[18px] text-chalk-2", small ? "line-clamp-2" : "line-clamp-3")}>{c.text || "Sans texte"}</p>
      </div>
    </div>
  );
}
