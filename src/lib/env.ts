import "server-only";

/** Lecture centralisée des variables d'environnement + drapeaux de fonctionnalités. */
const e = process.env;

export const env = {
  supabaseUrl: e.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseServiceKey: e.SUPABASE_SECRET_KEY ?? "",

  metaToken: e.META_ACCESS_TOKEN ?? "",
  metaGraphVersion: e.META_GRAPH_VERSION ?? "v26.0",

  trendtrackKey: e.TRENDTRACK_API_KEY ?? "",
  trendtrackRows: Number(e.TRENDTRACK_ROWS ?? 15),

  anthropicKey: e.ANTHROPIC_API_KEY ?? "",
  anthropicModel: e.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",

  googleServiceAccountJson: e.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  pnlSpreadsheetId: e.PNL_SPREADSHEET_ID ?? "",
  pnlSheetName: e.PNL_SHEET_NAME ?? "DAILY REPORT",

  cronSecret: e.CRON_SECRET ?? "",
  /** Fraîcheur maximale des données Meta avant resynchronisation automatique. */
  metaStaleMinutes: Number(e.META_STALE_MINUTES ?? 10),
};

export const features = {
  supabase: Boolean(env.supabaseUrl && env.supabaseKey),
  meta: Boolean(env.metaToken),
  trendtrack: Boolean(env.trendtrackKey),
  ai: Boolean(env.anthropicKey),
  pnl: Boolean(env.googleServiceAccountJson && env.pnlSpreadsheetId),
};

/** Mode démo : aucune base configurée → données fictives, pas de connexion. */
export const demoMode = !features.supabase;
