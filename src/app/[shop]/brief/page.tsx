import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCredentials, requireWorkspace } from "@/lib/workspace";
import { getShop, latestBrief, listShops } from "@/lib/data/repo";
import { relativeTime } from "@/lib/format";
import { Shell } from "@/components/shell";
import { ActionButton } from "@/components/action-button";
import { Notice, Panel } from "@/components/ui";
import { generateBrief } from "@/app/actions";

export const metadata = { title: "Brief IA" };

const PRIORITY = { haute: "var(--cut)", moyenne: "var(--watch)", basse: "var(--wait)" } as const;

export default async function BriefPage({ params }: PageProps<"/[shop]/brief">) {
  const ctx = await requireWorkspace();
  const { shop: slug } = await params;
  const [shop, shops, creds] = await Promise.all([getShop(ctx.workspace.id, slug), listShops(ctx.workspace.id), getCredentials(ctx.workspace.id)]);
  if (!shop) notFound();
  const brief = await latestBrief(shop);

  return (
    <Shell ctx={ctx} shops={shops} current={slug} tab="brief">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Brief du matin</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">{shop.name}</h1>
          <p className="mt-1 text-[13px] text-chalk-3">
            {brief ? `Rédigé ${relativeTime(brief.createdAt)}` : "Pas encore de brief"} · généré chaque matin vers 6 h 30, à partir des verdicts du moteur et du radar
          </p>
        </div>
        <ActionButton action={generateBrief.bind(null, slug)} pendingLabel="Rédaction…" icon={<Sparkles className="size-3.5" aria-hidden />}>
          Rédiger maintenant
        </ActionButton>
      </div>

      {!creds.anthropic && !ctx.viewer.demo ? (
        <div className="mt-5">
          <Notice tone="watch">
            Ajoute ta clé Anthropic dans <Link href="/reglages" className="underline underline-offset-4">Réglages → Connexions</Link> pour activer le brief.
          </Notice>
        </div>
      ) : null}

      {brief ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="rise p-6">
            <p className="max-w-[60ch] text-[20px] font-medium leading-8 tracking-[-0.01em]">{brief.content.headline}</p>
            <ol className="mt-6 space-y-4">
              {brief.content.actions.map((a, i) => (
                <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-t border-rule-1 pt-4">
                  <span className="num text-[13px] text-chalk-3">{i + 1}.</span>
                  <div>
                    <p className="text-[15px] leading-6">
                      <span aria-hidden className="mr-2 inline-block size-1.5 -translate-y-[2px] rounded-full" style={{ background: PRIORITY[a.priority] }} />
                      {a.action}
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-chalk-3">{a.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <div className="space-y-5">
            <Panel className="p-5">
              <h2 className="text-[14px] font-medium">Créas à récupérer</h2>
              {brief.content.recover.length ? (
                <ul className="mt-3 space-y-3">
                  {brief.content.recover.map((r) => (
                    <li key={r.competitorAdId} className="border-t border-rule-1 pt-3 text-[13px]">
                      <p className="text-chalk-1">{r.angle}</p>
                      <p className="mt-0.5 text-chalk-3">{r.why}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-chalk-3">Rien de nouveau à reprendre aujourd&apos;hui.</p>
              )}
              <Link href={`/${slug}/radar`} className="mt-4 inline-block text-[13px] text-signal hover:underline">
                Ouvrir le radar
              </Link>
            </Panel>
            <Panel className="p-5">
              <h2 className="text-[14px] font-medium">Alertes</h2>
              {brief.content.alerts.length ? (
                <ul className="mt-3 space-y-2 text-[13px] text-chalk-2">
                  {brief.content.alerts.map((a, i) => (
                    <li key={i} className="border-t border-rule-1 pt-2">
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-chalk-3">Aucune alerte.</p>
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <Panel className="mt-6 p-8 text-center">
          <p className="text-[15px] font-medium">Le premier brief arrive demain matin</p>
          <p className="mt-1 text-[13px] text-chalk-3">Ou lance-le tout de suite avec « Rédiger maintenant ».</p>
        </Panel>
      )}
    </Shell>
  );
}
