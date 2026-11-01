"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { ExternalLink, Play } from "lucide-react";
import type { CompetitorAdView } from "@/lib/data/views";
import type { CompetitorSignal } from "@/lib/types";
import { compact, eur, int, signed } from "@/lib/format";
import { setFlag } from "@/app/actions";

type Tab = "recover" | "montante" | "winner" | "coupee" | "copied" | "all";

const SIGNAL: Record<CompetitorSignal, { label: string; fg: string; bg: string }> = {
  montante: { label: "Monte", fg: "var(--signal)", bg: "var(--signal-wash)" },
  winner: { label: "Validée", fg: "var(--keep)", bg: "var(--keep-wash)" },
  coupee: { label: "Coupée", fg: "var(--cut)", bg: "var(--cut-wash)" },
  nouvelle: { label: "Nouvelle", fg: "var(--watch)", bg: "var(--watch-wash)" },
  stable: { label: "Stable", fg: "var(--wait)", bg: "var(--wait-wash)" },
};

const strength = (a: CompetitorAdView) =>
  (a.read.signals.includes("winner") ? 2_000_000 : 0) + (a.rankDelta ?? 0) * 10_000 + (a.reachDelta7d ?? 0) + (a.reach ?? 0) / 10;

export function RadarBoard({
  ads,
  competitors,
  shopSlug,
}: {
  ads: CompetitorAdView[];
  competitors: { id: string; name: string }[];
  shopSlug: string;
}) {
  const [tab, setTab] = useState<Tab>("recover");
  const [who, setWho] = useState<string>("all");

  const scoped = useMemo(() => ads.filter((a) => who === "all" || a.competitorId === who), [ads, who]);
  const lists: Record<Tab, CompetitorAdView[]> = useMemo(
    () => ({
      recover: scoped.filter((a) => a.read.recoverable).sort((a, b) => strength(b) - strength(a)),
      montante: scoped.filter((a) => a.read.signals.includes("montante")).sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)),
      winner: scoped.filter((a) => a.read.signals.includes("winner")).sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0)),
      coupee: scoped.filter((a) => a.read.signals.includes("coupee")).sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "")),
      copied: scoped.filter((a) => a.copiedBy.length).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)),
      all: [...scoped].sort((a, b) => strength(b) - strength(a)),
    }),
    [scoped],
  );

  const TABS: { id: Tab; label: string }[] = [
    { id: "recover", label: "À récupérer" },
    { id: "montante", label: "Qui montent" },
    { id: "winner", label: "Validées" },
    { id: "coupee", label: "Coupées" },
    { id: "copied", label: "Déjà copiées" },
    { id: "all", label: "Toutes" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Lecture du radar" className="scrollbar-thin flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-m)] border border-rule-1 bg-ink-1 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "press shrink-0 rounded-[7px] px-3 py-1.5 text-[13px]",
                tab === t.id ? "bg-ink-3 text-chalk-1" : "text-chalk-3 hover:text-chalk-1",
              )}
            >
              {t.label} <span className="num text-chalk-3">{lists[t.id].length}</span>
            </button>
          ))}
        </div>
        {competitors.length > 1 ? (
          <label className="flex items-center gap-2 text-[12px] text-chalk-3">
            Concurrent
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="h-9 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-2.5 text-[13px] text-chalk-1"
            >
              <option value="all">Tous</option>
              {competitors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {tab === "recover" ? (
        <p className="mt-3 max-w-[80ch] text-[13px] text-chalk-3">
          Créas fortes chez le concurrent (validées, qui montent ou à forte portée) pas encore copiées : leur script n&apos;est pas déjà dans ton adset
          et aucune de tes pubs n&apos;y est reliée. Une itération d&apos;un script déjà testé est acceptée. Le Studio Ads en fait des briefs.
        </p>
      ) : tab === "copied" ? (
        <p className="mt-3 max-w-[80ch] text-[13px] text-chalk-3">
          Créas concurrentes reliées à une de tes pubs (confirmé dans le détail de la pub, ou depuis le Studio quand tu lances un brief).
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lists[tab].map((a) => (
          <AdCard key={`${a.competitorId}:${a.id}`} ad={a} shopSlug={shopSlug} />
        ))}
      </div>
      {!lists[tab].length ? (
        <div className="mt-4 rounded-[var(--radius-l)] border border-dashed border-rule-2 px-5 py-8 text-center text-[13px] text-chalk-3">
          {tab === "recover"
            ? "Rien à récupérer pour l'instant : toutes les créas fortes sont déjà testées, ignorées ou trop récentes."
            : tab === "coupee"
              ? "Aucune créa coupée depuis le dernier relevé."
              : tab === "copied"
                ? "Aucune pub reliée pour l'instant : ouvre une pub dans le cockpit et confirme sa source concurrente."
              : "Rien dans cette lecture pour l'instant."}
        </div>
      ) : null}
    </div>
  );
}

function AdCard({ ad, shopSlug }: { ad: CompetitorAdView; shopSlug: string }) {
  const [playing, setPlaying] = useState(false);
  const [pending, start] = useTransition();
  const [flag, setLocalFlag] = useState(ad.userFlag ?? null);
  const libId = ad.id.replace(/^facebook_/, "");
  const media = ad.mediaUrl;
  const poster = ad.thumbnailUrl ?? (ad.mediaType === "image" ? ad.mediaUrl : null);

  const toggle = (f: NonNullable<CompetitorAdView["userFlag"]>) =>
    start(async () => {
      const next = flag === f ? null : f;
      setLocalFlag(next);
      const r = await setFlag({ slug: shopSlug, competitorId: ad.competitorId, adId: ad.id, flag: next });
      if (!r.ok) setLocalFlag(flag);
    });

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-l)] border border-rule-1 bg-ink-1">
      <div className="relative aspect-[4/5] bg-ink-well">
        {ad.mediaType === "video" && media && playing ? (
          <video src={media} poster={poster ?? undefined} controls autoPlay playsInline className="size-full bg-black object-contain" />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center px-6 text-center text-[13px] leading-5 text-chalk-3">
            {ad.mediaType === "video" ? "Vidéo sans miniature" : "Visuel indisponible"}
          </div>
        )}
        {ad.mediaType === "video" && media && !playing ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="press absolute inset-0 grid place-items-center bg-black/10 hover:bg-black/25"
            aria-label="Lire la vidéo"
          >
            <span className="grid size-12 place-items-center rounded-full bg-black/70 text-white">
              <Play className="ml-0.5 size-5" aria-hidden />
            </span>
          </button>
        ) : null}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {ad.read.signals
            .filter((s) => s !== "stable")
            .map((s) => (
              <span key={s} className="rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium" style={{ color: SIGNAL[s].fg, background: "rgba(5,6,7,0.82)" }}>
                {SIGNAL[s].label}
              </span>
            ))}
          {ad.copiedBy.length ? (
            <span className="rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium text-chalk-1" style={{ background: "rgba(5,6,7,0.82)" }}>
              ◆ Copiée
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="font-medium text-chalk-1">{ad.competitorName}</span>
          <a
            href={`https://www.facebook.com/ads/library/?id=${libId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-chalk-3 hover:text-chalk-1"
          >
            Bibliothèque Meta <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>

        <dl className="grid grid-cols-4 gap-2 border-y border-rule-1 py-2.5" title="Sous-valeurs : évolution sur 7 jours">
          <Stat label="Jours" value={int(ad.daysRunning)} />
          <Stat label="Portée" value={compact(ad.reach)} sub={ad.reachDelta7d ? `+${compact(ad.reachDelta7d)}` : undefined} />
          <Stat label="Rang" value={ad.currentRank != null ? `#${ad.currentRank}` : "—"} sub={ad.rankDelta ? signed(ad.rankDelta) : undefined} tone={ad.rankDelta && ad.rankDelta > 0 ? "var(--signal)" : undefined} />
          <Stat label="Dép. est." value={eur(ad.estimatedSpend, 0)} />
        </dl>

        {ad.transcript || ad.body ? (
          <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-5 text-chalk-2">{ad.transcript ?? ad.body}</p>
        ) : null}

        {ad.copiedBy.length ? (
          <p className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-chalk-3">Copiée par</span>
            {ad.copiedBy.map((c) => (
              <a key={c.adId} href={`/${shopSlug}?ad=${c.adId}`} className="rounded-[5px] bg-ink-3 px-1.5 py-0.5 text-chalk-1 hover:bg-ink-4">
                {c.name}
              </a>
            ))}
          </p>
        ) : null}

        <p className={clsx("text-[12px] leading-5", ad.read.recoverable ? "text-keep" : "text-chalk-3")}>
          {ad.read.recoverReason}
          {ad.ai ? <span className="block text-chalk-3">Angle : {(ad.ai as { angle?: string }).angle ?? "—"}</span> : null}
        </p>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1" aria-busy={pending}>
          {(
            [
              ["deja_teste", "Déjà testée"],
              ["iteration", "Itération"],
              ["ignore", "Ignorer"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={flag === f}
              onClick={() => toggle(f)}
              className={clsx(
                "press h-8 rounded-[7px] border px-2.5 text-[12px]",
                flag === f ? "border-rule-3 bg-ink-3 text-chalk-1" : "border-rule-1 text-chalk-3 hover:border-rule-2 hover:text-chalk-1",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-chalk-3">{label}</dt>
      <dd className="num truncate text-[13px]" style={{ color: tone ?? "var(--chalk-1)" }}>
        {value}
      </dd>
      {sub ? <dd className="num truncate text-[11px] text-chalk-3">{sub}</dd> : null}
    </div>
  );
}
