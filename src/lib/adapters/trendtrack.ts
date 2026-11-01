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

const lastCredits = new Map<string, number>();
/** Crédits restants vus au dernier appel fait avec cette clé. */
export const trendtrackCredits = (key: string) => lastCredits.get(key.slice(-8)) ?? null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Un appel à la fois par clé : l'API publique limite les requêtes simultanées
 * (erreur 429 « concurrency_limited »). En cas de 429, on attend le délai indiqué par
 * `retry-after` (sinon 2 s, 4 s, 8 s) et on réessaie, 3 fois au plus.
 */
const queues = new Map<string, Promise<unknown>>();

function tt<T>(key: string, path: string, params: Record<string, string | number>): Promise<T> {
  const id = key.slice(-8);
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(() => request<T>(key, path, params));
  queues.set(id, run);
  return run;
}

async function request<T>(key: string, path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
    const remaining = res.headers.get("x-credits-remaining");
    if (remaining != null) lastCredits.set(key.slice(-8), Number(remaining));
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("TrendTrack limite les appels simultanés : réessaie dans une minute.");
      if (res.status === 401 || res.status === 403) throw new Error("Clé TrendTrack refusée : vérifie-la dans Réglages → Connexions.");
      throw new Error(`TrendTrack ${res.status} sur ${path} : ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
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
  key: string,
  brandtrackerId: string,
  opts: { sortBy: "currentRank" | "rankDelta7d" | "reachDelta7d"; status: "active" | "inactive"; period?: string; limit?: number },
): Promise<{ rows: Row[] }> {
  const json = await tt<{ data?: Row[] }>(key, `/v1/brandtrackers/${brandtrackerId}/top-ads`, {
    sortBy: opts.sortBy,
    status: opts.status,
    ...(opts.period ? { period: opts.period } : {}),
    limit: opts.limit ?? env.trendtrackRows,
  });
  return { rows: json.data ?? [] };
}

export async function fetchTranscripts(key: string, brandtrackerId: string, limit = 10): Promise<Map<string, string>> {
  const json = await tt<{ data?: Row[] }>(key, `/v1/brandtrackers/${brandtrackerId}/transcripts`, {
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
export async function lookup(key: string, q: string): Promise<Row[]> {
  const json = await tt<{ data?: Row[] }>(key, "/v1/lookup", { q, type: "brandtracker" });
  return json.data ?? [];
}

/** Récupère la photo du jour d'un concurrent (≈ 3 appels, ~2,5 × TRENDTRACK_ROWS crédits). */
export async function snapshotCompetitor(key: string, brandtrackerId: string, competitorId: string): Promise<CompetitorAd[]> {
  // Appels l'un après l'autre (voir tt) : top actuel, plus fortes montées, coupées récemment.
  const top = await fetchTopAds(key, brandtrackerId, { sortBy: "currentRank", status: "active" });
  const movers = await fetchTopAds(key, brandtrackerId, { sortBy: "rankDelta7d", status: "active" });
  const recent = await fetchTopAds(key, brandtrackerId, {
    sortBy: "currentRank",
    status: "inactive",
    period: "last7d",
    limit: Math.ceil(env.trendtrackRows / 2),
  });
  let transcripts = new Map<string, string>();
  try {
    transcripts = await fetchTranscripts(key, brandtrackerId, Math.ceil(env.trendtrackRows / 2));
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

/** Vérifie une clé (route gratuite /v1/me) et renvoie l'espace TrendTrack lié. */
export async function verifyTrendtrackKey(key: string): Promise<{ workspace: string | null }> {
  const json = await tt<Row>(key, "/v1/me", {});
  return { workspace: str(get(json, "workspace.name")) ?? str(get(json, "data.workspace.name")) ?? str(get(json, "name")) };
}
