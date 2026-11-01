import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoMode } from "@/lib/env";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { decrypt, encrypt, last4 } from "@/lib/crypto";

/**
 * Couche d'accès : qui est connecté, à quels espaces il appartient, quel espace est actif
 * (cookie), et les clés de cet espace. Toute page et toute action passent par ici avant de
 * lire ou d'écrire : les requêtes suivantes sont toujours filtrées sur l'espace vérifié.
 */

export interface Viewer {
  id: string;
  email: string;
  isAdmin: boolean;
  demo: boolean;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  role: "owner" | "member";
}

export interface Workspace extends WorkspaceRef {
  pnlSpreadsheetId: string | null;
}

export interface Ctx {
  viewer: Viewer;
  workspace: Workspace;
  workspaces: WorkspaceRef[];
}

export const ACTIVE_COOKIE = "verdict_ws";
const DEMO_WS: Workspace = { id: "demo", name: "Espace démo", role: "owner", pnlSpreadsheetId: null };

export async function requireViewer(): Promise<Viewer> {
  if (demoMode) return { id: "demo", email: "demo@verdict.local", isAdmin: true, demo: true };
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub) redirect("/login");
  const { data: admin } = await supabaseAdmin().from("platform_admins").select("user_id").eq("user_id", claims.sub).maybeSingle();
  return { id: claims.sub, email: claims.email ?? "", isAdmin: Boolean(admin), demo: false };
}

export async function listWorkspaces(userId: string): Promise<WorkspaceRef[]> {
  const { data, error } = await supabaseAdmin()
    .from("workspace_members")
    .select("role, workspaces(id, name)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return (data ?? [])
    .map((r) => {
      const w = r.workspaces as unknown as { id: string; name: string } | null;
      return w ? { id: w.id, name: w.name, role: r.role as WorkspaceRef["role"] } : null;
    })
    .filter((w): w is WorkspaceRef => w !== null);
}

/** Espace actif vérifié. Sans espace : page d'explication (ou admin pour un administrateur). */
export async function requireWorkspace(opts: { owner?: boolean } = {}): Promise<Ctx> {
  const viewer = await requireViewer();
  if (viewer.demo) return { viewer, workspace: DEMO_WS, workspaces: [DEMO_WS] };
  const workspaces = await listWorkspaces(viewer.id);
  if (!workspaces.length) redirect(viewer.isAdmin ? "/admin" : "/sans-espace");
  const wanted = (await cookies()).get(ACTIVE_COOKIE)?.value;
  const ref = workspaces.find((w) => w.id === wanted) ?? workspaces[0];
  if (opts.owner && ref.role !== "owner") throw new Error("Réservé au propriétaire de l'espace");
  const { data } = await supabaseAdmin().from("workspaces").select("pnl_spreadsheet_id").eq("id", ref.id).single();
  return { viewer, workspace: { ...ref, pnlSpreadsheetId: data?.pnl_spreadsheet_id ?? null }, workspaces };
}

// ---------- Clés de l'espace ----------
export type SecretKind = "meta" | "trendtrack" | "anthropic";
const COLUMN: Record<SecretKind, "meta_token" | "trendtrack_key" | "anthropic_key"> = {
  meta: "meta_token",
  trendtrack: "trendtrack_key",
  anthropic: "anthropic_key",
};

export interface Credentials {
  meta: string | null;
  trendtrack: string | null;
  anthropic: string | null;
}

export async function getCredentials(workspaceId: string): Promise<Credentials> {
  if (workspaceId === "demo") return { meta: null, trendtrack: null, anthropic: null };
  const { data } = await supabaseAdmin()
    .from("workspace_secrets")
    .select("meta_token, trendtrack_key, anthropic_key")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return {
    meta: decrypt(data?.meta_token),
    trendtrack: decrypt(data?.trendtrack_key),
    anthropic: decrypt(data?.anthropic_key),
  };
}

/** Ce que l'interface peut voir des clés : présence, 4 derniers caractères, lisibilité. */
export async function credentialStatus(workspaceId: string) {
  if (workspaceId === "demo") {
    return Object.fromEntries((Object.keys(COLUMN) as SecretKind[]).map((k) => [k, { set: false, last4: null, readable: true }])) as Record<
      SecretKind,
      { set: boolean; last4: string | null; readable: boolean }
    >;
  }
  const { data } = await supabaseAdmin()
    .from("workspace_secrets")
    .select("meta_token, trendtrack_key, anthropic_key")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const out = {} as Record<SecretKind, { set: boolean; last4: string | null; readable: boolean }>;
  for (const k of Object.keys(COLUMN) as SecretKind[]) {
    const stored = data?.[COLUMN[k]] ?? null;
    const plain = decrypt(stored);
    out[k] = { set: Boolean(stored), last4: last4(plain), readable: !stored || plain !== null };
  }
  return out;
}

export async function storeSecret(workspaceId: string, kind: SecretKind, value: string | null, userId: string) {
  const { error } = await supabaseAdmin()
    .from("workspace_secrets")
    .upsert({
      workspace_id: workspaceId,
      [COLUMN[kind]]: value ? encrypt(value) : null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}
