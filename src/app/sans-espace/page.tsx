import { redirect } from "next/navigation";
import { listWorkspaces, requireViewer } from "@/lib/workspace";
import { Mark } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aucun espace" };

/** Compte connecté mais rattaché à aucun espace (retiré par un propriétaire, par exemple). */
export default async function NoWorkspacePage() {
  const viewer = await requireViewer();
  if (viewer.demo || (await listWorkspaces(viewer.id)).length) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-[420px]">
        <Mark size={26} />
        <h1 className="mt-8 text-[24px] font-semibold">Aucun espace pour ce compte</h1>
        <p className="mt-2 text-[14px] leading-6 text-chalk-2">
          Tu es connecté avec <span className="text-chalk-1">{viewer.email}</span>, mais aucun espace Verdict ne t&apos;est ouvert. Demande au propriétaire de
          l&apos;espace de t&apos;inviter, puis recharge cette page.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="press h-10 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-4 text-[13px] hover:border-rule-3">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
