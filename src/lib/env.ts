import "server-only";

/**
 * Configuration de la plateforme. Les clés Meta, TrendTrack et Anthropic ne sont PAS ici :
 * chaque espace saisit les siennes (chiffrées en base, voir lib/workspace.ts).
 */
const e = process.env;

export const env = {
  supabaseUrl: e.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseServiceKey: e.SUPABASE_SECRET_KEY ?? "",

  metaGraphVersion: e.META_GRAPH_VERSION ?? "v26.0",
  trendtrackRows: Number(e.TRENDTRACK_ROWS ?? 15),
  anthropicModel: e.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",

  /** Compte de service Google de la plateforme : chaque espace partage son P&L avec lui. */
  googleServiceAccountJson: e.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  pnlSheetName: e.PNL_SHEET_NAME ?? "DAILY REPORT",

  cronSecret: e.CRON_SECRET ?? "",
  metaStaleMinutes: Number(e.META_STALE_MINUTES ?? 10),
};

export const platform = {
  supabase: Boolean(env.supabaseUrl && env.supabaseKey && env.supabaseServiceKey),
  googleSheets: Boolean(env.googleServiceAccountJson),
};

/** Mode démo : aucune base configurée → données fictives, pas de connexion. */
export const demoMode = !platform.supabase;

export function googleServiceAccountEmail(): string | null {
  if (!env.googleServiceAccountJson) return null;
  try {
    return (JSON.parse(env.googleServiceAccountJson) as { client_email?: string }).client_email ?? null;
  } catch {
    return null;
  }
}
