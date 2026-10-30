/**
 * Similarité de scripts dans une même langue : Jaccard sur des trigrammes de mots
 * normalisés (sans accents, emojis ni ponctuation). Entre deux langues, cette mesure
 * ne vaut rien : c'est l'IA qui tranche (voir lib/ai.ts).
 */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function shingles(words: string[], n = 3): Set<string> {
  const out = new Set<string>();
  if (words.length < n) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - n; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const sa = shingles(normalize(a));
  const sb = shingles(normalize(b));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}
