import "server-only";
import { env } from "@/lib/env";
import { fetchAds, fetchCampaigns } from "@/lib/adapters/meta";
import { snapshotCompetitor, trendtrackCredits } from "@/lib/adapters/trendtrack";
import { compareScript } from "@/lib/adapters/ai";
import { readCompetitorAd, type OwnScript } from "@/lib/engine/competitors";
import type { Credentials } from "@/lib/workspace";
import type { Shop } from "@/lib/types";
import * as repo from "./repo";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Resynchronise Meta pour une boutique (14 jours jour par jour + cumuls depuis le lancement). */
export async function syncMeta(shop: Shop, creds: Credentials, today = new Date()) {
  if (!creds.meta) return { ok: false, detail: "Jeton Meta absent : ajoute-le dans Réglages → Connexions." };
  if (!shop.metaAdAccountId) return { ok: false, detail: "Compte publicitaire non choisi pour cette boutique." };
  try {
    const since = iso(new Date(today.getTime() - 13 * 86_400_000));
    const [campaigns, ads] = await Promise.all([
      fetchCampaigns(creds.meta, shop.metaAdAccountId),
      fetchAds(creds.meta, shop.metaAdAccountId, since, iso(today)),
    ]);
    await repo.writeMetaSnapshot(shop, { fetchedAt: new Date().toISOString(), campaigns, ads });
    await repo.logRun("meta", shop.id, true, `${campaigns.length} campagnes, ${ads.length} ads`);
    return { ok: true, detail: `${ads.length} ads` };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await repo.logRun("meta", shop.id, false, detail);
    return { ok: false, detail };
  }
}

/** Meta « en direct » : resynchronise si la photo a plus de META_STALE_MINUTES. */
export async function ensureFreshMeta(shop: Shop, creds: Credentials, today = new Date()) {
  const snap = await repo.readMetaSnapshot(shop, today);
  const age = snap ? (Date.now() - new Date(snap.fetchedAt).getTime()) / 60_000 : Infinity;
  if (creds.meta && shop.metaAdAccountId && age > env.metaStaleMinutes) {
    const r = await syncMeta(shop, creds, today);
    if (r.ok) return { snap: await repo.readMetaSnapshot(shop, today), error: null };
    return { snap, error: r.detail };
  }
  return { snap, error: null };
}

/** Photo TrendTrack du jour pour chaque concurrent actif de la boutique. */
export async function syncCompetitors(shop: Shop, creds: Credentials, today = new Date()) {
  if (!creds.trendtrack) return { ok: false, detail: "Clé TrendTrack absente : ajoute-la dans Réglages → Connexions." };
  const competitors = (await repo.listCompetitors(shop)).filter((c) => c.active);
  const errors: string[] = [];
  let count = 0;
  for (const c of competitors) {
    try {
      const ads = await snapshotCompetitor(creds.trendtrack, c.brandtrackerId, c.id);
      await repo.writeCompetitorAds(c, ads, today);
      count += ads.length;
    } catch (e) {
      errors.push(`${c.name} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const ok = errors.length === 0;
  await repo.logRun("trendtrack", shop.id, ok, ok ? `${count} ads relevées` : errors.join(" | "), trendtrackCredits(creds.trendtrack));
  return { ok, detail: ok ? `${count} ads` : errors.join(" | ") };
}

/** Scripts de référence : tes scripts collés + ceux des créas concurrentes déjà reprises. */
export async function ownScripts(shop: Shop, today: Date): Promise<OwnScript[]> {
  const [snap, scripts, competitors] = await Promise.all([
    repo.readMetaSnapshot(shop, today),
    repo.readScripts(shop),
    repo.listCompetitors(shop),
  ]);
  const names = new Map((snap?.ads ?? []).map((a) => [a.id, a.name]));
  const out: OwnScript[] = [...scripts.entries()].map(([adId, text]) => ({ adId, name: names.get(adId) ?? adId, text }));
  const compAds = await repo.readCompetitorAds(competitors, today);
  for (const a of compAds) {
    if (a.userFlag === "deja_teste" || a.userFlag === "iteration") {
      const text = [a.transcript, a.body].filter(Boolean).join("\n");
      if (text) out.push({ adId: a.id, name: `déjà repris (${a.id.slice(-6)})`, text });
    }
  }
  return out;
}

/** Fait trancher l'IA sur les candidates fortes pas encore comparées (8 max par passage). */
export async function runAiMatches(shop: Shop, creds: Credentials, today = new Date(), max = 8) {
  if (!creds.anthropic) return { ok: false, detail: "Clé Anthropic absente" };
  const competitors = await repo.listCompetitors(shop);
  const [ads, matches, owned] = await Promise.all([
    repo.readCompetitorAds(competitors, today),
    repo.readAiMatches(competitors),
    ownScripts(shop, today),
  ]);
  const candidates = ads
    .filter((a) => !matches.has(`${a.competitorId}:${a.id}`))
    .filter((a) => a.transcript || a.body)
    .filter((a) => {
      const r = readCompetitorAd(a, owned, today);
      return r.signals.includes("winner") || r.signals.includes("montante");
    })
    .slice(0, max);
  let done = 0;
  for (const a of candidates) {
    try {
      const res = await compareScript(creds.anthropic, {
        competitorScript: [a.transcript, a.body].filter(Boolean).join("\n"),
        ownScripts: owned.map((o) => ({ name: o.name, text: o.text })),
      });
      await repo.writeAiMatch(a.competitorId, a.id, res);
      done++;
    } catch (e) {
      await repo.logRun("ai", shop.id, false, e instanceof Error ? e.message : String(e));
      break;
    }
  }
  await repo.logRun("ai", shop.id, true, `${done} script(s) comparé(s)`);
  return { ok: true, detail: `${done} comparés` };
}
