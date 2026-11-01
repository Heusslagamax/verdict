import "server-only";
import { cache } from "react";
import { demoMode } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Competitor, CompetitorAd, MetaAd, MetaCampaign, PnlMapping, Shop, Thresholds } from "@/lib/types";
import type { AiMatch } from "@/lib/engine/competitors";
import type { SourceLink } from "@/lib/engine/sources";
import type { MorningBrief } from "@/lib/adapters/ai";
import { demoCompetitorAds, demoCompetitors, demoMeta, demoShops, demoStudioBriefs } from "./demo";

/**
 * Accès aux tables. Toujours appelé avec un espace déjà vérifié (lib/workspace.ts) ou depuis
 * la tâche planifiée protégée par CRON_SECRET. Chaque lecture et écriture est filtrée sur cet
 * espace : un identifiant venu du navigateur n'est jamais utilisé sans ce contrôle.
 */

const isDemo = (wsId: string) => demoMode || wsId === "demo";

interface ShopRow {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  market: string;
  meta_ad_account_id: string | null;
  thresholds: Thresholds | null;
  pnl: PnlMapping | null;
  product_brief: string | null;
}

const toShop = (r: ShopRow): Shop => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  market: r.market,
  metaAdAccountId: r.meta_ad_account_id,
  thresholds: r.thresholds,
  pnl: r.pnl,
  productBrief: r.product_brief ?? null,
});

export async function listShops(wsId: string): Promise<Shop[]> {
  if (isDemo(wsId)) return demoShops;
  const { data, error } = await supabaseAdmin().from("shops").select("*").eq("workspace_id", wsId).order("sort").order("created_at");
  if (error) throw error;
  return (data as ShopRow[]).map(toShop);
}

/** Pour l'affichage uniquement : une seule lecture par requête (mise en page + page). Les actions lisent sans cache. */
export const listShopsForView = cache(listShops);

