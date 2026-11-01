import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { buildStudio } from "@/lib/data/studio";
import { compact, eur, pct, roas as fmtRoas } from "@/lib/format";
import { Notice } from "@/components/ui";
import { SourceList, type StudioSourceItem } from "@/components/studio/source-list";
import { BriefBoard } from "@/components/studio/brief-board";

export const metadata = { title: "Studio Ads" };
// La rédaction des briefs par l'IA prend 20 à 40 secondes.
export const maxDuration = 120;

export default async function StudioPage({ params }: PageProps<"/[shop]/studio">) {
  const ctx = await requireWorkspace();
  const { shop: slug } = await params;
  const view = await buildStudio(ctx.workspace, slug);
  if (!view) notFound();

  const count = (id: string) => view.briefs.filter((b) => b.sourceId === id).length;
  const own: StudioSourceItem[] = view.own.map((s) => ({
    kind: "own",
    id: s.ad.id,
    name: s.ad.name,
    thumbnailUrl: s.ad.creative.thumbnailUrl ?? s.ad.creative.imageUrl,
    isVideo: Boolean(s.ad.creative.videoId),
    facts: `${eur(s.ad.totals.spend, 0)} · ${pct(s.ad.share)} du budget · ROAS ${fmtRoas(s.ad.totals.roas)} · ${s.ad.totals.purchases} achat${s.ad.totals.purchases > 1 ? "s" : ""} (7 j)`,
    verdict: s.ad.verdict?.code ?? null,
    text: s.ad.script ?? s.ad.creative.body,
    diagnosis: s.diagnosis,
    briefCount: count(s.ad.id),
  }));
  const competitors: StudioSourceItem[] = view.competitors.map((s) => ({
    kind: "competitor",
    id: s.ad.id,
    name: `${s.ad.competitorName} · ${s.ad.mediaType === "image" ? "statique" : "vidéo"}`,
    thumbnailUrl: s.ad.thumbnailUrl,
    isVideo: s.ad.mediaType !== "image",
    facts: `${s.ad.reach != null ? `${compact(s.ad.reach)} portée` : "portée inconnue"}${s.ad.daysRunning != null ? ` · ${s.ad.daysRunning} j de diffusion` : ""}`,
    verdict: null,
    text: s.ad.transcript ?? s.ad.body,
    diagnosis: s.diagnosis,
    briefCount: count(s.ad.id),
  }));

  return (
    <>
      <div>
        <p className="eyebrow">Studio Ads</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">{view.shop.name}</h1>
        <p className="mt-1 max-w-[80ch] text-[13px] leading-5 text-chalk-3">
          Le moteur choisit quoi itérer à partir de tes chiffres (règles Zecom créas, crea-1-1, bibliothèque DTC) ; l&apos;IA écrit les briefs dans ce cadre. Tu
          suis chaque brief jusqu&apos;à la pub lancée et son résultat.
        </p>
      </div>

      <div className="mt-5 space-y-3 empty:hidden">
        {!view.sources.ai && !view.sources.demo ? (
          <Notice tone="watch">
            Ajoute ta clé Anthropic dans <Link href="/reglages" className="underline underline-offset-4">Réglages → Connexions</Link> pour générer les briefs.
          </Notice>
        ) : null}
        {view.sources.demo ? <Notice tone="wait">Mode démo : la génération demande une vraie clé Anthropic.</Notice> : null}
        {!view.thresholds ? (
          <Notice tone="watch">
            Seuils manquants : sans eux, le moteur ne sait pas quelles pubs sont gagnantes. <Link href="/reglages" className="underline underline-offset-4">Réglages</Link>.
          </Notice>
        ) : null}
        {!view.shop.productBrief ? (
          <Notice tone="wait">
            Astuce : renseigne la fiche produit de {view.shop.name} (produit, offre, promesse, avatar) dans{" "}
            <Link href="/reglages" className="underline underline-offset-4">Réglages</Link> : les briefs seront plus justes.
          </Notice>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-48px)] xl:overflow-y-auto scrollbar-thin">
          <h2 className="text-[15px] font-semibold">Sources d&apos;itération</h2>
          {view.ownExcluded ? (
            <p className="mt-0.5 text-[12px] text-chalk-4">
              {view.ownExcluded} pub{view.ownExcluded > 1 ? "s" : ""} écartée{view.ownExcluded > 1 ? "s" : ""} : pas assez de dépense ou perdante{view.ownExcluded > 1 ? "s" : ""} (Zecom 3.2).
            </p>
          ) : null}
          <div className="mt-4">
            <SourceList own={own} competitors={competitors} shopSlug={slug} aiReady={view.sources.ai} />
          </div>
        </section>
        <section className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
          <h2 className="text-[15px] font-semibold">
            Briefs <span className="num text-[13px] font-normal text-chalk-3">{view.briefs.length}</span>
          </h2>
          <p className="mb-4 mt-0.5 text-[12px] text-chalk-3">
            Relie un brief à la pub que tu as lancée : son résultat s&apos;affiche ici, et si le brief reprend une créa concurrente, la source est confirmée dans le radar.
          </p>
          <BriefBoard briefs={view.briefs} launchable={view.launchable} results={view.results} shopSlug={slug} />
        </section>
      </div>
    </>
  );
}
