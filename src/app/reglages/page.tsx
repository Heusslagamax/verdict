import { requireViewer } from "@/lib/auth";
import { demoMode, env, features } from "@/lib/env";
import { listCompetitors, listShops } from "@/lib/data/repo";
import { Shell } from "@/components/shell";
import { Panel } from "@/components/ui";
import { ShopSettings } from "./shop-settings";

// Rendu à chaque requête : la session et les données ne sont jamais figées au build.
export const dynamic = "force-dynamic";

export const metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const shops = await listShops();
  const competitors = await Promise.all(shops.map((s) => listCompetitors(s)));

  const integrations = [
    { name: "Base et connexion (Supabase)", ok: features.supabase, hint: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY" },
    { name: "Meta Ads (lecture seule)", ok: features.meta, hint: `META_ACCESS_TOKEN · API ${env.metaGraphVersion}` },
    { name: "TrendTrack", ok: features.trendtrack, hint: `TRENDTRACK_API_KEY · ${env.trendtrackRows} lignes par appel` },
    { name: "IA Anthropic", ok: features.ai, hint: `ANTHROPIC_API_KEY · modèle ${env.anthropicModel}` },
    { name: "P&L Google Sheets", ok: features.pnl, hint: "GOOGLE_SERVICE_ACCOUNT_JSON, PNL_SPREADSHEET_ID" },
  ];

  return (
    <Shell shops={shops.map((s) => ({ slug: s.slug, name: s.name }))} current={null} tab="reglages" email={viewer.email} demo={demoMode}>
      <h1 className="text-[24px] font-semibold">Réglages</h1>
      <p className="mt-1 text-[13px] text-chalk-3">Seuils par boutique, colonnes du P&L, concurrents suivis et état des branchements.</p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {shops.map((s, i) => (
            <ShopSettings
              key={s.id}
              shop={s}
              competitors={competitors[i].map((c) => ({ id: c.id, name: c.name, brandtrackerId: c.brandtrackerId }))}
            />
          ))}
        </div>
        <Panel className="h-fit p-5">
          <h2 className="text-[14px] font-medium">Branchements</h2>
          <ul className="mt-3">
            {integrations.map((x) => (
              <li key={x.name} className="border-t border-rule-1 py-3">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{x.name}</span>
                  <span className={x.ok ? "text-keep" : "text-chalk-3"}>{x.ok ? "Branché" : "Absent"}</span>
                </div>
                <p className="num mt-1 break-words text-[11px] text-chalk-3">{x.hint}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-5 text-chalk-3">
            Les clés se règlent dans Vercel (Settings, Environment Variables), jamais dans le code. Le cockpit n&apos;a aucun droit d&apos;écriture sur Meta.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}
