/**
 * Empreintes perceptuelles (dHash) et comparaison d'images clés. Fonctions pures, testées.
 * Deux images du même plan ont une distance de Hamming faible (≤ 10 sur 64 bits), même après
 * recompression, sous-titres ajoutés ou léger recadrage ; deux plans différents dépassent ~20.
 */

/** dHash à partir d'une image en niveaux de gris de 9 × 8 pixels (72 octets). */
export function dhashFromGray(gray: Uint8Array): string {
  if (gray.length < 72) throw new Error("dHash : il faut 9 × 8 pixels");
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? "1" : "0";
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Seuil : en dessous, deux images sont considérées comme le même plan. */
export const SAME_SHOT = 10;

export interface FrameMatch {
  /** Part des images de A retrouvées dans B (0 à 1). */
  share: number;
  /** Plus petite distance trouvée (0 = identique). */
  best: number;
  /** Paires d'images qui correspondent : instant dans A ↔ instant dans B. */
  pairs: { a: number; b: number; distance: number }[];
}

/**
 * Compare les images clés de deux créas, toutes contre toutes : un plan copié peut être placé
 * ailleurs dans la vidéo (le hook d'un concurrent repris au milieu, par exemple).
 */
export function compareFrames(a: { t: number; hash: string }[], b: { t: number; hash: string }[]): FrameMatch {
  if (!a.length || !b.length) return { share: 0, best: 64, pairs: [] };
  let best = 64;
  const pairs: FrameMatch["pairs"] = [];
  for (const fa of a) {
    let min = 64;
    let at = 0;
    for (const fb of b) {
      const d = hamming(fa.hash, fb.hash);
      if (d < min) {
        min = d;
        at = fb.t;
      }
    }
    best = Math.min(best, min);
    if (min <= SAME_SHOT) pairs.push({ a: fa.t, b: at, distance: min });
  }
  return { share: pairs.length / a.length, best, pairs };
}
