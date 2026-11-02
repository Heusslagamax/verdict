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
  params: { max_tokens: number; system: string; content: string | Anthropic.ContentBlockParam[] },
): Promise<z.infer<S>> {
  const base = {
    model: env.anthropicModel,
    max_tokens: params.max_tokens,
    system: params.system,
    messages: [{ role: "user" as const, content: params.content }],
    output_config: { format: zodOutputFormat(schema) },
  };
  // « between_tools » = pas de réflexion avant de répondre (forme exigée par les modèles 5.5).
  // Si un autre modèle refuse ce réglage, on relance sans le préciser.
  let msg;
  try {
    msg = await client(apiKey).messages.create({ ...base, thinking: { type: "between_tools" } });
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError) || !/thinking/i.test(e.message)) throw e;
    msg = await client(apiKey).messages.create(base);
  }
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

// ---------- Source d'une pub (quelle pub concurrente elle copie) ----------
export const SourceMatch = z.object({
  competitorAdId: z.string().nullable(),
  confidence: z.enum(["haute", "moyenne", "faible"]),
  reason: z.string(),
});
export type SourceMatch = z.infer<typeof SourceMatch>;

/** Retrouve la pub concurrente dont ma pub est la copie (ou l'itération), y compris d'une langue à l'autre. */
export async function findSource(
  apiKey: string,
  input: { own: { name: string; script: string | null; body: string | null }; candidates: { id: string; competitor: string; text: string }[] },
): Promise<SourceMatch> {
  const list = input.candidates.map((c) => `[${c.id}] ${c.competitor} : ${c.text.slice(0, 500)}`).join("\n");
  return structured(apiKey, SourceMatch, {
    max_tokens: 1500,
    system:
      "Tu retrouves de quelle pub concurrente une pub e-commerce est la copie. Tu compares le SCRIPT et le texte (jamais seulement l'image). " +
      "Les langues peuvent différer : une traduction fidèle ou une itération proche (même structure, même angle) compte comme source. " +
      "Si aucune candidate n'est clairement la source, réponds competitorAdId null. N'utilise qu'un identifiant présent dans la liste. Réponds en français, une phrase.",
    content:
      `Ma pub « ${input.own.name} »\nScript : ${input.own.script?.slice(0, 1500) ?? "(non saisi)"}\nTexte d'annonce : ${input.own.body?.slice(0, 800) ?? "(aucun)"}\n\n` +
      `Pubs concurrentes candidates :\n${list}\n\nQuelle est la source ?`,
  });
}

// ---------- Studio Ads : briefs d'itération ----------
const ELEMENTS = ["traduction_1_1", "hook", "body", "angle", "message", "format", "duree", "acteur_lieu", "offre"] as const;

export const StudioOutput = z.object({
  briefs: z.array(
    z.object({
      element: z.enum(ELEMENTS),
      title: z.string(),
      ruleIds: z.array(z.string()),
      why: z.string(),
      hook: z.object({ text: z.string(), visual: z.string() }),
      script: z.string(),
      scriptFr: z.string(),
      shots: z.array(z.object({ at: z.string(), visual: z.string(), text: z.string() })),
      cta: z.string(),
      adCopy: z.string().nullable(),
      production: z.string(),
    }),
  ),
});
export type StudioOutput = z.infer<typeof StudioOutput>;

/**
 * Écrit les briefs d'itération. Le moteur a déjà décidé QUOI produire (plan) et sous quelles
 * règles ; l'IA écrit les briefs dans ce cadre, sans en sortir.
 */
export async function writeStudioBriefs(apiKey: string, payload: unknown): Promise<StudioOutput> {
  return structured(apiKey, StudioOutput, {
    max_tokens: 14000,
    system:
      "Tu es le creative strategist d'une boutique e-commerce qui applique la méthode Zecom (créas) et les règles de la bibliothèque DTC. " +
      "On te donne une pub source, ses chiffres, un DIAGNOSTIC déjà calculé et un PLAN (élément × nombre). Tu écris exactement les briefs du plan : " +
      "ni plus, ni moins, dans l'ordre, chacun avec l'élément indiqué. Chaque brief applique les règles fournies et cite leurs identifiants dans ruleIds. " +
      "Tu respectes les garde-fous sans exception : pas de faux volume (chaque brief change un élément réel), aucun témoignage, avis, autorité, urgence ou founder story inventés, " +
      "une pub = un avatar, un désir, un message. Script dans la langue du marché, naturel et natif (pas de traduction littérale), 120 mots maximum ; scriptFr = sa traduction française pour validation. " +
      "hook.text = l'accroche (texte à l'écran et/ou voix), hook.visual = le plan des 3-4 premières secondes. shots = 4 à 8 plans avec repère de temps. " +
      "production = comment la produire avec les outils simples de la méthode (CapCut, ElevenLabs, Canva, plans du concurrent ou B-rolls), en 2-3 phrases. " +
      "why = pourquoi ce brief, relié aux chiffres et au diagnostic, en une ou deux phrases. Réponds en français (sauf script).",
    content: JSON.stringify(payload).slice(0, 50_000),
  });
}

// ---------- Rapprochement : fiche d'une créa et jugement d'une paire ----------
const jpeg = (b64: string): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });

export const CreativeCard = z.object({
  format: z.string(),
  concept: z.string(),
  angle: z.string(),
  message: z.string(),
  hook: z.object({ text: z.string(), visual: z.string() }),
  awareness: z.enum(["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"]),
  avatar: z.string(),
  offer: z.string().nullable(),
  keyShots: z.array(z.string()),
});
export type CreativeCard = z.infer<typeof CreativeCard>;

/** Fiche d'une créa à partir de ses images clés et de son texte, toujours en français (comparable d'une langue à l'autre). */
export async function analyzeCreative(
  apiKey: string,
  input: { frames: { t: number; b64: string }[]; script: string | null; body: string | null; isVideo: boolean },
): Promise<CreativeCard> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const f of input.frames) {
    content.push({ type: "text", text: input.isVideo ? `Image à ${f.t} s :` : "Visuel :" });
    content.push(jpeg(f.b64));
  }
  content.push({
    type: "text",
    text:
      `Script ou transcription : ${input.script?.slice(0, 2500) ?? "(aucun)"}\nTexte d'annonce : ${input.body?.slice(0, 1200) ?? "(aucun)"}\n\n` +
      "Fais la fiche de cette créa publicitaire.",
  });
  return structured(apiKey, CreativeCard, {
    max_tokens: 2000,
    system:
      "Tu es creative strategist e-commerce (méthode Zecom). Tu décris une pub à partir de ses images clés et de son texte, en FRANÇAIS même si la pub est dans une autre langue, " +
      "pour pouvoir la comparer à d'autres pubs. format = type de créa (UGC face cam, mashup voix off, statique offre, avant/après, VSL…). concept = la grande idée. " +
      "angle = déclencheur émotionnel + lutte ou résultat visé. message = la promesse précise. hook = accroche (texte/voix) et ce qu'on voit dans les premières secondes. " +
      "avatar = à qui elle parle. offer = l'offre visible (ex. 1+1 offert) ou null. keyShots = 3 à 6 plans marquants décrits en quelques mots (objets, gestes, lieux, personnes). Phrases courtes, factuelles.",
    content,
  });
}

export const MatchVerdict = z.object({
  relation: z.enum(["copie_1_1", "iteration", "meme_angle", "different"]),
  confidence: z.enum(["haute", "moyenne", "faible"]),
  criteria: z.object({ images: z.boolean(), script: z.boolean(), angle: z.boolean(), hook: z.boolean(), offre: z.boolean() }),
  evidence: z.string(),
});
export type MatchVerdict = z.infer<typeof MatchVerdict>;

/** Juge si ma pub copie la pub concurrente, critère par critère, images à l'appui. */
export async function judgeMatch(
  apiKey: string,
  input: {
    own: { name: string; card: CreativeCard | null; script: string | null; frames: { t: number; b64: string }[] };
    competitor: { name: string; card: CreativeCard | null; script: string | null; frames: { t: number; b64: string }[] };
    imageMatch: { share: number; pairs: { a: number; b: number; distance: number }[] };
  },
): Promise<MatchVerdict> {
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: `MA PUB « ${input.own.name} » :` }];
  for (const f of input.own.frames) content.push({ type: "text", text: `${f.t} s` }, jpeg(f.b64));
  content.push({ type: "text", text: `PUB CONCURRENTE « ${input.competitor.name} » :` });
  for (const f of input.competitor.frames) content.push({ type: "text", text: `${f.t} s` }, jpeg(f.b64));
  content.push({
    type: "text",
    text: JSON.stringify({
      maFiche: input.own.card,
      monScript: input.own.script?.slice(0, 2000) ?? null,
      ficheConcurrente: input.competitor.card,
      scriptConcurrent: input.competitor.script?.slice(0, 2000) ?? null,
      empreintesVisuelles: {
        partDesPlansRetrouves: Math.round(input.imageMatch.share * 100),
        pairesDePlans: input.imageMatch.pairs,
      },
    }),
  });
  return structured(apiKey, MatchVerdict, {
    max_tokens: 1200,
    system:
      "Tu compares deux pubs pour savoir si la première est la copie de la seconde. Tu regardes les IMAGES (mêmes plans, mêmes acteurs, mêmes décors, même produit filmé pareil) " +
      "ET le SCRIPT (une traduction fidèle compte comme le même script), jamais l'image seule. Les empreintes visuelles mesurées sont un indice fiable : des plans retrouvés à distance ≤ 10 sont les mêmes images. " +
      "copie_1_1 = mêmes images et même script (même traduit) ; iteration = même base (images ou script) avec un élément changé (hook, voix, durée, acteur…) ; " +
      "meme_angle = images et script différents mais même angle et même message ; different = rien de tout ça. " +
      "criteria : images = des plans identiques sont visibles ; script = même texte (traduit ou non) ; angle = même angle ; hook = même accroche ou même plan d'ouverture ; offre = même offre. " +
      "confidence haute seulement si les preuves sont nettes. evidence = 1 à 2 phrases en français qui citent les preuves (ex. « le plan de la basket à 2 s est le même qu'à 14 s chez le concurrent »).",
    content,
  });
}
