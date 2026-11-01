"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { demoMode } from "@/lib/env";
import * as repo from "@/lib/data/repo";
import { metaIsStale, runAiMatches, syncCompetitors, syncMeta } from "@/lib/data/sync";
import { briefPayload, buildCockpit, buildRadar } from "@/lib/data/views";
import { findSource, verifyAnthropicKey, writeMorningBrief, writeStudioBriefs } from "@/lib/adapters/ai";
import { buildStudio, studioPayload, type CompetitorStudioSource } from "@/lib/data/studio";
import { MAX_BRIEFS, RULES } from "@/lib/engine/studio";
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

/** Un compte publicitaire n'appartient qu'à une boutique : sinon deux boutiques afficheraient les mêmes pubs. */
async function accountTakenBy(wsId: string, account: string | null, exceptShopId: string | null): Promise<string | null> {
  if (!account) return null;
  const other = (await repo.listShops(wsId)).find((s) => s.metaAdAccountId === account && s.id !== exceptShopId);
  return other?.name ?? null;
}

// ---------- Synchronisations ----------
/**
 * Lancée par le navigateur quand la page s'est affichée avec une photo Meta périmée :
 * resynchronise en arrière-plan, puis la page se rafraîchit sans bloquer l'affichage.
 */
export async function syncMetaIfStale(slug: string): Promise<{ updated: boolean; error: string | null }> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return { updated: false, error: null };
  const shop = await shopOrThrow(workspace.id, slug);
  const snap = await repo.readMetaSnapshot(shop, new Date());
  if (!metaIsStale(snap?.fetchedAt)) return { updated: false, error: null };
  const r = await syncMeta(shop, await getCredentials(workspace.id));
  return { updated: r.ok, error: r.ok ? null : r.detail };
}
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
  const [cockpit, radar] = await Promise.all([buildCockpit(workspace, slug, "3d", new Date(), { blockOnStaleMeta: true }), buildRadar(workspace, slug)]);
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
    const account = input.metaAdAccountId ? AccountId.parse(input.metaAdAccountId) : null;
    const taken = await accountTakenBy(workspace.id, account, shop.id);
    if (taken) return { ok: false, message: `Ce compte publicitaire est déjà branché sur ${taken}. Choisis le compte de ${shop.name}.` };
    await repo.updateShopSettings(workspace.id, shop.id, { thresholds, pnl: input.pnl ? PnlInput.parse(input.pnl) : null, meta_ad_account_id: account });
    // Compte changé : on efface les pubs de l'ancien compte, la prochaine ouverture recharge les bonnes.
    if (account !== shop.metaAdAccountId) await repo.clearMetaData(shop.id);
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
    const taken = await accountTakenBy(workspace.id, account, null);
    if (taken) return { ok: false, message: `Ce compte publicitaire est déjà branché sur ${taken}.` };
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

// ---------- Sources des pubs ----------
const LinkInput = z.object({
  adId: z.string().min(1).max(64),
  competitorAdId: z.string().max(128),
  competitorId: z.string().max(64).nullable().transform((v) => v || null),
});

/** Confirme la pub concurrente d'origine (competitorAdId vide = pub originale). */
export async function confirmSourceAction(slug: string, input: z.input<typeof LinkInput> & { method?: "manuel" | "script" | "texte" | "ia"; score?: number | null }): Promise<ActionResult> {
  const { workspace, viewer } = await requireWorkspace();
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    const { adId, competitorAdId, competitorId } = LinkInput.parse(input);
    if (competitorId) {
      const competitors = await repo.listCompetitors(shop);
      if (!competitors.some((c) => c.id === competitorId)) throw new Error("Concurrent introuvable pour cette boutique");
    }
    await repo.setSourceLink(shop, { adId, competitorId, competitorAdId, status: "confirmed", method: input.method ?? "manuel", score: input.score ?? null }, viewer.demo ? null : viewer.id);
    revalidatePath(`/${slug}`, "layout");
    return { ok: true, message: competitorAdId ? "Source confirmée" : "Marquée comme pub originale" };
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
}

