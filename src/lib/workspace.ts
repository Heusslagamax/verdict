import "server-only";
import { cache } from "react";
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

// `cache` : une seule lecture par requête, même si la mise en page, la page et les actions
// demandent chacune qui est connecté.
const readClaims = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  return data?.claims as { sub?: string; email?: string } | undefined;
});

const isPlatformAdmin = cache(async (userId: string) => {
  const { data } = await supabaseAdmin().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
});

export const requireViewer = cache(async (): Promise<Viewer> => {
  if (demoMode) return { id: "demo", email: "demo@verdict.local", isAdmin: true, demo: true };
  const claims = await readClaims();
  if (!claims?.sub) redirect("/login");
  return { id: claims.sub, email: claims.email ?? "", isAdmin: await isPlatformAdmin(claims.sub), demo: false };
});

const readMemberships = cache(async (userId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("workspace_members")
    .select("role, workspaces(id, name, pnl_spreadsheet_id)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return (data ?? [])
    .map((r) => {
      const w = r.workspaces as unknown as { id: string; name: string; pnl_spreadsheet_id: string | null } | null;
      return w ? { id: w.id, name: w.name, role: r.role as WorkspaceRef["role"], pnlSpreadsheetId: w.pnl_spreadsheet_id ?? null } : null;
    })
    .filter((w): w is Workspace => w !== null);
});

export async function listWorkspaces(userId: string): Promise<WorkspaceRef[]> {
  return (await readMemberships(userId)).map(({ id, name, role }) => ({ id, name, role }));
}

const loadCtx = cache(async (): Promise<Ctx> => {
  if (demoMode) return { viewer: await requireViewer(), workspace: DEMO_WS, workspaces: [DEMO_WS] };
  const claims = await readClaims();
  if (!claims?.sub) redirect("/login");
  // Droits d'admin, espaces et cookie en parallèle : une seule attente réseau au lieu de trois.
  const [viewer, memberships, jar] = await Promise.all([requireViewer(), readMemberships(claims.sub), cookies()]);
  if (!memberships.length) redirect(viewer.isAdmin ? "/admin" : "/sans-espace");
  const wanted = jar.get(ACTIVE_COOKIE)?.value;
  const workspace = memberships.find((w) => w.id === wanted) ?? memberships[0];
  return { viewer, workspace, workspaces: memberships.map(({ id, name, role }) => ({ id, name, role })) };
});

/** Espace actif vérifié. Sans espace : page d'explication (ou admin pour un administrateur). */
export async function requireWorkspace(opts: { owner?: boolean } = {}): Promise<Ctx> {
  const ctx = await loadCtx();
  if (opts.owner && ctx.workspace.role !== "owner") throw new Error("Réservé au propriétaire de l'espace");
  return ctx;
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

export const getCredentials = cache(async (workspaceId: string): Promise<Credentials> => {
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
});

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
