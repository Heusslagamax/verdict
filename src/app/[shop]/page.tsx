import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { RefreshCw } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { buildCockpit } from "@/lib/data/views";
import { relativeTime, WINDOW_LABEL } from "@/lib/format";
import type { Window } from "@/lib/types";
import { Shell } from "@/components/shell";
import { CampaignSection } from "@/components/campaign-section";
import { ActionButton } from "@/components/action-button";
import { Notice, Panel } from "@/components/ui";
import { refreshMeta } from "@/app/actions";

export const metadata = { title: "Cockpit" };

const WINDOWS: Window[] = ["1d", "3d", "7d"];

export default async function CockpitPage({ params, searchParams }: PageProps<"/[shop]">) {
  const viewer = await requireViewer();
  const { shop: slug } = await params;
  const sp = await searchParams;
  const w = (typeof sp.w === "string" && WINDOWS.includes(sp.w as Window) ? sp.w : "7d") as Window;
  const view = await buildCockpit(slug, w);
  if (!view) notFound();

  const active = view.campaigns.filter((c) => c.status === "ACTIVE");
  const paused = view.campaigns.filter((c) => c.status !== "ACTIVE");
  const totalCut = active.reduce((a, c) => a + c.counts.cut, 0);
  const totalIterate = active.reduce((a, c) => a + c.counts.iterate, 0);

  return (
    <Shell shops={view.shops} current={slug} tab="cockpit" email={viewer.email} demo={view.sources.demo}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold">{view.shop.name} · cockpit</h1>
          <p className="mt-1 text-[13px] text-chalk-3">
            {active.length} campagne{active.length > 1 ? "s" : ""} active{active.length > 1 ? "s" : ""}
            {active.length ? ` · ${totalCut} ad${totalCut > 1 ? "s" : ""} à couper · ${totalIterate} à itérer` : ""}
            {" · "}Meta {view.sources.demo ? "démo" : relativeTime(view.fetchedAt)}
            {view.sources.pnl ? (view.pnl?.error ? " · P&L en erreur" : " · P&L branché") : " · P&L non branché"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Période" className="flex rounded-[var(--radius-m)] border border-rule-1 bg-ink-1 p-0.5">
            {WINDOWS.map((x) => (
              <Link
                key={x}
                href={`/${slug}?w=${x}`}
                aria-current={x === w ? "true" : undefined}
                className={clsx("rounded-[7px] px-3 py-1.5 text-[13px]", x === w ? "bg-ink-3 text-chalk-1" : "text-chalk-3 hover:text-chalk-1")}
              >
                {WINDOW_LABEL[x]}
              </Link>
            ))}
          </nav>
          <ActionButton action={refreshMeta.bind(null, slug)} pendingLabel="Synchronisation…" icon={<RefreshCw className="size-3.5" aria-hidden />}>
            Rafraîchir Meta
          </ActionButton>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {view.syncError ? <Notice tone="cut">Dernière synchronisation Meta en échec : {view.syncError}. Données affichées : dernier relevé réussi.</Notice> : null}
        {!view.sources.meta && !view.sources.demo ? (
          <Notice tone="watch">Meta n&apos;est pas branché : ajoute META_ACCESS_TOKEN (voir le guide de déploiement).</Notice>
        ) : null}
        {!view.thresholds ? (
          <Notice tone="watch">
            Seuils manquants pour {view.shop.name}. <Link href="/reglages" className="underline underline-offset-4">Renseigne-les dans Réglages</Link> pour activer les verdicts.
          </Notice>
        ) : null}
      </div>

      <div className="mt-5 space-y-5">
        {active.map((c) => (
          <CampaignSection key={c.id} c={c} t={view.thresholds} window={w} shopSlug={slug} pnl={view.pnl} />
        ))}
        {!active.length ? (
          <Panel className="p-8 text-center">
            <p className="text-[15px] font-medium">Aucune campagne active sur ce compte</p>
            <p className="mt-1 text-[13px] text-chalk-3">Les campagnes en pause restent visibles ci-dessous.</p>
          </Panel>
        ) : null}
        {paused.length ? (
          <details className="group rounded-[var(--radius-l)] border border-rule-1">
            <summary className="cursor-pointer list-none px-5 py-3 text-[13px] text-chalk-2 hover:text-chalk-1">
              Campagnes en pause <span className="num text-chalk-3">{paused.length}</span>
            </summary>
            <div className="space-y-5 p-3 pt-0">
              {paused.map((c) => (
                <CampaignSection key={c.id} c={c} t={view.thresholds} window={w} shopSlug={slug} pnl={view.pnl} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </Shell>
  );
}