export async function rejectSourceAction(slug: string, input: z.input<typeof LinkInput>): Promise<ActionResult> {
  const { workspace, viewer } = await requireWorkspace();
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    const { adId, competitorAdId, competitorId } = LinkInput.parse(input);
    await repo.setSourceLink(shop, { adId, competitorId, competitorAdId, status: "rejected", method: "manuel" }, viewer.demo ? null : viewer.id);
    revalidatePath(`/${slug}`, "layout");
    return { ok: true, message: "Suggestion écartée" };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function clearSourceAction(slug: string, adId: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    await repo.clearSourceLink(shop, z.string().min(1).max(64).parse(adId));
    revalidatePath(`/${slug}`, "layout");
    return { ok: true, message: "Source retirée" };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Demande à l'IA quelle pub concurrente est la source (rien n'est enregistré : l'utilisateur confirme). */
export async function findSourceAiAction(slug: string, adId: string): Promise<ActionResult & { match?: { competitorAdId: string; competitorId: string; reason: string; confidence: string } }> {
  const { workspace } = await requireWorkspace();
  try {
    const creds = await getCredentials(workspace.id);
    if (!creds.anthropic) return { ok: false, message: "Ajoute ta clé Anthropic dans Réglages → Connexions pour la recherche IA." };
    const view = await buildCockpit(workspace, slug, "7d");
    if (!view) throw new Error("Boutique introuvable");
    const ad = view.campaigns.flatMap((c) => c.adsets.flatMap((s) => s.ads)).find((a) => a.id === adId);
    if (!ad) throw new Error("Pub introuvable");
    const candidates = view.competitorAds.filter((c) => c.text.trim()).slice(0, 60);
    if (!candidates.length) return { ok: false, message: "Aucune pub concurrente avec du texte : lance un relevé du radar." };
    const r = await findSource(creds.anthropic, {
      own: { name: ad.name, script: ad.script, body: ad.creative.body },
      candidates: candidates.map((c) => ({ id: c.id, competitor: c.competitorName, text: c.text })),
    });
    const hit = r.competitorAdId ? candidates.find((c) => c.id === r.competitorAdId) : null;
    if (!hit) return { ok: true, message: `L'IA ne trouve pas de source claire. ${r.reason}` };
    return { ok: true, message: r.reason, match: { competitorAdId: hit.id, competitorId: hit.competitorId, reason: r.reason, confidence: r.confidence } };
  } catch (e) {
    return { ok: false, message: `IA : ${errMsg(e)}` };
  }
}

// ---------- Studio Ads ----------
export async function generateStudioAction(slug: string, kind: "own" | "competitor", sourceId: string): Promise<ActionResult> {
  const { workspace, viewer } = await requireWorkspace();
  try {
    const creds = await getCredentials(workspace.id);
    if (!creds.anthropic) return { ok: false, message: "Ajoute ta clé Anthropic dans Réglages → Connexions pour générer des itérations." };
    const view = await buildStudio(workspace, slug);
    if (!view) throw new Error("Boutique introuvable");
    const source = kind === "own" ? view.own.find((s) => s.ad.id === sourceId) : view.competitors.find((s) => s.ad.id === sourceId);
    if (!source) throw new Error("Cette pub n'est plus une source d'itération (verdict ou statut changé).");
    const out = await writeStudioBriefs(creds.anthropic, studioPayload(view, source));
    const known = new Set(Object.keys(RULES));
    const allowed = new Set(source.diagnosis.plan.map((p) => p.element));
    const briefs = out.briefs.filter((b) => allowed.has(b.element)).slice(0, MAX_BRIEFS);
    if (!briefs.length) throw new Error("réponse hors plan, relance.");
    const isOwn = kind === "own";
    await repo.insertStudioBriefs(
      view.shop,
      briefs.map((b) => ({
        sourceKind: kind,
        sourceId,
        sourceLabel: "campaignName" in source ? source.ad.name : `${(source as CompetitorStudioSource).ad.competitorName} · ${source.ad.id.slice(-6)}`,
        competitorId: isOwn ? null : (source as CompetitorStudioSource).ad.competitorId,
        element: b.element,
        title: b.title,
        ruleIds: b.ruleIds.filter((id) => known.has(id)),
        brief: { why: b.why, hook: b.hook, script: b.script, scriptFr: b.scriptFr, shots: b.shots, cta: b.cta, adCopy: b.adCopy, production: b.production },
      })),
      viewer.demo ? null : viewer.id,
    );
    revalidatePath(`/${slug}/studio`);
    return { ok: true, message: `${briefs.length} brief${briefs.length > 1 ? "s" : ""} ajouté${briefs.length > 1 ? "s" : ""}` };
  } catch (e) {
    return { ok: false, message: `IA : ${errMsg(e)}` };
  }
}

const BriefPatch = z.object({
  status: z.enum(["a_produire", "en_production", "lancee", "abandonnee"]).optional(),
  launchedAdId: z.string().max(64).nullable().optional(),
});

/** Fait avancer un brief ; relier la pub lancée confirme aussi sa source si le brief vient d'un concurrent. */
export async function updateBriefAction(slug: string, id: string, patch: z.input<typeof BriefPatch>): Promise<ActionResult> {
  const { workspace, viewer } = await requireWorkspace();
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    const p = BriefPatch.parse(patch);
    const brief = (await repo.listStudioBriefs(shop)).find((b) => b.id === z.string().uuid().parse(id));
    if (!brief) throw new Error("Brief introuvable");
    await repo.updateStudioBrief(shop, brief.id, { status: p.launchedAdId ? "lancee" : p.status, launchedAdId: p.launchedAdId });
    if (p.launchedAdId && brief.sourceKind === "competitor") {
      await repo.setSourceLink(shop, { adId: p.launchedAdId, competitorId: brief.competitorId, competitorAdId: brief.sourceId, status: "confirmed", method: "studio" }, viewer.demo ? null : viewer.id);
    }
    revalidatePath(`/${slug}`, "layout");
    return { ok: true, message: "Brief mis à jour" };
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
}

export async function deleteBriefAction(slug: string, id: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    await repo.deleteStudioBrief(shop, z.string().uuid().parse(id));
    revalidatePath(`/${slug}/studio`);
    return { ok: true, message: "Brief supprimé" };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function saveProductBriefAction(slug: string, text: string): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (demoMode) return DEMO;
  try {
    const shop = await shopOrThrow(workspace.id, slug);
    const value = z.string().max(3000, "3 000 caractères maximum").parse(text).trim();
    await repo.updateShopSettings(workspace.id, shop.id, { product_brief: value || null });
    revalidatePath("/", "layout");
    return { ok: true, message: "Fiche produit enregistrée" };
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : errMsg(e) };
  }
}
