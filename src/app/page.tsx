import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { listShops } from "@/lib/data/repo";

// Rendu à chaque requête : la session et les données ne sont jamais figées au build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { workspace } = await requireWorkspace();
  const shops = await listShops(workspace.id);
  redirect(shops[0] ? `/${shops[0].slug}` : "/reglages");
}
