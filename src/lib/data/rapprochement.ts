import "server-only";
import sharp from "sharp";
import { getCredentials, type Workspace } from "@/lib/workspace";
import type { CompetitorAd, MetaAd, Shop } from "@/lib/types";
import { fetchVideoSource, fetchVideoThumbnails } from "@/lib/adapters/meta";
import { analyzeCreative, judgeMatch } from "@/lib/adapters/ai";
import { imageFrame, videoFrames, type Frame } from "@/lib/media/frames";
import { rankCandidates, type Fingerprint } from "@/lib/engine/matching";
import * as repo from "./repo";

/**
 * Rapprochement : relier précisément mes pubs aux pubs concurrentes qu'elles copient.
 * 1. Empreinte de chaque créa : images clés (vidéo ou statique), empreinte visuelle de chaque
 *    image, fiche IA en français (angle, message, hook, plans marquants).
 * 2. Pour chacune de mes pubs : pré-filtre mesurable (plans communs, script, fiches), puis
 *    jugement IA des 3 meilleurs candidats, images à l'appui, critère par critère.
 * Chaque étape traite UNE créa par appel : la progression s'affiche et rien ne dépasse le
 * temps maximal d'une fonction.
 */

async function shopAndCreds(ws: Workspace, slug: string) {
  const shop = (await repo.listShops(ws.id)).find((s) => s.slug === slug);
  if (!shop) throw new Error("Boutique introuvable");
  return { shop, creds: await getCredentials(ws.id) };
}

/** Mes pubs concernées : celles qui ont dépensé sur les 14 derniers jours. */
function ownScope(ads: MetaAd[], today: Date): MetaAd[] {
  const since = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  return ads.filter((a) => a.days.some((d) => d.date >= since && d.spend > 0));
}

export interface Plan {
  analyzeCompetitor: string[];
  analyzeOwn: string[];
  match: string[];
  totals: { own: number; competitor: number; ownDone: number; competitorDone: number };
}

export async function rapprochementPlan(ws: Workspace, slug: string, opts: { force?: boolean } = {}, today = new Date()): Promise<Plan> {
  const { shop } = await shopAndCreds(ws, slug);
  const [snap, competitors, keys] = await Promise.all([repo.readMetaSnapshot(shop, today), repo.listCompetitors(shop), repo.listFingerprintKeys(shop)]);
  const compAds = await repo.readCompetitorAds(competitors, today);
  const own = ownScope(snap?.ads ?? [], today).map((a) => a.id);
  const comp = compAds.map((a) => a.id);
  const done = new Set(keys.filter((k) => k.ok).map((k) => `${k.kind}:${k.refId}`));
  return {
    analyzeCompetitor: comp.filter((id) => opts.force || !done.has(`competitor:${id}`)),
    analyzeOwn: own.filter((id) => opts.force || !done.has(`own:${id}`)),
    match: own,
    totals: {
      own: own.length,
      competitor: comp.length,
      ownDone: own.filter((id) => done.has(`own:${id}`)).length,
      competitorDone: comp.filter((id) => done.has(`competitor:${id}`)).length,
    },
  };
}

async function small(frames: Frame[]) {
  return Promise.all(
    frames.slice(0, 6).map(async (f) => ({
      t: f.t,
      b64: (await sharp(f.jpeg).resize({ width: 320 }).jpeg({ quality: 62 }).toBuffer()).toString("base64"),
    })),
  );
}

async function ownFrames(ad: MetaAd, metaToken: string | null): Promise<{ frames: Frame[]; media: repo.FingerprintRow["media"] }> {
  const c = ad.creative;
  if (c.videoId && metaToken) {
    const src = await fetchVideoSource(metaToken, c.videoId).catch(() => null);
    if (src?.source) {
      try {
        return { frames: await videoFrames(src.source), media: "video" };
      } catch {
        // on tente les vignettes
      }
    }
    const thumbs = await fetchVideoThumbnails(metaToken, c.videoId).catch(() => []);
    const frames: Frame[] = [];
    for (const [i, uri] of thumbs.slice(0, 6).entries()) {
      const f = await imageFrame(uri).catch(() => null);
      if (f) frames.push({ ...f[0], t: i });
    }
    if (frames.length) return { frames, media: "thumbnail" };
  }
  const img = c.imageUrl ?? c.thumbnailUrl;
  if (img) return { frames: await imageFrame(img), media: c.videoId ? "thumbnail" : "image" };
  throw new Error("Aucun visuel lisible pour cette pub");
}

