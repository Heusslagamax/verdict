import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { RefreshCw } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { buildCockpit, type CampaignView, type CockpitView } from "@/lib/data/views";
import type { Window } from "@/lib/types";
import { CampaignBoard } from "@/components/cockpit/campaign-board";
import { PeriodView } from "@/components/cockpit/period-view";
import { MetaAutoSync } from "@/components/cockpit/meta-auto-sync";
import { ActionButton } from "@/components/action-button";
import { Notice, Panel } from "@/components/ui";
import { refreshMeta } from "@/app/actions";

export const metadata = { title: "Cockpit" };

const WINDOWS: Window[] = ["1d", "3d", "7d"];

export default async function CockpitPage({ params, searchParams }: PageProps<"/[shop]">) {
  const ctx = await requireWorkspace();
  const { shop: slug } = await params;
  const sp = await searchParams;
  const w = (typeof sp.w === "string" && WINDOWS.includes(sp.w as Window) ? sp.w : "7d") as Window;
  const view = await buildCockpit(ctx.workspace, slug, w);
  if (!view) notFound();

  const activeCount = view.campaigns.filter((c) => c.status === "ACTIVE").length;
  const pnlState = view.sources.pnl ? (view.pnl?.error ? "P&L en erreur" : "P&L branché") : "P&L non branché";
  const summary = Object.fromEntries(
    WINDOWS.map((x) => {
      const active = view.byWindow[x].filter((c) => c.status === "ACTIVE");
      return [x, { cut: active.reduce((a, c) => a + c.counts.cut, 0), iterate: active.reduce((a, c) => a + c.counts.iterate, 0) }];
    }),
  ) as Record<Window, { cut: number; iterate: number }>;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Cockpit · {view.shop.market}</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">{view.shop.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-chalk-3">
            <span>
              {activeCount} campagne{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""}
            </span>
            <MetaAutoSync slug={slug} stale={view.stale} fetchedAt={view.fetchedAt} demo={view.sources.demo} failed={Boolean(view.syncError)} />
            <span className="inline-flex items-center gap-1.5">
              <span className={clsx("size-1.5 rounded-full", view.sources.pnl && !view.pnl?.error ? "bg-keep" : "bg-watch")} />
              {pnlState}
            </span>
          </p>
        </div>
        <ActionButton action={refreshMeta.bind(null, slug)} pendingLabel="Synchronisation…" icon={<RefreshCw className="size-3.5" aria-hidden />}>
          Rafraîchir Meta
        </ActionButton>
      </div>

      <div className="mt-5 space-y-3 empty:hidden">
        {view.syncError ? <Notice tone="cut">Dernière synchronisation Meta en échec : {view.syncError}. Données affichées : dernier relevé réussi.</Notice> : null}
        {!view.sources.meta && !view.sources.demo ? (
          <Notice tone="watch">
            Meta n&apos;est pas branché pour cette boutique : ajoute ton jeton dans{" "}
            <Link href="/reglages" className="underline underline-offset-4">Réglages → Connexions</Link>, puis choisis son compte publicitaire.
          </Notice>
        ) : null}
        {!view.thresholds ? (
          <Notice tone="watch">
            Seuils manquants pour {view.shop.name}. <Link href="/reglages" className="underline underline-offset-4">Renseigne-les dans Réglages</Link> pour activer les verdicts et les graphiques.
          </Notice>
        ) : null}
      </div>

      <div className="mt-6">
        <PeriodView
          initial={w}
          summary={summary}
          panels={{
            "1d": <Boards view={view} campaigns={view.byWindow["1d"]} window="1d" slug={slug} />,
            "3d": <Boards view={view} campaigns={view.byWindow["3d"]} window="3d" slug={slug} />,
            "7d": <Boards view={view} campaigns={view.byWindow["7d"]} window="7d" slug={slug} />,
          }}
        />
      </div>
    </>
  );
}

function Boards({ view, campaigns, window, slug }: { view: CockpitView; campaigns: CampaignView[]; window: Window; slug: string }) {
  const active = campaigns.filter((c) => c.status === "ACTIVE");
  const paused = campaigns.filter((c) => c.status !== "ACTIVE");
  return (
    <div className="space-y-12">
      {active.map((c) => (
        <CampaignBoard key={c.id} c={c} t={view.thresholds} window={window} shopSlug={slug} pnl={view.pnl} />
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
          <div className="space-y-12 p-4 pt-2">
            {paused.map((c) => (
              <CampaignBoard key={c.id} c={c} t={view.thresholds} window={window} shopSlug={slug} pnl={view.pnl} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