export async function getShop(wsId: string, slug: string): Promise<Shop | null> {
  return (await listShops(wsId)).find((s) => s.slug === slug) ?? null;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "boutique";

// Routes déjà prises par l'application : une boutique ne peut pas s'appeler ainsi.
const RESERVED = new Set(["login", "auth", "api", "reglages", "admin", "sans-espace", "espace"]);

export async function createShop(wsId: string, input: { name: string; market: string; metaAdAccountId: string | null }) {
  if (isDemo(wsId)) return null;
  const existing = new Set((await listShops(wsId)).map((s) => s.slug));
  let base = slugify(input.name);
  if (RESERVED.has(base)) base = `${base}-shop`;
  let slug = base;
  for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`;
  const { data, error } = await supabaseAdmin()
    .from("shops")
    .insert({
      workspace_id: wsId,
      slug,
      name: input.name,
      market: input.market,
      meta_ad_account_id: input.metaAdAccountId,
      pnl: { dateColumn: "A", spendColumn: "", salesColumn: "", roasColumn: "" },
      sort: existing.size,
    })
    .select("slug")
    .single();
  if (error) throw error;
  return data.slug as string;
}

export async function deleteShop(wsId: string, shopId: string) {
  if (isDemo(wsId)) return;
  const { error } = await supabaseAdmin().from("shops").delete().eq("id", shopId).eq("workspace_id", wsId);
  if (error) throw error;
}

export async function updateShopSettings(
  wsId: string,
  shopId: string,
  patch: { thresholds?: Thresholds | null; pnl?: PnlMapping | null; meta_ad_account_id?: string | null; name?: string; product_brief?: string | null },
) {
  if (isDemo(wsId)) return;
  const { error } = await supabaseAdmin().from("shops").update(patch).eq("id", shopId).eq("workspace_id", wsId);
  if (error) throw error;
}

// ---------- Espace ----------
export async function updateWorkspace(wsId: string, patch: { name?: string; pnl_spreadsheet_id?: string | null }) {
  if (isDemo(wsId)) return;
  const { error } = await supabaseAdmin().from("workspaces").update(patch).eq("id", wsId);
  if (error) throw error;
}

export interface MemberRow {
  userId: string;
  email: string;
  role: "owner" | "member";
}

export async function listMembers(wsId: string): Promise<MemberRow[]> {
  if (isDemo(wsId)) return [{ userId: "demo", email: "demo@verdict.local", role: "owner" }];
  const { data, error } = await supabaseAdmin()
    .from("workspace_members")
    .select("user_id, email, role")
    .eq("workspace_id", wsId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({ userId: m.user_id, email: m.email, role: m.role }));
}

export async function listPendingInvitations(wsId: string) {
  if (isDemo(wsId)) return [];
  const { data, error } = await supabaseAdmin()
    .from("invitations")
    .select("id, email, role, created_at")
    .eq("workspace_id", wsId)
    .is("accepted_at", null)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Invite dans un espace existant. Si la personne a déjà un compte, elle est ajoutée tout de suite. */
export async function inviteToWorkspace(wsId: string, email: string, role: "owner" | "member", by: string) {
  const { error } = await supabaseAdmin()
    .from("invitations")
    .insert({ email: email.toLowerCase(), workspace_id: wsId, role, invited_by: by });
  if (error) throw error;
}

export async function cancelInvitation(wsId: string, invitationId: string) {
  const { error } = await supabaseAdmin().from("invitations").delete().eq("id", invitationId).eq("workspace_id", wsId).is("accepted_at", null);
  if (error) throw error;
}

export async function removeMember(wsId: string, userId: string) {
  const members = await listMembers(wsId);
  const target = members.find((m) => m.userId === userId);
  if (!target) return;
  if (target.role === "owner" && members.filter((m) => m.role === "owner").length <= 1) {
    throw new Error("Impossible de retirer le dernier propriétaire de l'espace.");
  }
  const { error } = await supabaseAdmin().from("workspace_members").delete().eq("workspace_id", wsId).eq("user_id", userId);
  if (error) throw error;
}

// ---------- Administration de la plateforme ----------
export async function listAllWorkspaces() {
  const db = supabaseAdmin();
  const [{ data: ws }, { data: members }, { data: shops }, { data: pending }] = await Promise.all([
    db.from("workspaces").select("id, name, created_at").order("created_at"),
    db.from("workspace_members").select("workspace_id, email, role"),
    db.from("shops").select("workspace_id"),
    db.from("invitations").select("id, email, workspace_name, created_at").is("workspace_id", null).is("accepted_at", null).order("created_at"),
  ]);
  return {
    workspaces: (ws ?? []).map((w) => ({
      id: w.id as string,
      name: w.name as string,
      createdAt: w.created_at as string,
      owners: (members ?? []).filter((m) => m.workspace_id === w.id && m.role === "owner").map((m) => m.email as string),
      memberCount: (members ?? []).filter((m) => m.workspace_id === w.id).length,
      shopCount: (shops ?? []).filter((s) => s.workspace_id === w.id).length,
    })),
    pending: (pending ?? []) as { id: string; email: string; workspace_name: string; created_at: string }[],
  };
}

/** Ouvre l'accès à un nouvel e-mail : son espace sera créé à sa première connexion. */
export async function inviteNewAccount(email: string, workspaceName: string, by: string) {
  const { error } = await supabaseAdmin()
    .from("invitations")
    .insert({ email: email.toLowerCase(), workspace_name: workspaceName, role: "owner", invited_by: by });
  if (error) throw error;
}

export async function cancelAccountInvitation(invitationId: string) {
  const { error } = await supabaseAdmin().from("invitations").delete().eq("id", invitationId).is("workspace_id", null).is("accepted_at", null);
  if (error) throw error;
}

// ---------- Meta ----------
export interface MetaSnapshot {
  fetchedAt: string;
  campaigns: MetaCampaign[];
  ads: MetaAd[];
}

export async function readMetaSnapshot(shop: Shop, today: Date): Promise<MetaSnapshot | null> {
  if (demoMode || shop.id.startsWith("demo")) return { fetchedAt: today.toISOString(), ...demoMeta(shop, today) };
  const { data, error } = await supabaseAdmin().from("meta_snapshots").select("*").eq("shop_id", shop.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fetchedAt: data.fetched_at, campaigns: data.campaigns, ads: data.ads };
}

export async function writeMetaSnapshot(shop: Shop, snap: MetaSnapshot) {
  const db = supabaseAdmin();
  const { error } = await db.from("meta_snapshots").upsert({
    shop_id: shop.id,
    fetched_at: snap.fetchedAt,
    campaigns: snap.campaigns,
    ads: snap.ads,
  });
  if (error) throw error;
  const rows = snap.ads.flatMap((ad) =>
    ad.days.map((d) => ({
      shop_id: shop.id,
      ad_id: ad.id,
      date: d.date,
      spend: d.spend,
      impressions: d.impressions,
      link_clicks: d.linkClicks,
      add_to_cart: d.addToCart,
      checkouts: d.checkouts,
      purchases: d.purchases,
      value: d.value,
    })),
  );
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e2 } = await db.from("meta_ad_days").upsert(rows.slice(i, i + 500));
    if (e2) throw e2;
  }
}

/** Efface la photo Meta d'une boutique (changement de compte publicitaire). */
export async function clearMetaData(shopId: string) {
  if (demoMode || shopId.startsWith("demo")) return;
  const db = supabaseAdmin();
  const [a, b] = await Promise.all([db.from("meta_snapshots").delete().eq("shop_id", shopId), db.from("meta_ad_days").delete().eq("shop_id", shopId)]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

export async function readScripts(shop: Shop): Promise<Map<string, string>> {
  if (demoMode || shop.id.startsWith("demo")) return new Map();
  const { data, error } = await supabaseAdmin().from("ad_scripts").select("ad_id,script").eq("shop_id", shop.id);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.ad_id as string, r.script as string]));
}

export async function saveScript(shop: Shop, adId: string, script: string, userId: string) {
  if (demoMode || shop.id.startsWith("demo")) return;
  const db = supabaseAdmin();
  if (!script.trim()) {
    await db.from("ad_scripts").delete().eq("shop_id", shop.id).eq("ad_id", adId);
    return;
  }
  const { error } = await db
    .from("ad_scripts")
    .upsert({ ad_id: adId, shop_id: shop.id, script: script.trim(), updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------- Concurrents ----------
const toCompetitor = (r: { id: string; shop_id: string; name: string; brandtracker_id: string; active: boolean }): Competitor => ({
  id: r.id,
  shopId: r.shop_id,
  name: r.name,
  brandtrackerId: r.brandtracker_id,
  active: r.active,
});

export async function listCompetitors(shop: Shop): Promise<Competitor[]> {
  if (demoMode || shop.id.startsWith("demo")) return demoCompetitors(shop);
  const { data, error } = await supabaseAdmin().from("competitors").select("*").eq("shop_id", shop.id).order("created_at");
  if (error) throw error;
  return (data ?? []).map(toCompetitor);
}

/** Vérifie qu'un concurrent (identifiant venu du navigateur) appartient bien à l'espace. */
export async function competitorInWorkspace(wsId: string, competitorId: string): Promise<boolean> {
  if (isDemo(wsId)) return false;
  const { data } = await supabaseAdmin().from("competitors").select("id, shops!inner(workspace_id)").eq("id", competitorId).eq("shops.workspace_id", wsId).maybeSingle();
  return Boolean(data);
}

export async function addCompetitor(shop: Shop, name: string, brandtrackerId: string) {
  if (demoMode || shop.id.startsWith("demo")) return;
  const { error } = await supabaseAdmin()
    .from("competitors")
    .upsert({ shop_id: shop.id, name, brandtracker_id: brandtrackerId, active: true }, { onConflict: "shop_id,brandtracker_id" });
  if (error) throw error;
}

export async function removeCompetitor(wsId: string, competitorId: string) {
  if (!(await competitorInWorkspace(wsId, competitorId))) throw new Error("Concurrent introuvable dans cet espace");
  const { error } = await supabaseAdmin().from("competitors").delete().eq("id", competitorId);
  if (error) throw error;
}

export async function readCompetitorAds(competitors: Competitor[], today: Date): Promise<CompetitorAd[]> {
  if (demoMode || competitors.some((c) => c.brandtrackerId === "demo")) return competitors.flatMap((c) => demoCompetitorAds(c, today));
  if (!competitors.length) return [];
  const ids = competitors.map((c) => c.id);
  const db = supabaseAdmin();
  const [{ data: ads, error }, { data: flags }] = await Promise.all([
    db.from("competitor_ads").select("*").in("competitor_id", ids),
    db.from("competitor_flags").select("*").in("competitor_id", ids),
  ]);
  if (error) throw error;
  const flagMap = new Map((flags ?? []).map((f) => [`${f.competitor_id}:${f.ad_id}`, f.flag as CompetitorAd["userFlag"]]));
  return (ads ?? []).map((r) => ({
    ...(r.data as CompetitorAd),
    status: r.status,
    previousStatus: r.previous_status,
    userFlag: flagMap.get(`${r.competitor_id}:${r.id}`) ?? null,
  }));
}

export async function writeCompetitorAds(competitor: Competitor, ads: CompetitorAd[], today: Date) {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("competitor_ads").select("id,status").eq("competitor_id", competitor.id);
  const prev = new Map((existing ?? []).map((r) => [r.id as string, r.status as string]));
  const date = today.toISOString().slice(0, 10);
  if (!ads.length) return;
  const { error } = await db.from("competitor_ads").upsert(
    ads.map((a) => ({
      competitor_id: competitor.id,
      id: a.id,
      data: a,
      status: a.status,
      previous_status: prev.get(a.id) ?? null,
      first_seen_at: a.firstSeenAt,
      updated_at: today.toISOString(),
    })),
  );
  if (error) throw error;
  await db.from("competitor_rank_history").upsert(
    ads.map((a) => ({ competitor_id: competitor.id, ad_id: a.id, date, status: a.status, rank: a.currentRank, reach: a.reach })),
  );
}

export async function setCompetitorFlag(wsId: string, competitorId: string, adId: string, flag: CompetitorAd["userFlag"], userId: string) {
  if (!(await competitorInWorkspace(wsId, competitorId))) throw new Error("Concurrent introuvable dans cet espace");
  const db = supabaseAdmin();
  if (!flag) {
    await db.from("competitor_flags").delete().eq("competitor_id", competitorId).eq("ad_id", adId);
    return;
  }
  const { error } = await db
    .from("competitor_flags")
    .upsert({ competitor_id: competitorId, ad_id: adId, flag, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function readAiMatches(competitors: Competitor[]): Promise<Map<string, AiMatch>> {
  if (demoMode || !competitors.length || competitors.some((c) => c.brandtrackerId === "demo")) return new Map();
  const { data } = await supabaseAdmin().from("ai_matches").select("*").in("competitor_id", competitors.map((c) => c.id));
  return new Map((data ?? []).map((r) => [`${r.competitor_id}:${r.ad_id}`, r.result as AiMatch]));
}

export async function writeAiMatch(competitorId: string, adId: string, result: AiMatch) {
  const { error } = await supabaseAdmin().from("ai_matches").upsert({ competitor_id: competitorId, ad_id: adId, result });
  if (error) throw error;
}

// ---------- Brief & journal ----------
export async function latestBrief(shop: Shop): Promise<{ content: MorningBrief; createdAt: string } | null> {
  if (demoMode || shop.id.startsWith("demo")) return null;
  const { data } = await supabaseAdmin()
    .from("briefs")
    .select("content,created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { content: data.content as MorningBrief, createdAt: data.created_at } : null;
}

export async function saveBrief(shop: Shop, content: MorningBrief, userId: string | null) {
  const { error } = await supabaseAdmin().from("briefs").insert({ shop_id: shop.id, content, created_by: userId });
  if (error) throw error;
}

export async function logRun(source: "meta" | "trendtrack" | "ai" | "pnl", shopId: string | null, ok: boolean, detail: string, credits?: number | null) {
  if (demoMode || !shopId || shopId.startsWith("demo")) return;
  await supabaseAdmin()
    .from("sync_runs")
    .insert({ source, shop_id: shopId, finished_at: new Date().toISOString(), ok, detail: detail.slice(0, 500), credits_left: credits ?? null });
}

export async function lastRun(source: "meta" | "trendtrack" | "ai" | "pnl", shopId: string) {
  if (demoMode || shopId.startsWith("demo")) return null;
  const { data } = await supabaseAdmin()
    .from("sync_runs")
    .select("*")
    .eq("source", source)
    .eq("shop_id", shopId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { started_at: string; ok: boolean; detail: string; credits_left: number | null } | null;
}

/** Pour la tâche du matin : toutes les boutiques, groupées par espace. */
export async function listAllShopsByWorkspace(): Promise<Map<string, Shop[]>> {
  const { data, error } = await supabaseAdmin().from("shops").select("*").order("sort");
  if (error) throw error;
  const out = new Map<string, Shop[]>();
  for (const r of data as ShopRow[]) {
    const list = out.get(r.workspace_id) ?? [];
    list.push(toShop(r));
    out.set(r.workspace_id, list);
  }
  return out;
}

// ---------- Sources des pubs (copie de quelle pub concurrente) ----------
export async function readSourceLinks(shop: Shop): Promise<SourceLink[]> {
  if (demoMode || shop.id.startsWith("demo")) return demoLinks.get(shop.id) ?? [];
  const { data, error } = await supabaseAdmin().from("ad_source_links").select("*").eq("shop_id", shop.id);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    adId: r.ad_id,
    competitorId: r.competitor_id,
    competitorAdId: r.competitor_ad_id,
    status: r.status,
    method: r.method,
    score: r.score,
  }));
}

// Mode démo : liaisons gardées en mémoire, pour pouvoir essayer l'interface.
const demoLinks = new Map<string, SourceLink[]>();

export async function setSourceLink(
  shop: Shop,
  link: { adId: string; competitorId: string | null; competitorAdId: string; status: "confirmed" | "rejected"; method: SourceLink["method"]; score?: number | null },
  userId: string | null,
) {
  if (demoMode || shop.id.startsWith("demo")) {
    const list = (demoLinks.get(shop.id) ?? []).filter(
      (l) => !(l.adId === link.adId && (l.competitorAdId === link.competitorAdId || (link.status === "confirmed" && l.status === "confirmed"))),
    );
    list.push({ ...link, score: link.score ?? null });
    demoLinks.set(shop.id, list);
    return;
  }
  const db = supabaseAdmin();
  if (link.status === "confirmed") {
    // Une seule source confirmée par pub : l'ancienne est retirée.
    const { error } = await db.from("ad_source_links").delete().eq("shop_id", shop.id).eq("ad_id", link.adId).eq("status", "confirmed");
    if (error) throw error;
  }
  const { error } = await db.from("ad_source_links").upsert({
    shop_id: shop.id,
    ad_id: link.adId,
    competitor_id: link.competitorId,
    competitor_ad_id: link.competitorAdId,
    status: link.status,
    method: link.method,
    score: link.score ?? null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearSourceLink(shop: Shop, adId: string) {
  if (demoMode || shop.id.startsWith("demo")) {
    demoLinks.set(shop.id, (demoLinks.get(shop.id) ?? []).filter((l) => !(l.adId === adId && l.status === "confirmed")));
    return;
  }
  const { error } = await supabaseAdmin().from("ad_source_links").delete().eq("shop_id", shop.id).eq("ad_id", adId).eq("status", "confirmed");
  if (error) throw error;
}

// ---------- Studio Ads ----------
export type BriefStatus = "a_produire" | "en_production" | "lancee" | "abandonnee";

export interface StudioBriefRow {
  id: string;
  sourceKind: "own" | "competitor";
  sourceId: string;
  sourceLabel: string;
  competitorId: string | null;
  element: string;
  title: string;
  brief: StudioBriefContent;
  ruleIds: string[];
  status: BriefStatus;
  launchedAdId: string | null;
  createdAt: string;
}

export interface StudioBriefContent {
  why: string;
  hook: { text: string; visual: string };
  script: string;
  scriptFr: string;
  shots: { at: string; visual: string; text: string }[];
  cta: string;
  adCopy: string | null;
  production: string;
}

const demoBriefs = new Map<string, StudioBriefRow[]>();

export async function listStudioBriefs(shop: Shop): Promise<StudioBriefRow[]> {
  if (demoMode || shop.id.startsWith("demo")) {
    if (!demoBriefs.has(shop.id)) demoBriefs.set(shop.id, demoStudioBriefs(shop));
    return demoBriefs.get(shop.id) ?? [];
  }
  const { data, error } = await supabaseAdmin()
    .from("studio_briefs")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sourceKind: r.source_kind,
    sourceId: r.source_id,
    sourceLabel: r.source_label,
    competitorId: r.competitor_id,
    element: r.element,
    title: r.title,
    brief: r.brief as StudioBriefContent,
    ruleIds: r.rule_ids ?? [],
    status: r.status,
    launchedAdId: r.launched_ad_id,
    createdAt: r.created_at,
  }));
}

export async function insertStudioBriefs(
  shop: Shop,
  rows: Omit<StudioBriefRow, "id" | "status" | "launchedAdId" | "createdAt">[],
  userId: string | null,
) {
  if (demoMode || shop.id.startsWith("demo")) {
    const now = new Date().toISOString();
    demoBriefs.set(shop.id, [
      ...rows.map((r) => ({ ...r, id: crypto.randomUUID(), status: "a_produire" as const, launchedAdId: null, createdAt: now })),
      ...(demoBriefs.get(shop.id) ?? []),
    ]);
    return;
  }
  const { error } = await supabaseAdmin()
    .from("studio_briefs")
    .insert(
      rows.map((r) => ({
        shop_id: shop.id,
        source_kind: r.sourceKind,
        source_id: r.sourceId,
        source_label: r.sourceLabel,
        competitor_id: r.competitorId,
        element: r.element,
        title: r.title,
        brief: r.brief,
        rule_ids: r.ruleIds,
        created_by: userId,
      })),
    );
  if (error) throw error;
}

export async function updateStudioBrief(shop: Shop, id: string, patch: { status?: BriefStatus; launchedAdId?: string | null }) {
  if (demoMode || shop.id.startsWith("demo")) {
    demoBriefs.set(
      shop.id,
      (demoBriefs.get(shop.id) ?? []).map((b) =>
        b.id === id ? { ...b, ...(patch.status ? { status: patch.status } : {}), ...(patch.launchedAdId !== undefined ? { launchedAdId: patch.launchedAdId } : {}) } : b,
      ),
    );
    return;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.launchedAdId !== undefined) row.launched_ad_id = patch.launchedAdId;
  const { error } = await supabaseAdmin().from("studio_briefs").update(row).eq("id", id).eq("shop_id", shop.id);
  if (error) throw error;
}

export async function deleteStudioBrief(shop: Shop, id: string) {
  if (demoMode || shop.id.startsWith("demo")) {
    demoBriefs.set(shop.id, (demoBriefs.get(shop.id) ?? []).filter((b) => b.id !== id));
    return;
  }
  const { error } = await supabaseAdmin().from("studio_briefs").delete().eq("id", id).eq("shop_id", shop.id);
  if (error) throw error;
}
