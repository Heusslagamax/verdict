import { compareFrames, type FrameMatch } from "@/lib/media/hash";
import { normalize, similarity } from "./similarity";

/**
 * Pré-filtre du rapprochement : pour une de mes pubs, classe toutes les créas concurrentes
 * par indices mesurables (plans communs, script proche, fiches proches), pour n'envoyer à l'IA
 * que les meilleurs candidats. Fonctions pures, testées.
 */

export interface Fingerprint {
  id: string;
  frames: { t: number; hash: string }[];
  script: string | null;
  /** Fiche IA en français (angle, message, plans marquants…), comparable d'une langue à l'autre. */
  card: { angle: string; message: string; concept: string; keyShots: string[]; hook: { text: string; visual: string } } | null;
}

export interface Candidate {
  id: string;
  image: FrameMatch;
  script: number;
  card: number;
  score: number;
}

const STOP = new Set(
  "les des une un le la de du et en au aux pour par sur dans avec sans que qui quoi est sont ses son sa leur leurs plus tres pas ne se ce cette ces on il elle ils elles vous nous tu je mon ma mes ton ta tes".split(
    " ",
  ),
);

/** Recouvrement de vocabulaire entre deux textes d'une même langue (fiches en français). */
export function wordOverlap(a: string, b: string): number {
  const wa = new Set(normalize(a).filter((w) => w.length > 2 && !STOP.has(w)));
  const wb = new Set(normalize(b).filter((w) => w.length > 2 && !STOP.has(w)));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.min(wa.size, wb.size);
}

const cardText = (c: Fingerprint["card"]) => (c ? [c.angle, c.message, c.concept, c.hook.visual, ...c.keyShots].join(" ") : "");

export function rankCandidates(own: Fingerprint, competitors: Fingerprint[], max = 3): Candidate[] {
  return competitors
    .map((c) => {
      const image = compareFrames(own.frames, c.frames);
      const script = similarity(own.script, c.script);
      const card = own.card && c.card ? wordOverlap(cardText(own.card), cardText(c.card)) : 0;
      // Les plans communs pèsent le plus : c'est la preuve la plus nette d'une copie.
      const score = Math.max(image.share, Math.min(1, script * 1.6), card * 0.7) + (image.share > 0 ? 0.2 : 0);
      return { id: c.id, image, script, card, score };
    })
    .filter((c) => c.image.share > 0 || c.script >= 0.2 || c.card >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
