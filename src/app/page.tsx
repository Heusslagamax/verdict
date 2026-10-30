import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { listShops } from "@/lib/data/repo";

// Rendu à chaque requête : la session et les données ne sont jamais figées au build.
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireViewer();
  const shops = await listShops();
  redirect(shops[0] ? `/${shops[0].slug}` : "/reglages");
}
