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

/**
 * Appel à sortie structurée, robuste : pas de réflexion interne (elle consommait le budget de
 * jetons et coupait le JSON), contrôle de `stop_reason` avant de lire, et validation zod.
 */
async function structured<S extends z.ZodType>(
  apiKey: string,
  schema: S,
  params: { max_tokens: number; system: string; content: string },
): Promise<z.infer<S>> {
  const msg = await client(apiKey).messages.create({
    model: env.anthropicModel,
    max_tokens: params.max_tokens,
    thinking: { type: "disabled" },
    system: params.system,
    messages: [{ role: "user", content: params.content }],
    output_config: { format: zodOutputFormat(schema) },
  });
  if (msg.stop_reason === "max_tokens") {
    throw new Error("réponse trop longue, coupée avant la fin. Relance : la consigne demande désormais un brief plus court.");
  }
  if (msg.stop_reason === "refusal") throw new Error("le modèle a refusé de répondre.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("réponse IA illisible (JSON invalide).");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("réponse IA hors format.");
  return parsed.data;
}

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
  return structured(apiKey, ScriptMatch, {
    max_tokens: 3000,
    system:
      "Tu es le creative strategist d'un e-commerçant qui traduit des créas concurrentes (souvent du français vers l'italien). " +
      "Tu compares le SCRIPT (texte parlé ou écrit), jamais seulement l'image. Les langues peuvent différer : une traduction fidèle est un doublon. " +
      "doublon = même script ou traduction ; iteration = même structure et même angle mais hook ou preuve différents ; nouveau = angle ou script différent. " +
      "Réponds en français, phrases courtes : raison en 2 phrases maximum, angle et hook en une ligne chacun.",
    content: `Script concurrent :\n"""\n${input.competitorScript.slice(0, 3000)}\n"""\n\nScripts déjà testés dans mon adset :\n${owned}\n\nDonne le verdict, le nom du script proche s'il existe, la raison, l'angle et le hook du script concurrent.`,
  });
}

export const MorningBrief = z.object({
  headline: z.string(),
  actions: z.array(z.object({ priority: z.enum(["haute", "moyenne", "basse"]), action: z.string(), why: z.string() })),
  recover: z.array(z.object({ competitorAdId: z.string(), why: z.string(), angle: z.string() })),
  alerts: z.array(z.string()),
});
export type MorningBrief = z.infer<typeof MorningBrief>;

export async function writeMorningBrief(apiKey: string, payload: unknown): Promise<MorningBrief> {
  return structured(apiKey, MorningBrief, {
    max_tokens: 8000,
    system:
      "Tu es le media buyer d'un e-commerçant qui applique la méthode Zecom à la lettre : décisions aux paliers, CBO, on ne panique pas sur une journée, " +
      "on ne coupe pas un milieu de terrain d'une campagne rentable, nouvelles créas en continu, cartouches = nouvelles créas + nouvelle offre. " +
      "Les verdicts et décisions de budget te sont fournis, déjà calculés par le moteur : ne les contredis pas et n'invente aucun chiffre. " +
      "Tu ne proposes jamais de modifier le budget toi-même : tu rappelles la décision du moteur. " +
      "Pour les concurrents, tu te fies aux données (portée, durée de diffusion, rang, coupes). " +
      "Réponds en français, style télégraphique : chaque champ tient en une ou deux phrases courtes.",
    content:
      "Voici l'état du jour (JSON). Rédige le brief du matin : une phrase de titre, 3 à 6 actions priorisées, " +
      "au plus 5 créas concurrentes à récupérer (identifiants fournis uniquement, les plus fortes d'abord) et au plus 5 alertes " +
      "(tracking, stagnation, ad qui monte chez le concurrent). Ne recopie pas les scripts.\n\n" +
      JSON.stringify(payload).slice(0, 60_000),
  });
}

/** Vérifie une clé sans consommer de jetons (liste des modèles). */
export async function verifyAnthropicKey(apiKey: string): Promise<void> {
  await client(apiKey).models.list({ limit: 1 });
}