async function competitorFrames(ad: CompetitorAd): Promise<{ frames: Frame[]; media: repo.FingerprintRow["media"] }> {
  if (ad.mediaType === "video" && ad.mediaUrl) {
    try {
      return { frames: await videoFrames(ad.mediaUrl), media: "video" };
    } catch {
      // repli sur la miniature
    }
  }
  const img = ad.mediaType === "image" ? (ad.mediaUrl ?? ad.thumbnailUrl) : ad.thumbnailUrl;
  if (img) return { frames: await imageFrame(img), media: ad.mediaType === "image" ? "image" : "thumbnail" };
  throw new Error("Aucun visuel lisible pour cette créa");
}

/** Étape 1 : empreinte + fiche IA d'une créa (la mienne ou celle d'un concurrent). */
export async function fingerprintCreative(ws: Workspace, slug: string, kind: "own" | "competitor", refId: string, today = new Date()) {
  const { shop, creds } = await shopAndCreds(ws, slug);
  if (!creds.anthropic) throw new Error("Clé Anthropic absente (Réglages → Connexions)");
  let script: string | null = null;
  let body: string | null = null;
  let isVideo = true;
  try {
    let got: { frames: Frame[]; media: repo.FingerprintRow["media"] };
    if (kind === "own") {
      const [snap, scripts] = await Promise.all([repo.readMetaSnapshot(shop, today), repo.readScripts(shop)]);
      const ad = snap?.ads.find((a) => a.id === refId);
      if (!ad) throw new Error("Pub introuvable dans la dernière photo Meta");
      script = scripts.get(ad.id) ?? null;
      body = ad.creative.body;
      isVideo = Boolean(ad.creative.videoId);
      got = await ownFrames(ad, creds.meta);
    } else {
      const competitors = await repo.listCompetitors(shop);
      const ad = (await repo.readCompetitorAds(competitors, today)).find((a) => a.id === refId);
      if (!ad) throw new Error("Créa concurrente introuvable dans le dernier relevé");
      script = ad.transcript;
      body = ad.body;
      isVideo = ad.mediaType !== "image";
      got = await competitorFrames(ad);
    }
    const thumbs = await small(got.frames);
    const card = await analyzeCreative(creds.anthropic, { frames: thumbs, script, body, isVideo: got.media === "video" ? true : isVideo && got.media !== "image" });
    await repo.saveFingerprint(shop, { kind, refId, media: got.media, frames: got.frames.map((f) => ({ t: f.t, hash: f.hash })), thumbs, card, error: null });
    return { ok: true, media: got.media };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await repo.saveFingerprint(shop, { kind, refId, media: "none", frames: [], thumbs: [], card: null, error });
    return { ok: false, error };
  }
}

/** Étape 2 : rapproche une de mes pubs des créas concurrentes analysées. */
export async function matchOwnAd(ws: Workspace, slug: string, adId: string, today = new Date()) {
  const { shop, creds } = await shopAndCreds(ws, slug);
  if (!creds.anthropic) throw new Error("Clé Anthropic absente (Réglages → Connexions)");
  const [fps, snap, scripts, competitors] = await Promise.all([
    repo.readFingerprints(shop),
    repo.readMetaSnapshot(shop, today),
    repo.readScripts(shop),
    repo.listCompetitors(shop),
  ]);
  const compAds = await repo.readCompetitorAds(competitors, today);
  const own = fps.find((f) => f.kind === "own" && f.refId === adId && f.card);
  if (!own) return { ok: false, error: "Pub pas encore analysée" };
  const ad = snap?.ads.find((a) => a.id === adId);
  const compById = new Map(compAds.map((c) => [c.id, c]));
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  const pool: (Fingerprint & { row: repo.FingerprintRow })[] = fps
    .filter((f) => f.kind === "competitor" && f.card && compById.has(f.refId))
    .map((f) => ({ id: f.refId, frames: f.frames, script: compById.get(f.refId)?.transcript ?? compById.get(f.refId)?.body ?? null, card: f.card, row: f }));
  const ranked = rankCandidates({ id: adId, frames: own.frames, script: scripts.get(adId) ?? ad?.creative.body ?? null, card: own.card }, pool, 3);

  const rows: Omit<repo.MatchRow, "adId" | "createdAt">[] = [];
  for (const cand of ranked) {
    const fp = pool.find((p) => p.id === cand.id)!;
    const c = compById.get(cand.id)!;
    // Images montrées à l'IA : celles qui correspondent d'abord, puis le hook.
    const pick = (thumbs: { t: number; b64: string }[], times: number[]) =>
      [...thumbs.filter((x) => times.includes(x.t)), ...thumbs.filter((x) => !times.includes(x.t))].slice(0, 4);
    const v = await judgeMatch(creds.anthropic, {
      own: { name: ad?.name ?? adId, card: own.card, script: scripts.get(adId) ?? null, frames: pick(own.thumbs, cand.image.pairs.map((p) => p.a)) },
      competitor: { name: names.get(c.competitorId) ?? "Concurrent", card: fp.row.card, script: c.transcript ?? c.body, frames: pick(fp.row.thumbs, cand.image.pairs.map((p) => p.b)) },
      imageMatch: { share: cand.image.share, pairs: cand.image.pairs },
    });
    rows.push({
      competitorAdId: c.id,
      competitorId: c.competitorId,
      relation: v.relation,
      confidence: v.confidence,
      criteria: { ...v.criteria, images: v.criteria.images || cand.image.share >= 0.5 },
      imageShare: cand.image.share,
      framePairs: cand.image.pairs,
      evidence: v.evidence,
    });
  }
  await repo.replaceMatches(shop, adId, rows);
  return { ok: true, found: rows.filter((r) => r.relation !== "different").length };
}

