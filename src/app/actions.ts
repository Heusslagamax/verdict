"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { demoMode } from "@/lib/env";
import * as repo from "@/lib/data/repo";
import { runAiMatches, syncCompetitors, syncMeta } from "@/lib/data/sync";
import { briefPayload, buildCockpit, buildRadar } from "@/lib/data/views";
import { verifyAnthropicKey, writeMorningBrief } from "@/lib/adapters/ai";
import { lookup, verifyTrendtrackKey } from "@/lib/adapters/trendtrack";
import { verifyMetaToken, type MetaAccount } from "@/lib/adapters/meta";
import {
  ACTIVE_COOKIE,
  getCredentials,
  listWorkspaces,
  requireViewer,
  requireWorkspace,
  storeSecret,
  type SecretKind,
} from "@/lib/workspace";
import type { Thresholds } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

const DEMO: ActionResult = { ok: false, message: "Mode démo : branche Supabase pour activer cette action." };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const Email = z.string().trim().toLowerCase().email("Adresse e-mail invalide");

async function shopOrThrow(wsId: string, slug: string) {
  const shop = await repo.getShop(wsId, slug);
  if (!shop) throw new Error("Boutique introuvable dans cet espace");
  return shop;
}

// ---------- Espace actif ----------
export async function switchWorkspace(workspaceId: string) {
  const viewer = await requireViewer();
  if (!viewer.demo) {
    const mine = await listWorkspaces(viewer.id);
    if (!mine.some((w) => w.id === workspaceId)) throw new Error("Espace introuvable");
    (await cookies()).set(ACTIVE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/");
}

// ---------- Synchronisations ----------
export async function refreshMeta(slug: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  const r = await syncMeta(await shopOrThrow(workspace.id, slug), await getCredentials(workspace.id));
  revalidatePath(`/${slug}`);
  return { ok: r.ok, message: r.ok ? `Meta à jour : ${r.detail}` : `Meta : ${r.detail}` };
}

export async function refreshCompetitors(slug: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  const shop = await shopOrThrow(workspace.id, slug);
  const creds = await getCredentials(workspace.id);
  const r = await syncCompetitors(shop, creds);
  if (r.ok && creds.anthropic) await runAiMatches(shop, creds);
  revalidatePath(`/${slug}/radar`);
  return { ok: r.ok, message: r.ok ? `Concurrents à jour : ${r.detail}` : r.detail };
}

const FlagInput = z.object({
  slug: z.string(),
  competitorId: z.string().uuid(),
  adId: z.string().min(1).max(200),
  flag: z.enum(["deja_teste", "iteration", "ignore"]).nullable(),
});

export async function setFlag(input: z.infer<typeof FlagInput>): Promise<ActionResult> {
  const { viewer, workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  const v = FlagInput.parse(input);
  await repo.setCompetitorFlag(workspace.id, v.competitorId, v.adId, v.flag, viewer.id);
  revalidatePath(`/${v.slug}/radar`);
  return { ok: true, message: v.flag ? "Créa marquée" : "Marque retirée" };
}

export async function saveAdScript(slug: string, adId: string, script: string): Promise<ActionResult> {
  const { viewer, workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  await repo.saveScript(await shopOrThrow(workspace.id, slug), z.string().min(1).max(64).parse(adId), z.string().max(8000).parse(script), viewer.id);
  revalidatePath(`/${slug}`);
  return { ok: true, message: "Script enregistré" };
}

export async function generateBrief(slug: string): Promise<ActionResult> {
  const { viewer, workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  const creds = await getCredentials(workspace.id);
  if (!creds.anthropic) return { ok: false, message: "Ajoute ta clé Anthropic dans Réglages → Connexions." };
  const shop = await shopOrThrow(workspace.id, slug);
  const [cockpit, radar] = await Promise.all([buildCockpit(workspace, slug, "3d"), buildRadar(workspace, slug)]);
  if (!cockpit) return { ok: false, message: "Cockpit indisponible" };
  try {
    const brief = await writeMorningBrief(creds.anthropic, briefPayload(cockpit, radar));
    await repo.saveBrief(shop, brief, viewer.id);
    await repo.logRun("ai", shop.id, true, "brief généré");
  } catch (e) {
    await repo.logRun("ai", shop.id, false, errMsg(e));
    return { ok: false, message: `IA : ${errMsg(e)}` };
  }
  revalidatePath(`/${slug}/brief`);
  return { ok: true, message: "Brief prêt" };
}

// ---------- Boutiques ----------
const ThresholdsInput = z.object({
  be: z.number().positive(),
  targetLow: z.number().positive(),
  target: z.number().positive(),
  loss20: z.number().positive(),
  jump: z.number().positive().nullable(),
  atcTarget: z.number().positive(),
  aov: z.number().positive(),
});
const Col = z.string().regex(/^[A-Z]{1,2}$/);
const PnlInput = z.object({ dateColumn: Col, spendColumn: Col, salesColumn: Col, roasColumn: Col });
const AccountId = z
  .string()
  .trim()
  .transform((s) => s.replace(/^act_/, ""))
  .pipe(z.string().regex(/^\d{5,25}$/, "Identifiant de compte publicitaire invalide"));

export async function saveShopSettings(
  slug: string,
  input: { thresholds: Thresholds | null; pnl: z.infer<typeof PnlInput> | null; metaAdAccountId: string | null },
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    const thresholds = input.thresholds ? ThresholdsInput.parse(input.thresholds) : null;
    if (thresholds && !(thresholds.loss20 < thresholds.be && thresholds.be < thresholds.targetLow && thresholds.targetLow <= thresholds.target)) {
      return { ok: false, message: "Seuils incohérents : il faut −20 % < BE < bas de range ≤ target." };
    }
    await repo.updateShopSettings(workspace.id, shop.id, {
      thresholds,
      pnl: input.pnl ? PnlInput.parse(input.pnl) : null,
      meta_ad_account_id: input.metaAdAccountId ? AccountId.parse(input.metaAdAccountId) : null,
    });
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Réglages enregistrés" };
}

export async function createShopAction(input: { name: string; market: string; metaAdAccountId: string | null }): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  try {
    const name = z.string().trim().min(1, "Donne un nom à la boutique").max(60).parse(input.name);
    const market = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Marché : code pays sur 2 lettres (IT, FR…)").parse(input.market);
    const account = input.metaAdAccountId ? AccountId.parse(input.metaAdAccountId) : null;
    await repo.createShop(workspace.id, { name, market, metaAdAccountId: account });
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Boutique ajoutée" };
}

export async function deleteShopAction(slug: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  const shop = await shopOrThrow(workspace.id, slug);
  await repo.deleteShop(workspace.id, shop.id);
  revalidatePath("/", "layout");
  return { ok: true, message: `${shop.name} supprimée` };
}

export async function addCompetitorAction(slug: string, query: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  const creds = await getCredentials(workspace.id);
  if (!creds.trendtrack) return { ok: false, message: "Ajoute d'abord ta clé TrendTrack dans Connexions." };
  const q = z.string().trim().min(2).max(200).parse(query);
  const isUuid = /^[0-9a-f-]{36}$/i.test(q);
  let id = isUuid ? q : null;
  let name = q;
  if (!id) {
    try {
      const hit = (await lookup(creds.trendtrack, q))[0] as Record<string, unknown> | undefined;
      id = (hit?.brandtrackerId ?? hit?.brandtracker_id ?? hit?.id ?? null) as string | null;
      name = (hit?.name ?? q) as string;
    } catch (e) {
      return { ok: false, message: `TrendTrack : ${errMsg(e)}` };
    }
  }
  if (!id) return { ok: false, message: `Aucune marque suivie trouvée pour « ${q} ». Ajoute-la d'abord au Brand Tracker de TrendTrack.` };
  await repo.addCompetitor(await shopOrThrow(workspace.id, slug), name, id);
  revalidatePath("/", "layout");
  return { ok: true, message: `${name} ajouté. Il sera relevé au prochain rafraîchissement.` };
}

export async function removeCompetitorAction(competitorId: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  try {
    await repo.removeCompetitor(workspace.id, z.string().uuid().parse(competitorId));
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Concurrent retiré" };
}

// ---------- Connexions (clés de l'espace) ----------
export async function saveSecretAction(kind: SecretKind, value: string): Promise<ActionResult & { accounts?: MetaAccount[] }> {
  const { viewer, workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  const v = z.string().trim().min(10, "Clé trop courte").max(4000).parse(value);
  try {
    if (kind === "meta") {
      const r = await verifyMetaToken(v);
      await storeSecret(workspace.id, kind, v, viewer.id);
      revalidatePath("/", "layout");
      return { ok: true, message: `Jeton valide (${r.name}) · ${r.accounts.length} compte(s) pub accessible(s)`, accounts: r.accounts };
    }
    if (kind === "trendtrack") {
      const r = await verifyTrendtrackKey(v);
      await storeSecret(workspace.id, kind, v, viewer.id);
      revalidatePath("/", "layout");
      return { ok: true, message: `Clé valide${r.workspace ? ` (${r.workspace})` : ""}` };
    }
    await verifyAnthropicKey(v);
    await storeSecret(workspace.id, kind, v, viewer.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Clé valide" };
  } catch (e) {
    return { ok: false, message: `Clé refusée par le service : ${errMsg(e)}. Rien n'a été enregistré.` };
  }
}

export async function deleteSecretAction(kind: SecretKind): Promise<ActionResult> {
  const { viewer, workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  await storeSecret(workspace.id, kind, null, viewer.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Clé supprimée" };
}

export async function listMetaAccountsAction(): Promise<{ ok: boolean; accounts: MetaAccount[]; message?: string }> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return { ok: false, accounts: [] };
  const creds = await getCredentials(workspace.id);
  if (!creds.meta) return { ok: false, accounts: [], message: "Jeton Meta absent" };
  try {
    return { ok: true, accounts: (await verifyMetaToken(creds.meta)).accounts };
  } catch (e) {
    return { ok: false, accounts: [], message: errMsg(e) };
  }
}

// ---------- Espace ----------
export async function saveWorkspaceAction(input: { name: string; pnlSpreadsheetId: string }): Promise<ActionResult> {
  const { workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  try {
    const name = z.string().trim().min(1, "Donne un nom à l'espace").max(80).parse(input.name);
    // Accepte l'identifiant seul ou l'URL complète du Google Sheets.
    const raw = input.pnlSpreadsheetId.trim();
    const id = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/)?.[1] ?? raw;
    const sheet = id ? z.string().regex(/^[a-zA-Z0-9_-]{20,}$/, "Identifiant ou lien Google Sheets invalide").parse(id) : null;
    await repo.updateWorkspace(workspace.id, { name, pnl_spreadsheet_id: sheet });
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Espace enregistré" };
}

export async function inviteMemberAction(email: string, role: "owner" | "member"): Promise<ActionResult> {
  const { viewer, workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  try {
    const e = Email.parse(email);
    const members = await repo.listMembers(workspace.id);
    if (members.some((m) => m.email === e)) return { ok: false, message: "Cette personne est déjà membre." };
    await repo.inviteToWorkspace(workspace.id, e, z.enum(["owner", "member"]).parse(role), viewer.id);
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
  revalidatePath("/reglages");
  return { ok: true, message: "Invitation enregistrée. Elle se connecte avec son e-mail sur la page de connexion." };
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const { viewer, workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  if (userId === viewer.id) return { ok: false, message: "Tu ne peux pas te retirer toi-même." };
  try {
    await repo.removeMember(workspace.id, z.string().uuid().parse(userId));
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  revalidatePath("/reglages");
  return { ok: true, message: "Membre retiré" };
}

export async function cancelInvitationAction(invitationId: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace({ owner: true });
  if (demoMode) return DEMO;
  await repo.cancelInvitation(workspace.id, z.string().uuid().parse(invitationId));
  revalidatePath("/reglages");
  return { ok: true, message: "Invitation annulée" };
}

// ---------- Administration de la plateforme ----------
async function requireAdmin() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) throw new Error("Réservé aux administrateurs");
  return viewer;
}

export async function inviteAccountAction(email: string, workspaceName: string): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (demoMode) return DEMO;
  try {
    const e = Email.parse(email);
    const name = z.string().trim().min(1, "Donne un nom à son espace").max(80).parse(workspaceName);
    await repo.inviteNewAccount(e, name, viewer.id);
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
  revalidatePath("/admin");
  return { ok: true, message: "Accès ouvert. Envoie-lui l'adresse du site : il entre son e-mail et reçoit son lien." };
}

export async function cancelAccountInvitationAction(invitationId: string): Promise<ActionResult> {
  await requireAdmin();
  if (demoMode) return DEMO;
  await repo.cancelAccountInvitation(z.string().uuid().parse(invitationId));
  revalidatePath("/admin");
  return { ok: true, message: "Invitation annulée" };
}
