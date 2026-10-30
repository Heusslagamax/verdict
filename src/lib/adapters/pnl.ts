import "server-only";
import { JWT } from "google-auth-library";
import { env } from "@/lib/env";
import type { PnlDay, PnlMapping } from "@/lib/types";

/**
 * Lecture de l'onglet DAILY REPORT du P&L (Google Sheets) avec un compte de service en
 * lecture seule. Le ROAS du P&L est la source de vérité pour les décisions de budget.
 * Une ligne = un jour (« 30 oct. »), un bloc de colonnes par boutique.
 */

const MONTHS: Record<string, number> = {
  janv: 0, jan: 0, fevr: 1, févr: 1, fev: 1, mars: 2, avr: 3, mai: 4, juin: 5,
  juil: 6, aout: 7, août: 7, sept: 8, oct: 9, nov: 10, dec: 11, déc: 11,
};

export function parseFrenchDay(label: string, year: number): string | null {
  const m = label.trim().toLowerCase().match(/^(\d{1,2})\s+([a-zéûè]+)\.?$/);
  if (!m) return null;
  const month = MONTHS[m[2]] ?? MONTHS[m[2].normalize("NFD").replace(/[̀-ͯ]/g, "")];
  if (month == null) return null;
  const d = new Date(Date.UTC(year, month, Number(m[1])));
  return d.toISOString().slice(0, 10);
}

export function parseFrenchNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const clean = v.replace(/[€\s %]/g, "").replace(/\./g, "").replace(",", ".");
  if (clean === "" || clean.startsWith("#")) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function colIndex(letter: string): number {
  return letter
    .toUpperCase()
    .split("")
    .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

async function token(): Promise<string> {
  const creds = JSON.parse(env.googleServiceAccountJson) as { client_email: string; private_key: string };
  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const { token: t } = await jwt.getAccessToken();
  if (!t) throw new Error("Jeton Google indisponible");
  return t;
}

export async function fetchPnlDays(mapping: PnlMapping, today: Date): Promise<PnlDay[]> {
  const range = encodeURIComponent(`'${env.pnlSheetName}'!A1:BZ400`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.pnlSpreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Google Sheets ${res.status}`);
  const { values = [] } = (await res.json()) as { values?: string[][] };
  const year = today.getUTCFullYear();
  const [di, si, sa, ro] = [mapping.dateColumn, mapping.spendColumn, mapping.salesColumn, mapping.roasColumn].map(colIndex);
  const out: PnlDay[] = [];
  for (const row of values) {
    const date = parseFrenchDay(row[di] ?? "", year);
    if (!date) continue;
    const spend = parseFrenchNumber(row[si]) ?? 0;
    const sales = parseFrenchNumber(row[sa]) ?? 0;
    if (!spend && !sales) continue;
    out.push({ date, spend, sales, roas: parseFrenchNumber(row[ro]) ?? (spend ? sales / spend : null) });
  }
  return out;
}

/** ROAS 3 jours (Σ ventes / Σ dépense des 3 derniers jours complets) et ROAS d'hier. */
export function pnlRoas(days: PnlDay[], today: Date): { roas3d: number | null; roasYesterday: number | null } {
  const iso = (offset: number) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last3 = [1, 2, 3].map((o) => byDate.get(iso(o))).filter(Boolean) as PnlDay[];
  const spend = last3.reduce((a, d) => a + d.spend, 0);
  const sales = last3.reduce((a, d) => a + d.sales, 0);
  const y = byDate.get(iso(1));
  return {
    roas3d: last3.length && spend > 0 ? sales / spend : null,
    roasYesterday: y && y.spend > 0 ? y.sales / y.spend : null,
  };
}
