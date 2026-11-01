import { googleServiceAccountEmail } from "@/lib/env";
import { credentialStatus, getCredentials, requireWorkspace } from "@/lib/workspace";
import { listCompetitors, listMembers, listPendingInvitations, listShops } from "@/lib/data/repo";
import { verifyMetaToken, type MetaAccount } from "@/lib/adapters/meta";
import { Shell } from "@/components/shell";
import { Notice } from "@/components/ui";
import { ShopSettings } from "./shop-settings";
import { ConnectionsPanel, MembersPanel, NewShopPanel, WorkspacePanel } from "./panels";

// Rendu à chaque requête : la session et les données ne sont jamais figées au build.
export const dynamic = "force-dynamic";

export const metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const ctx = await requireWorkspace();
  const { workspace, viewer } = ctx;
  const isOwner = workspace.role === "owner";
  const [shops, status, members, invites, creds] = await Promise.all([
    listShops(workspace.id),
    credentialStatus(workspace.id),
    listMembers(workspace.id),
    isOwner ? listPendingInvitations(workspace.id) : Promise.resolve([]),
    getCredentials(workspace.id),
  ]);
  const competitors = await Promise.all(shops.map((s) => listCompetitors(s)));

  let accounts: MetaAccount[] = [];
  let metaError: string | null = null;
  if (creds.meta) {
    try {
      accounts = (await verifyMetaToken(creds.meta)).accounts;
    } catch (e) {
      metaError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <Shell ctx={ctx} shops={shops} current={null} tab="reglages">
      <p className="eyebrow">Réglages</p>
      <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">{workspace.name}</h1>
      <p className="mt-1 text-[13px] text-chalk-3">
        Tout ici ne concerne que cet espace : ses connexions, ses boutiques, ses membres.
        {!shops.length ? " Commence par brancher Meta, puis ajoute ta première boutique." : ""}
      </p>

      {metaError ? (
        <div className="mt-4">
          <Notice tone="cut">Ton jeton Meta est refusé par Meta : {metaError}. Remplace-le dans Connexions.</Notice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {shops.map((s, i) => (
            <ShopSettings
              key={s.id}
              shop={s}
              competitors={competitors[i].map((c) => ({ id: c.id, name: c.name, brandtrackerId: c.brandtrackerId }))}
              accounts={accounts}
              isOwner={isOwner}
            />
          ))}
          <NewShopPanel accounts={accounts} />
        </div>
        <div className="space-y-5">
          <ConnectionsPanel status={status} isOwner={isOwner} />
          <WorkspacePanel
            name={workspace.name}
            pnlSpreadsheetId={workspace.pnlSpreadsheetId}
            serviceAccountEmail={googleServiceAccountEmail()}
            isOwner={isOwner}
          />
          <MembersPanel members={members} pending={invites} viewerId={viewer.id} isOwner={isOwner} />
        </div>
      </div>
    </Shell>
  );
}
