import { similarity } from "./similarity";
import type { AiMatch } from "./competitors";

/**
 * Retrouver de quelle pub concurrente vient chacune de mes pubs. On compare les SCRIPTS
 * (texte parlé) et les textes d'annonce, jamais seulement l'image. La similarité locale ne
 * vaut que dans une même langue ; entre deux langues (FR → IT), c'est le verdict de l'IA
 * déjà stocké (ai_matches) ou une recherche IA à la demande qui fait le lien. Une suggestion
 * n'est jamais appliquée seule : l'utilisateur la confirme.
 */

export interface OwnAdText {
  id: string;
  name: string;
  script: string | null;
  body: string | null;
}

export interface CompetitorAdText {
  id: string;
  competitorId: string;
  transcript: string | null;
  body: string | null;
}

export interface SourceLink {
  adId: string;
  competitorId: string | null;
  competitorAdId: string; // "" = pub originale
  status: "confirmed" | "rejected";
  method: "manuel" | "script" | "texte" | "ia" | "studio";
  score: number | null;
}

export interface Suggestion {
  competitorAdId: string;
  competitorId: string;
  score: number;
  method: "script" | "texte" | "ia";
  reason: string;
}

/** Seuils : en dessous, deux textes d'une même langue ne sont pas « la même pub ». */
export const SCRIPT_MIN = 0.35;
export const BODY_MIN = 0.45;

export function suggestSources(
  own: OwnAdText[],
  competitors: CompetitorAdText[],
  links: SourceLink[],
  aiMatches: Map<string, AiMatch>,
  max = 3,
): Map<string, Suggestion[]> {
  const out = new Map<string, Suggestion[]>();
  const rejected = new Set(links.filter((l) => l.status === "rejected").map((l) => `${l.adId}:${l.competitorAdId}`));
  const settled = new Set(links.filter((l) => l.status === "confirmed").map((l) => l.adId));
  const byName = new Map(own.map((a) => [a.name.trim().toLowerCase(), a.id]));

  for (const a of own) {
    if (settled.has(a.id)) continue;
    const found = new Map<string, Suggestion>();
    const keep = (s: Suggestion) => {
      if (rejected.has(`${a.id}:${s.competitorAdId}`)) return;
      const prev = found.get(s.competitorAdId);
      if (!prev || s.score > prev.score) found.set(s.competitorAdId, s);
    };
    for (const c of competitors) {
      const sScript = similarity(a.script, c.transcript ?? c.body);
      if (sScript >= SCRIPT_MIN) keep({ competitorAdId: c.id, competitorId: c.competitorId, score: sScript, method: "script", reason: `Script proche à ${Math.round(sScript * 100)} %.` });
      const sBody = similarity(a.body, c.body);
      if (sBody >= BODY_MIN) keep({ competitorAdId: c.id, competitorId: c.competitorId, score: sBody * 0.9, method: "texte", reason: `Texte d'annonce proche à ${Math.round(sBody * 100)} %.` });
    }
    out.set(a.id, [...found.values()]);
  }

  // Verdicts IA déjà rendus par le radar (comparaison de scripts, y compris d'une langue à l'autre).
  for (const c of competitors) {
    const m = aiMatches.get(`${c.competitorId}:${c.id}`);
    if (!m || m.verdict === "nouveau" || !m.matchedAdName) continue;
    const adId = byName.get(m.matchedAdName.trim().toLowerCase());
    if (!adId || settled.has(adId) || rejected.has(`${adId}:${c.id}`)) continue;
    const list = out.get(adId) ?? [];
    const score = m.verdict === "doublon" ? 0.92 : 0.75;
    const existing = list.find((s) => s.competitorAdId === c.id);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.method = "ia";
      existing.reason = `IA : ${m.reason}`;
    } else {
      list.push({ competitorAdId: c.id, competitorId: c.competitorId, score, method: "ia", reason: `IA : ${m.reason}` });
    }
    out.set(adId, list);
  }

  for (const [k, list] of out) out.set(k, list.sort((x, y) => y.score - x.score).slice(0, max));
  return out;
}
