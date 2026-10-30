import "server-only";
import { env } from "@/lib/env";
import type { CompetitorAd } from "@/lib/types";

/**
 * API publique TrendTrack (https://api.trendtrack.io, Bearer). Coût : 1 crédit par ligne
 * renvoyée. La documentation publique ne fige pas la forme des lignes « top-ads » : le
 * normaliseur accepte la forme imbriquée (`row.ad.*`, `row.metrics.*`) observée via le
 * connecteur TrendTrack, ainsi qu'une forme à plat. Route de contrôle : /api/debug/trendtrack.
 */

const BASE = "https://api.trendtrack.io";

export interface TrendtrackUsage {
  creditsRemaining: number | null;
}

let lastCredits: number | null = null;
export const trendtrackCredits = () => lastCredits;

async function tt<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.trendtrackKey}`, Accept: "application/json" },
    cache: "no-store",
  });
  const remaining = res.headers.get("x-credits-remaining");
  if (remaining != null) lastCredits = Number(remaining);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TrendTrack ${res.status} sur ${path} : ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type Row = Record<string, unknown>;
const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Row)[k] : undefined), o);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function normalizeTopAdRow(row: Row, competitorId: string): CompetitorAd | null {
  const ad = (get(row, "ad") as Row) ?? row;
  const id = str(get(ad, "id")) ?? str(get(ad, "adId")) ?? str(get(row, "adId"));
  if (!id) return null;
  const status = (str(get(ad, "status")) ?? "active").toLowerCase() === "inactive" ? "inactive" : "active";
  const mediaType = str(get(ad, "media.type")) ?? str(get(ad, "mediaType"));
  return {
    id,
    competitorId,
    status,
    firstSeenAt: str(get(ad, "firstSeenAt")) ?? str(get(ad, "createdAt")),
    lastSeenAt: str(get(ad, "lastSeenAt")),
    daysRunning: num(get(ad, "daysRunning")),
    mediaType: mediaType === "video" ? "video" : mediaType === "image" ? "image" : null,
    mediaUrl: str(get(ad, "media.mediaUrl")) ?? str(get(ad, "mediaUrl")),
    thumbnailUrl: str(get(ad, "media.thumbnailUrl")) ?? str(get(ad, "thumbnailUrl")),
    body: str(get(ad, "content.body")) ?? str(get(ad, "body")),
    transcript: str(get(ad, "content.transcript")) ?? str(get(ad, "transcript")),
    landingUrl: str(get(ad, "content.landingPageUrl")) ?? str(get(ad, "landingPageUrl")),
    cta: str(get(ad, "content.callToAction")) ?? str(get(ad, "callToAction")),
    reach: num(get(ad, "metrics.reach")) ?? num(get(row, "metrics.reach")),
    reachDelta7d: num(get(ad, "metrics.reachDelta7d")) ?? num(get(row, "metrics.reachDelta7d")),
    estimatedSpend: num(get(ad, "metrics.estimatedSpend")) ?? num(get(row, "metrics.estimatedSpend")),
    currentRank: num(get(row, "metrics.currentRank")) ?? num(get(ad, "rank.currentRank")) ?? num(get(row, "metrics.rank")),
    previousRank: num(get(row, "metrics.previousRank")),
    rankDelta: num(get(row, "metrics.rankDelta")) ?? num(get(ad, "rank.rankDelta")),
  };
}

export async function fetchTopAds(
  brandtrackerId: string,
  opts: { sortBy: "currentRank" | "rankDelta7d" | "reachDelta7d"; status: "active" | "inactive"; period?: string; limit?: number },
): Promise<{ rows: Row[] }> {
  const json = await tt<{ data?: Row[] }>(`/v1/brandtrackers/${brandtrackerId}/top-ads`, {
    sortBy: opts.sortBy,
    status: opts.status,
    ...(opts.period ? { period: opts.period } : {}),
    limit: opts.limit ?? env.trendtrackRows,
  });
  return { rows: json.data ?? [] };
}

export async function fetchTranscripts(brandtrackerId: string, limit = 10): Promise<Map<string, string>> {
  const json = await tt<{ data?: Row[] }>(`/v1/brandtrackers/${brandtrackerId}/transcripts`, {
    timePeriod: "last30d",
    sortBy: "totalImpressions",
    order: "desc",
    limit,
  });
  const map = new Map<string, string>();
  for (const r of json.data ?? []) {
    const id = str(get(r, "sampleAd.adId"));
    const text = str(get(r, "fullText"));
    if (id && text) map.set(id, text);
  }
  return map;
}

/** Résolution gratuite (0 crédit) d'une marque, d'un domaine ou d'une page en brandtracker. */
export async function lookup(q: string): Promise<Row[]> {
  const json = await tt<{ data?: Row[] }>("/v1/lookup", { q, type: "brandtracker" });
  return json.data ?? [];
}

/** Récupère la photo du jour d'un concurrent (≈ 3 appels, ~2,5 × TRENDTRACK_ROWS crédits). */
export async function snapshotCompetitor(brandtrackerId: string, competitorId: string): Promise<CompetitorAd[]> {
  const [top, movers, recent] = await Promise.all([
    fetchTopAds(brandtrackerId, { sortBy: "currentRank", status: "active" }),
    fetchTopAds(brandtrackerId, { sortBy: "rankDelta7d", status: "active" }),
    fetchTopAds(brandtrackerId, { sortBy: "currentRank", status: "inactive", period: "last7d", limit: Math.ceil(env.trendtrackRows / 2) }),
  ]);
  let transcripts = new Map<string, string>();
  try {
    transcripts = await fetchTranscripts(brandtrackerId, Math.ceil(env.trendtrackRows / 2));
  } catch {
    // Les transcriptions sont un bonus : on ne bloque pas la photo du jour.
  }
  const byId = new Map<string, CompetitorAd>();
  for (const row of [...top.rows, ...movers.rows, ...recent.rows]) {
    const ad = normalizeTopAdRow(row, competitorId);
    if (!ad) continue;
    if (!ad.transcript && transcripts.has(ad.id)) ad.transcript = transcripts.get(ad.id)!;
    byId.set(ad.id, { ...byId.get(ad.id), ...ad });
  }
  return [...byId.values()];
}
