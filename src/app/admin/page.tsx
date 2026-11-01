import { redirect } from "next/navigation";
import { listWorkspaces, requireViewer } from "@/lib/workspace";
import { listAllWorkspaces, listShops } from "@/lib/data/repo";
import { cookies } from "next/headers";
import { ACTIVE_COOKIE } from "@/lib/workspace";
import { Shell } from "@/components/shell";
import { Panel } from "@/components/ui";
import { AdminInvite, CancelAccountInvite } from "./admin-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin || viewer.demo) redirect("/");
  const [{ workspaces, pending }, mine] = await Promise.all([listAllWorkspaces(), listWorkspaces(viewer.id)]);
  const wanted = (await cookies()).get(ACTIVE_COOKIE)?.value;
  const current = mine.find((w) => w.id === wanted) ?? mine[0] ?? null;
  const shops = current ? await listShops(current.id) : [];
  const ctx = { viewer, workspace: current ? { ...current, pnlSpreadsheetId: null } : null, workspaces: mine };

  return (
    <Shell ctx={ctx} shops={shops.map((s) => ({ slug: s.slug, name: s.name }))}>
      <p className="eyebrow">Plateforme</p>
      <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">Admin</h1>
      <p className="mt-1 text-[13px] text-chalk-3">
        Ouvre l&apos;accès à Verdict pour une nouvelle personne : son espace, vide et privé, sera créé à sa première connexion. Elle y branchera ses propres
        clés Meta, TrendTrack et Anthropic.
      </p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="p-5">
          <h2 className="text-[17px] font-semibold">
            Espaces <span className="num text-[13px] font-normal text-chalk-3">{workspaces.length}</span>
          </h2>
          <table className="mt-3 w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-chalk-3">
                <th className="py-2 font-normal">Espace</th>
                <th className="py-2 font-normal">Propriétaire</th>
                <th className="py-2 text-right font-normal">Membres</th>
                <th className="py-2 text-right font-normal">Boutiques</th>
                <th className="hidden py-2 text-right font-normal sm:table-cell">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => (
                <tr key={w.id} className="border-t border-rule-1">
                  <td className="py-2.5 pr-3">{w.name}</td>
                  <td className="max-w-[220px] truncate py-2.5 pr-3 text-chalk-2">{w.owners.join(", ") || "—"}</td>
                  <td className="num py-2.5 text-right">{w.memberCount}</td>
                  <td className="num py-2.5 text-right">{w.shopCount}</td>
                  <td className="num hidden py-2.5 text-right text-chalk-3 sm:table-cell">{new Date(w.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-chalk-3">Tu vois ici qui a un espace, pas ce qu&apos;il contient : les données de chaque espace restent privées.</p>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5">
            <h2 className="text-[17px] font-semibold">Ouvrir un accès</h2>
            <AdminInvite />
          </Panel>
          <Panel className="p-5">
            <h2 className="text-[17px] font-semibold">
              Accès en attente <span className="num text-[13px] font-normal text-chalk-3">{pending.length}</span>
            </h2>
            <ul className="mt-2">
              {pending.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-t border-rule-1 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{p.email}</span>
                    <span className="block text-[12px] text-chalk-3">Espace « {p.workspace_name} »</span>
                  </span>
                  <CancelAccountInvite id={p.id} />
                </li>
              ))}
              {!pending.length ? <li className="py-2 text-[13px] text-chalk-3">Personne en attente.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
