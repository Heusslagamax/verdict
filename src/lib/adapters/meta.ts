import "server-only";
import { env } from "@/lib/env";
import type { AdDay, MetaAd, MetaCampaign } from "@/lib/types";

/**
 * Accès en LECTURE SEULE à l'API Marketing de Meta (jeton d'utilisateur système, permission
 * `ads_read`). Ce module n'expose volontairement aucune écriture : le cockpit ne touche
 * jamais au budget ni au statut des campagnes.
 */

type GraphAction = { action_type: string; value: string };
type Paged<T> = { data: T[]; paging?: { next?: string } };

class MetaError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

async function graph<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${env.metaGraphVersion}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new MetaError(json?.error?.message ?? `Meta ${res.status}`, json?.error?.code);
  }
  return json as T;
}

async function graphAll<T>(token: string, path: string, params: Record<string, string>, maxPages = 10): Promise<T[]> {
  const first = await graph<Paged<T>>(token, path, params);
  const out = [...first.data];
  let next = first.paging?.next;
  let pages = 1;
  while (next && pages < maxPages) {
    const res = await fetch(next, { cache: "no-store" });
    const json = (await res.json()) as Paged<T> & { error?: { message: string } };
    if (!res.ok || json.error) throw new MetaError(json.error?.message ?? `Meta ${res.status}`);
    out.push(...json.data);
    next = json.paging?.next;
    pages++;
  }
  return out;
}

const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const ATC = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

function pick(actions: GraphAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const act = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);

interface InsightRow {
  ad_id?: string;
  campaign_id?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: GraphAction[];
  action_values?: GraphAction[];
}

function toDay(r: InsightRow): AdDay {
  return {
    date: r.date_start,
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    linkClicks: Number(r.inline_link_clicks ?? 0),
    addToCart: pick(r.actions, ATC),
    checkouts: pick(r.actions, CHECKOUT),
    purchases: pick(r.actions, PURCHASE),
    value: pick(r.action_values, PURCHASE),
  };
}

const INSIGHT_FIELDS = "ad_id,campaign_id,spend,impressions,inline_link_clicks,actions,action_values";
const LIVE_STATUSES = JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "WITH_ISSUES", "IN_PROCESS"]);

export async function fetchCampaigns(token: string, accountId: string): Promise<MetaCampaign[]> {
  const [campaigns, lifetime] = await Promise.all([
    graphAll<{
      id: string;
      name: string;
      effective_status: string;
      daily_budget?: string;
      created_time: string;
      start_time?: string;
    }>(token, `${act(accountId)}/campaigns`, {
      fields: "id,name,effective_status,daily_budget,created_time,start_time",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]),
      limit: "100",
    }),
    graphAll<InsightRow>(token, `${act(accountId)}/insights`, {
      level: "campaign",
      date_preset: "maximum",
      fields: INSIGHT_FIELDS,
      limit: "200",
    }),
  ]);
  const byId = new Map(lifetime.map((r) => [r.campaign_id!, toDay(r)]));
  return campaigns.map((c) => {
    const l = byId.get(c.id);
    return {
      id: c.id,
      name: c.name,
      status: c.effective_status,
      // Meta renvoie les budgets en centimes.
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      createdTime: c.created_time,
      lifetimeSpend: l?.spend ?? 0,
      lifetimeValue: l?.value ?? 0,
      lifetimeAddToCart: l?.addToCart ?? 0,
      lifetimeLinkClicks: l?.linkClicks ?? 0,
      lifetimePurchases: l?.purchases ?? 0,
      firstDeliveryDate: (c.start_time ?? c.created_time).slice(0, 10),
    };
  });
}

