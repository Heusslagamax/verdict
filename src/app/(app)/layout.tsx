import { requireWorkspace } from "@/lib/workspace";
import { listShopsForView } from "@/lib/data/repo";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

/**
 * Mise en page des écrans connectés : la coque (barre latérale, boutiques, écrans) est rendue
 * une fois et reste en place pendant la navigation ; seul le contenu change.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireWorkspace();
  const shops = await listShopsForView(ctx.workspace.id);
  return (
    <Shell ctx={ctx} shops={shops.map((s) => ({ slug: s.slug, name: s.name }))}>
      {children}
    </Shell>
  );
}
