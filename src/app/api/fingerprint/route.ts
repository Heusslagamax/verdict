import { type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { fingerprintThumb } from "@/lib/data/rapprochement";

/** Image clé d'une créa analysée (pour les comparer côte à côte). Réservé aux membres de l'espace. */
export async function GET(req: NextRequest) {
  const { workspace } = await requireWorkspace();
  const q = req.nextUrl.searchParams;
  const kind = q.get("kind");
  const slug = q.get("shop") ?? "";
  const ref = q.get("ref") ?? "";
  const t = Number(q.get("t") ?? "0");
  if ((kind !== "own" && kind !== "competitor") || !ref || ref.length > 128 || !Number.isFinite(t)) return new Response("Requête invalide", { status: 400 });
  const img = await fingerprintThumb(workspace, slug, kind, ref, t);
  if (!img) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}
