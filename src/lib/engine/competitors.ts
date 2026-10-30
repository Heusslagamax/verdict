/**
 * Lecture des ads concurrentes. Les seuils suivent la préférence de l'utilisateur :
 * se fier aux données (portée, durée de diffusion, rang) plutôt qu'à la théorie.
 * « À récupérer » exige un script différent de ce qui est déjà testé (ou une itération),
 * jamais une simple comparaison d'image.
 */
import type { CompetitorAd, CompetitorRead, CompetitorSignal } from "@/lib/types";
import { similarity } from "./similarity";

const DAY = 86_400_000;

export interface OwnScript {
  adId: string;
  name: string;
  text: string;
}

export interface AiMatch {
  verdict: "doublon" | "iteration" | "nouveau";
  matchedAdName?: string | null;
  reason: string;
}

export function readCompetitorAd(
  ad: CompetitorAd,
  ownScripts: OwnScript[],
  today: Date,
  aiMatch?: AiMatch | null,
): CompetitorRead {
  const signals: CompetitorSignal[] = [];
  const active = ad.status === "active";
  const lastSeen = ad.lastSeenAt ? new Date(ad.lastSeenAt).getTime() : null;
  const firstSeen = ad.firstSeenAt ? new Date(ad.firstSeenAt).getTime() : null;

  if (!active && (ad.previousStatus === "active" || (lastSeen != null && today.getTime() - lastSeen <= 3 * DAY))) {
    signals.push("coupee");
  }
  if (active && firstSeen != null && today.getTime() - firstSeen <= 3 * DAY) signals.push("nouvelle");

  const reachGrowth = ad.reach && ad.reachDelta7d ? ad.reachDelta7d / ad.reach : 0;
  if (active && ((ad.rankDelta ?? 0) >= 10 || (reachGrowth >= 0.3 && (ad.reachDelta7d ?? 0) >= 5_000))) {
    signals.push("montante");
  }
  if (active && (ad.daysRunning ?? 0) >= 14 && ((ad.currentRank ?? 999) <= 10 || (ad.reach ?? 0) >= 100_000)) {
    signals.push("winner");
  }
  if (!signals.length) signals.push("stable");

  const script = [ad.transcript, ad.body].filter(Boolean).join("\n");
  let closest: CompetitorRead["closestOwnAd"] = null;
  for (const own of ownScripts) {
    const s = similarity(script, own.text);
    if (!closest || s > closest.similarity) closest = { adId: own.adId, name: own.name, similarity: s };
  }

  const strong = signals.includes("winner") || signals.includes("montante") || (ad.reach ?? 0) >= 10_000;
  let recoverable = false;
  let recoverReason = "";

  if (!active) recoverReason = "Coupée par le concurrent.";
  else if (ad.userFlag === "deja_teste") recoverReason = "Marquée « déjà testée ».";
  else if (ad.userFlag === "ignore") recoverReason = "Ignorée.";
  else if (!strong) recoverReason = "Pas encore assez de signal (portée, durée, rang).";
  else if (ad.userFlag === "iteration") {
    recoverable = true;
    recoverReason = "Itération d'un script déjà testé : acceptable.";
  } else if (aiMatch) {
    recoverable = aiMatch.verdict !== "doublon";
    recoverReason =
      aiMatch.verdict === "doublon"
        ? `Script déjà dans ton adset${aiMatch.matchedAdName ? ` (${aiMatch.matchedAdName})` : ""}.`
        : aiMatch.verdict === "iteration"
          ? `Itération d'un script testé : ${aiMatch.reason}`
          : `Script nouveau : ${aiMatch.reason}`;
  } else if (closest && closest.similarity >= 0.55) {
    recoverReason = `Script très proche de ${closest.name} (${Math.round(closest.similarity * 100)} %).`;
  } else {
    recoverable = true;
    recoverReason = script
      ? "Aucun script proche dans tes ads. À confirmer par l'IA si ton adset est dans une autre langue."
      : "Pas de transcription disponible : vérifie le script avant de la reprendre.";
  }

  return { signals, recoverable, recoverReason, closestOwnAd: closest };
}
