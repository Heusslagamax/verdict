import { notFound } from "next/navigation";
import { Radar } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { buildRadar } from "@/lib/data/views";
import { relativeTime } from "@/lib/format";
import { Shell } from "@/components/shell";
import { RadarBoard } from "@/components/radar-board";
import { ActionButton } from "@/components/action-button";
import { Notice } from "@/components/ui";
import { refreshCompetitors } from "@/app/actions";

export const metadata = { title: "Radar concurrents" };

export default async function RadarPage({ params }: PageProps<"/[shop]/radar">) {
  const viewer = await requireViewer();
  const { shop: slug } = await params;
  const view = await buildRadar(slug);
  if (!view) notFound();

  const recover = view.ads.filter((a) => a.read.recoverable).length;
  const cut = view.ads.filter((a) => a.read.signals.includes("coupee")).length;

  return (
    <Shell shops={view.shops} current={slug} tab="radar" email={viewer.email} demo={view.sources.demo}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold">{view.shop.name} · radar concurrents</h1>
          <p className="mt-1 text-[13px] text-chalk-3">
            {view.competitors.map((c) => c.name).join(", ") || "Aucun concurrent suivi"} · {recover} créa{recover > 1 ? "s" : ""} à récupérer · {cut} coupée
            {cut > 1 ? "s" : ""}
            {" · "}relevé {view.sources.demo ? "démo" : relativeTime(view.lastSync?.at)}
            {view.lastSync?.credits != null ? ` · ${view.lastSync.credits.toLocaleString("fr-FR")} crédits TrendTrack restants` : ""}
          </p>
        </div>
        <ActionButton action={refreshCompetitors.bind(null, slug)} pendingLabel="Relevé en cours…" icon={<Radar className="size-3.5" aria-hidden />}>
          Relever maintenant
        </ActionButton>
      </div>

      <div className="mt-5 space-y-3">
        {!view.sources.trendtrack && !view.sources.demo ? (
          <Notice tone="watch">TrendTrack n&apos;est pas branché : ajoute TRENDTRACK_API_KEY (voir le guide de déploiement).</Notice>
        ) : null}
        {view.lastSync && !view.lastSync.ok ? <Notice tone="cut">Dernier relevé en échec : {view.lastSync.detail}</Notice> : null}
        {!view.sources.ai && !view.sources.demo ? (
          <Notice tone="wait">
            Sans clé Anthropic, la comparaison de scripts reste locale : elle ne reconnaît pas une traduction (français → italien). Marque à la main les créas déjà
            testées.
          </Notice>
        ) : null}
      </div>

      <div className="mt-5">
        <RadarBoard ads={view.ads} competitors={view.competitors.map((c) => ({ id: c.id, name: c.name }))} shopSlug={slug} />
      </div>
    </Shell>
  );
}