// ---------- Écran ----------
export interface RapprochementRow {
  ad: { id: string; name: string; thumbnailUrl: string | null; spend14: number; isVideo: boolean; analyzed: boolean; media: string | null };
  matches: (repo.MatchRow & { competitorName: string; competitorThumb: string | null; competitorText: string; reach: number | null; daysRunning: number | null })[];
  link: { status: "confirmed" | "rejected"; competitorAdId: string }[];
}

export async function buildRapprochement(ws: Workspace, slug: string, today = new Date()) {
  const shop = (await repo.listShopsForView(ws.id)).find((s) => s.slug === slug);
  if (!shop) return null;
  const [snap, competitors, keys, matches, links, creds] = await Promise.all([
    repo.readMetaSnapshot(shop, today),
    repo.listCompetitors(shop),
    repo.listFingerprintKeys(shop),
    repo.readMatches(shop),
    repo.readSourceLinks(shop),
    getCredentials(ws.id),
  ]);
  const compAds = await repo.readCompetitorAds(competitors, today);
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  const comp = new Map(compAds.map((c) => [c.id, c]));
  const analyzed = new Set(keys.filter((k) => k.ok).map((k) => `${k.kind}:${k.refId}`));
  const since = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const rows: RapprochementRow[] = ownScope(snap?.ads ?? [], today).map((a) => ({
    ad: {
      id: a.id,
      name: a.name,
      thumbnailUrl: a.creative.thumbnailUrl ?? a.creative.imageUrl,
      spend14: a.days.filter((d) => d.date >= since).reduce((s, d) => s + d.spend, 0),
      isVideo: Boolean(a.creative.videoId),
      analyzed: analyzed.has(`own:${a.id}`),
      media: null,
    },
    matches: matches
      .filter((m) => m.adId === a.id && m.relation !== "different")
      .map((m) => {
        const c = comp.get(m.competitorAdId);
        return {
          ...m,
          competitorName: names.get(m.competitorId ?? "") ?? "Concurrent",
          competitorThumb: c?.thumbnailUrl ?? null,
          competitorText: (c?.transcript ?? c?.body ?? "").slice(0, 240),
          reach: c?.reach ?? null,
          daysRunning: c?.daysRunning ?? null,
        };
      })
      .sort((x, y) => rank(y) - rank(x)),
    link: links.filter((l) => l.adId === a.id).map((l) => ({ status: l.status, competitorAdId: l.competitorAdId })),
  }));
  rows.sort((x, y) => y.ad.spend14 - x.ad.spend14);

  return {
    shop,
    rows,
    totals: {
      own: rows.length,
      ownDone: rows.filter((r) => r.ad.analyzed).length,
      competitor: compAds.length,
      competitorDone: compAds.filter((c) => analyzed.has(`competitor:${c.id}`)).length,
    },
    sources: { ai: Boolean(creds.anthropic), meta: Boolean(creds.meta), demo: shop.id.startsWith("demo") },
  };
}

const REL = { copie_1_1: 3, iteration: 2, meme_angle: 1, different: 0 } as const;
const CONF = { haute: 0.3, moyenne: 0.2, faible: 0.1 } as const;
const rank = (m: repo.MatchRow) => REL[m.relation] + CONF[m.confidence] + m.imageShare * 0.1;

/** Image clé d'une empreinte (pour l'affichage côte à côte). */
export async function fingerprintThumb(ws: Workspace, slug: string, kind: "own" | "competitor", refId: string, t: number): Promise<Buffer | null> {
  const shop = (await repo.listShopsForView(ws.id)).find((s) => s.slug === slug);
  if (!shop) return null;
  const fp = (await repo.readFingerprints(shop)).find((f) => f.kind === kind && f.refId === refId);
  const th = fp?.thumbs.find((x) => x.t === t) ?? fp?.thumbs[0];
  return th ? Buffer.from(th.b64, "base64") : null;
}
