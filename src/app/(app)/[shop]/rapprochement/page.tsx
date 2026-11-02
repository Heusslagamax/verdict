import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { buildRapprochement } from "@/lib/data/rapprochement";
import { Notice } from "@/components/ui";
import { RapprochementRunner } from "@/components/rapprochement/runner";
import { RapprochementResults } from "@/components/rapprochement/results";

export const metadata = { title: "Rapprochement" };
// Chaque appel traite une créa : extraction des images (ffmpeg) puis fiche IA.
export const maxDuration = 120;

export default async function RapprochementPage({ params }: PageProps<"/[shop]/rapprochement">) {
  const ctx = await requireWorkspace();
  const { shop: slug } = await params;
  const view = await buildRapprochement(ctx.workspace, slug);
  if (!view) notFound();
  const t = view.totals;

  return (
    <>
      <div>
        <p className="eyebrow">Rapprochement</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">{view.shop.name}</h1>
        <p className="mt-1 max-w-[86ch] text-[13px] leading-5 text-chalk-3">
          Verdict extrait les images clés de chaque vidéo (hook, milieu, fin), compare les plans par empreinte visuelle, fait la fiche de chaque créa (angle,
          message, hook) puis fait juger les meilleurs candidats par l&apos;IA, images à l&apos;appui. Tu confirmes : le radar sait alors ce qui est déjà copié.
        </p>
      </div>

      <div className="mt-5 space-y-3 empty:hidden">
        {view.sources.demo ? <Notice tone="wait">Mode démo : le rapprochement demande de vraies pubs Meta et une clé Anthropic.</Notice> : null}
        {!view.sources.ai && !view.sources.demo ? (
          <Notice tone="watch">
            Ajoute ta clé Anthropic dans <Link href="/reglages" className="underline underline-offset-4">Réglages → Connexions</Link>.
          </Notice>
        ) : null}
      </div>

      <section className="mt-6 rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <h2 className="text-[15px] font-semibold">Analyse</h2>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="eyebrow">Tes pubs (14 j)</dt>
                <dd className="figure mt-1 text-[24px]">
                  {t.ownDone}
                  <span className="text-[15px] font-normal text-chalk-3"> / {t.own} analysées</span>
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Créas concurrentes</dt>
                <dd className="figure mt-1 text-[24px]">
                  {t.competitorDone}
                  <span className="text-[15px] font-normal text-chalk-3"> / {t.competitor} analysées</span>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[12px] text-chalk-4">
              Chaque créa n&apos;est analysée qu&apos;une fois (les suivantes réutilisent son empreinte). Coût IA indicatif : 1 à 3 centimes par créa analysée et par pub
              rapprochée, sur ton compte Anthropic.
            </p>
          </div>
          <div className="lg:min-w-[440px]">
            <RapprochementRunner slug={slug} disabled={!view.sources.ai || view.sources.demo} />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
        <h2 className="text-[15px] font-semibold">Correspondances</h2>
        <p className="mb-4 mt-0.5 text-[12px] text-chalk-3">
          Pour chacune de tes pubs, la créa concurrente la plus proche, critère par critère. « Copie 1:1 » = mêmes images et même script (même traduit) ;
          « Itération » = même base avec un élément changé ; « Même angle » = autres images et autre script, même angle.
        </p>
        <RapprochementResults rows={view.rows} slug={slug} />
      </section>
    </>
  );
}
