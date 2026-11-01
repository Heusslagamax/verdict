import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { env } from "@/lib/env";

/**
 * IA de surveillance (API Anthropic). Deux usages :
 *  - comparer un script concurrent à ceux déjà testés, y compris d'une langue à l'autre ;
 *  - rédiger le brief du matin à partir des chiffres et des verdicts calculés par le moteur.
 * L'IA n'invente pas de chiffres : elle ne reçoit que des données déjà calculées et doit
 * rester dans la méthode Zecom. Les décisions chiffrées restent celles du moteur.
 */

const client = (apiKey: string) => new Anthropic({ apiKey });

export const ScriptMatch = z.object({
  verdict: z.enum(["doublon", "iteration", "nouveau"]),
  matchedAdName: z.string().nullable(),
  reason: z.string(),
  angle: z.string(),
  hook: z.string(),
});
export type ScriptMatch = z.infer<typeof ScriptMatch>;

export async function compareScript(apiKey: string, input: {
  competitorScript: string;
  ownScripts: { name: string; text: string }[];
}): Promise<ScriptMatch> {
  const owned = input.ownScripts.length
    ? input.ownScripts.map((s, i) => `### ${i + 1}. ${s.name}\n${s.text.slice(0, 1500)}`).join("\n\n")
    : "(aucun script enregistré)";
  const msg = await client(apiKey).messages.parse({
    model: env.anthropicModel,
    max_tokens: 1200,
    system:
      "Tu es le creative strategist d'un e-commerçant qui traduit des créas concurrentes (souvent du français vers l'italien). " +
      "Tu compares le SCRIPT (texte parlé ou écrit), jamais seulement l'image. Les langues peuvent différer : une traduction fidèle est un doublon. " +
      "doublon = même script ou traduction ; iteration = même structure et même angle mais hook ou preuve différents ; nouveau = angle ou script différent. " +
      "Réponds en français, phrases courtes.",
    messages: [
      {
        role: "user",
        content: `Script concurrent :\n"""\n${input.competitorScript.slice(0, 3000)}\n"""\n\nScripts déjà testés dans mon adset :\n${owned}\n\nDonne le verdict, le nom du script proche s'il existe, la raison, l'angle et le hook du script concurrent.`,
      },
    ],
    output_config: { format: zodOutputFormat(ScriptMatch) },
  });
  if (!msg.parsed_output) throw new Error("Réponse IA illisible");
  return msg.parsed_output;
}

export const MorningBrief = z.object({
  headline: z.string(),
  actions: z.array(z.object({ priority: z.enum(["haute", "moyenne", "basse"]), action: z.string(), why: z.string() })),
  recover: z.array(z.object({ competitorAdId: z.string(), why: z.string(), angle: z.string() })),
  alerts: z.array(z.string()),
});
export type MorningBrief = z.infer<typeof MorningBrief>;

export async function writeMorningBrief(apiKey: string, payload: unknown): Promise<MorningBrief> {
  const msg = await client(apiKey).messages.parse({
    model: env.anthropicModel,
    max_tokens: 2000,
    system:
      "Tu es le media buyer d'un e-commerçant qui applique la méthode Zecom à la lettre : décisions aux paliers, CBO, on ne panique pas sur une journée, " +
      "on ne coupe pas un milieu de terrain d'une campagne rentable, nouvelles créas en continu, cartouches = nouvelles créas + nouvelle offre. " +
      "Les verdicts et décisions de budget te sont fournis, déjà calculés par le moteur : ne les contredis pas et n'invente aucun chiffre. " +
      "Tu ne proposes jamais de modifier le budget toi-même : tu rappelles la décision du moteur. " +
      "Pour les concurrents, tu te fies aux données (portée, durée de diffusion, rang, coupes). Réponds en français, concis, actionnable.",
    messages: [
      {
        role: "user",
        content:
          "Voici l'état du jour (JSON). Rédige le brief du matin : une phrase de titre, 3 à 6 actions priorisées, " +
          "les créas concurrentes à récupérer (identifiants fournis uniquement) et les alertes (tracking, stagnation, ad qui monte chez le concurrent).\n\n" +
          JSON.stringify(payload).slice(0, 60_000),
      },
    ],
    output_config: { format: zodOutputFormat(MorningBrief) },
  });
  if (!msg.parsed_output) throw new Error("Réponse IA illisible");
  return msg.parsed_output;
}

/** Vérifie une clé sans consommer de jetons (liste des modèles). */
export async function verifyAnthropicKey(apiKey: string): Promise<void> {
  await client(apiKey).models.list({ limit: 1 });
}
