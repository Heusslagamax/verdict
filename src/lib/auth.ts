import "server-only";
import { redirect } from "next/navigation";
import { demoMode } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export interface Viewer {
  id: string;
  email: string;
  demo: boolean;
}

/** Couche d'accès : vérifie la session ET l'appartenance aux membres, sinon /login. */
export async function requireViewer(): Promise<Viewer> {
  if (demoMode) return { id: "demo", email: "demo@verdict.local", demo: true };
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const { data: member } = await supabase.from("members").select("user_id,email").eq("user_id", claims.sub).maybeSingle();
  if (!member) redirect("/login?e=acces");
  return { id: member.user_id, email: member.email, demo: false };
}
