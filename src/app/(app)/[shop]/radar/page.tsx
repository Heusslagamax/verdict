import { notFound } from "next/navigation";
import { Radar } from "lucide-react";
import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { buildRadar } from "@/lib/data/views";
import { relativeTime } from "@/lib/format";
import { RadarBoard } from "@/components/radar-board";
import { ActionButton } from "@/components/action-button";
import { Notice } from "@/components/ui";
import { WinnerMap } from "@/components/charts/winner-map";
import { refreshCompetitors } from "@/app/actions";

export const metadata = { title: "Radar concurrents" };

export default async function RadarPage({ params }: PageProps<"/[shop]/radar">) {
  const ctx = await requireWorkspace();
  const { shop: slug } = await params;
  const view = await buildRadar(ctx.workspace, slug);
  if (!view) notFound();

  const recover = view.ads.filter((a) => a.read.recoverable).length;
  const cut = view.ads.filter((a) => a.read.signals.includes("coupee")).length;
  const winners = view.ads.filter((a) => a.read.signals.includes("winner")).length;
  const rows = view.competitors.map((c) => {
    const own = view.ads.filter((a) => a.competitorId === c.id);
    return {
      id: c.id,
      name: c.name,
      active: own.filter((a) => a.status === "active").length,
      rising: own.filter((a) => a.read.signals.includes("montante")).length,
      winner: own.filter((a) => a.read.signals.includes("winner")).length,
      cut: own.filter((a) => a.read.signals.includes("coupee")).length,
      recover: own.filter((a) => a.read.recoverable).length,
      copied: own.filter((a) => a.copiedBy.length).length,
    };
  });
  const maxActive = Math.max(1, ...rows.map((r) => r.active));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Radar concurrents</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">{view.shop.name}</h1>
          <p className="mt-1 text-[12px] text-chalk-3">
            {view.competitors.map((c) => c.name).join(", ") || "Aucun concurrent suivi"}
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
          <Notice tone="watch">
            TrendTrack n&apos;est pas branché : ajoute ta clé dans{" "}
            <Link href="/reglages" className="underline underline-offset-4">Réglages → Connexions</Link>.
          </Notice>
        ) : null}
        {view.lastSync && !view.lastSync.ok ? <Notice tone="cut">Dernier relevé en échec : {view.lastSync.detail}</Notice> : null}
        {!view.sources.ai && !view.sources.demo ? (
          <Notice tone="wait">
            Sans clé Anthropic (Réglages → Connexions), la comparaison de scripts reste locale : elle ne reconnaît pas une traduction (français → italien). Marque à la main les créas déjà
            testées.
          </Notice>
        ) : null}
      </div>

      {view.ads.length ? (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <section className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
            <h2 className="text-[15px] font-semibold">
              {winners} créa{winners > 1 ? "s" : ""} validée{winners > 1 ? "s" : ""} chez tes concurrents, {recover} à récupérer
            </h2>
            <p className="mt-0.5 text-[12px] text-chalk-3">
              Plus une créa tourne longtemps et touche de monde, plus elle rapporte. En bleu : à récupérer (script différent du tien). Carré rouge : coupée.
            </p>
            <div className="mt-4">
              <WinnerMap ads={view.ads} />
            </div>
          </section>
          <section className="rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5">
            <h2 className="text-[15px] font-semibold">Activité par concurrent</h2>
            <p className="mt-0.5 text-[12px] text-chalk-3">Créas actives et mouvements depuis le dernier relevé.</p>
            <table className="mt-4 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-chalk-4">
                  <th className="pb-2 font-normal">Concurrent</th>
                  <th className="pb-2 text-right font-normal">Monte</th>
                  <th className="pb-2 text-right font-normal">Validées</th>
                  <th className="pb-2 text-right font-normal">Coupées</th>
                  <th className="pb-2 text-right font-normal">Copiées</th>
                  <th className="pb-2 text-right font-normal">À récupérer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-rule-1">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-ink-3">
                          <div className="h-full rounded-full bg-chalk-3" style={{ width: `${(r.active / maxActive) * 100}%` }} />
                        </div>
                        <span className="num shrink-0 text-[11px] text-chalk-3">{r.active} actives</span>
                      </div>
                    </td>
                    <td className="num py-3 text-right" style={{ color: r.rising ? "var(--signal)" : "var(--chalk-4)" }}>{r.rising}</td>
                    <td className="num py-3 text-right" style={{ color: r.winner ? "var(--keep)" : "var(--chalk-4)" }}>{r.winner}</td>
                    <td className="num py-3 text-right" style={{ color: r.cut ? "var(--cut)" : "var(--chalk-4)" }}>{r.cut}</td>
                    <td className="num py-3 text-right" style={{ color: r.copied ? "var(--chalk-1)" : "var(--chalk-4)" }}>{r.copied}</td>
                    <td className="py-3 text-right">
                      <span className="figure text-[18px]" style={{ color: r.recover ? "var(--chalk-1)" : "var(--chalk-4)" }}>{r.recover}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] text-chalk-3">
              {cut} créa{cut > 1 ? "s" : ""} coupée{cut > 1 ? "s" : ""} depuis le dernier relevé : un concurrent qui coupe une créa te dit ce qui ne marche plus.
            </p>
          </section>
        </div>
      ) : null}

      <div className="mt-6">
        <RadarBoard ads={view.ads} competitors={view.competitors.map((c) => ({ id: c.id, name: c.name }))} shopSlug={slug} />
      </div>
    </>
  );
}