export async function fetchAds(token: string, accountId: string, sinceIso: string, untilIso: string): Promise<MetaAd[]> {
  const [ads, daily, lifetime] = await Promise.all([
    graphAll<{
      id: string;
      name: string;
      effective_status: string;
      created_time: string;
      adset_id: string;
      campaign_id: string;
      adset?: { name: string };
      campaign?: { name: string };
      creative?: {
        id: string;
        thumbnail_url?: string;
        image_url?: string;
        video_id?: string;
        body?: string;
        title?: string;
        object_story_spec?: { video_data?: { video_id?: string; message?: string; title?: string; image_url?: string } };
      };
    }>(token, `${act(accountId)}/ads`, {
      fields:
        "id,name,effective_status,created_time,adset_id,campaign_id,adset{name},campaign{name},creative{id,thumbnail_url,image_url,video_id,body,title,object_story_spec}",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: JSON.parse(LIVE_STATUSES) }]),
      thumbnail_width: "480",
      thumbnail_height: "480",
      limit: "200",
    }),
    graphAll<InsightRow>(token, `${act(accountId)}/insights`, {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: sinceIso, until: untilIso }),
      fields: `${INSIGHT_FIELDS},date_start`,
      limit: "500",
    }),
    graphAll<InsightRow>(token, `${act(accountId)}/insights`, {
      level: "ad",
      date_preset: "maximum",
      fields: "ad_id,spend",
      limit: "500",
    }),
  ]);

  const daysByAd = new Map<string, AdDay[]>();
  for (const r of daily) {
    const list = daysByAd.get(r.ad_id!) ?? [];
    list.push(toDay(r));
    daysByAd.set(r.ad_id!, list);
  }
  const lifetimeSpend = new Map(lifetime.map((r) => [r.ad_id!, Number(r.spend ?? 0)]));

  return ads.map((a) => {
    const cr = a.creative;
    const video = cr?.video_id ?? cr?.object_story_spec?.video_data?.video_id ?? null;
    return {
      id: a.id,
      name: a.name,
      status: a.effective_status,
      createdTime: a.created_time,
      campaignId: a.campaign_id,
      campaignName: a.campaign?.name ?? "",
      adsetId: a.adset_id,
      adsetName: a.adset?.name ?? "",
      creative: {
        id: cr?.id ?? null,
        thumbnailUrl: cr?.thumbnail_url ?? null,
        imageUrl: cr?.image_url ?? cr?.object_story_spec?.video_data?.image_url ?? null,
        videoId: video,
        body: cr?.body ?? cr?.object_story_spec?.video_data?.message ?? null,
        title: cr?.title ?? cr?.object_story_spec?.video_data?.title ?? null,
      },
      days: (daysByAd.get(a.id) ?? []).sort((x, y) => x.date.localeCompare(y.date)),
      lifetimeSpend: lifetimeSpend.get(a.id) ?? 0,
    } satisfies MetaAd;
  });
}

/** Aperçu officiel Meta (iframe) : rend l'ad exactement comme dans le fil. */
export async function fetchAdPreview(token: string, adId: string, format = "MOBILE_FEED_STANDARD"): Promise<string | null> {
  const r = await graph<{ data: { body: string }[] }>(token, `${adId}/previews`, { ad_format: format });
  return r.data[0]?.body ?? null;
}

/** URL source d'une vidéo (URL signée, temporaire : à ne pas stocker). */
export async function fetchVideoSource(token: string, videoId: string): Promise<{ source: string | null; picture: string | null }> {
  const r = await graph<{ source?: string; picture?: string }>(token, videoId, { fields: "source,picture" });
  return { source: r.source ?? null, picture: r.picture ?? null };
}

/** Vignettes générées par Meta à plusieurs instants de la vidéo (repli quand la source n'est pas lisible). */
export async function fetchVideoThumbnails(token: string, videoId: string): Promise<string[]> {
  const r = await graph<{ data?: { uri?: string }[] }>(token, `${videoId}/thumbnails`, {});
  return (r.data ?? []).map((d) => d.uri).filter((u): u is string => Boolean(u));
}

export interface MetaAccount {
  id: string;
  name: string;
  active: boolean;
}

/** Vérifie un jeton et liste les comptes publicitaires qu'il peut lire. */
export async function verifyMetaToken(token: string): Promise<{ name: string; accounts: MetaAccount[] }> {
  const me = await graph<{ name?: string; id: string }>(token, "me", { fields: "id,name" });
  const accounts = await graphAll<{ account_id: string; name: string; account_status: number }>(token, "me/adaccounts", {
    fields: "account_id,name,account_status",
    limit: "100",
  });
  return {
    name: me.name ?? me.id,
    accounts: accounts.map((a) => ({ id: a.account_id, name: a.name, active: a.account_status === 1 })),
  };
}

export { MetaError };
