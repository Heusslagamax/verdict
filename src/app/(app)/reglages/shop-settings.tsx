"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { Shop, Thresholds } from "@/lib/types";
import { thresholdsFromInputs } from "@/lib/engine/metrics";
import { roas as fr } from "@/lib/format";
import { addCompetitorAction, deleteShopAction, removeCompetitorAction, saveProductBriefAction, saveShopSettings, type ActionResult } from "@/app/actions";
import type { MetaAccount } from "@/lib/adapters/meta";
import { Panel } from "@/components/ui";

const FIELDS: { key: keyof Thresholds; label: string; hint: string }[] = [
  { key: "loss20", label: "ROAS −20 %", hint: "coupe en testing" },
  { key: "be", label: "ROAS BE", hint: "marge nette nulle" },
  { key: "targetLow", label: "Bas de range", hint: "15 % de marge" },
  { key: "target", label: "ROAS target", hint: "20 % de marge" },
  { key: "jump", label: "Saut de palier", hint: "30 % de marge" },
  { key: "atcTarget", label: "Coût/ATC cible", hint: "20 % de l'AOV, en €" },
  { key: "aov", label: "Panier de référence", hint: "prix offre 1, en €" },
];

const toNum = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) && s.trim() !== "" ? n : null;
};

export function ShopSettings({
  shop,
  competitors,
  accounts,
  isOwner,
}: {
  shop: Shop;
  competitors: { id: string; name: string; brandtrackerId: string }[];
  /** Comptes pub lisibles avec le jeton Meta de l'espace (vide si pas de jeton). */
  accounts: MetaAccount[];
  isOwner: boolean;
}) {
  const [t, setT] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, shop.thresholds?.[f.key] != null ? String(shop.thresholds[f.key]).replace(".", ",") : ""])),
  );
  const [pnl, setPnl] = useState(shop.pnl ?? { dateColumn: "A", spendColumn: "", salesColumn: "", roasColumn: "" });
  const [account, setAccount] = useState(shop.metaAdAccountId ?? "");
  const [calc, setCalc] = useState({ price: "", cogs: "", psp: "3", pspFixed: "0", tax: "22", other: "0" });
  const [competitorQuery, setCompetitorQuery] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setResult(null);
      try {
        setResult(await fn());
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : "Erreur" });
      }
    });

  const applyCalc = () => {
    const price = toNum(calc.price);
    const cogs = toNum(calc.cogs);
    if (!price || cogs == null) {
      setResult({ ok: false, message: "Renseigne au moins le prix et le COGS." });
      return;
    }
    const r = thresholdsFromInputs({
      price,
      cogs,
      pspPct: (toNum(calc.psp) ?? 0) / 100,
      pspFixed: toNum(calc.pspFixed) ?? 0,
      taxPct: (toNum(calc.tax) ?? 0) / 100,
      otherPct: (toNum(calc.other) ?? 0) / 100,
    });
    const round = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace(".", ",") : "");
    setT({
      loss20: round(r.loss20),
      be: round(r.be),
      targetLow: round(r.targetLow),
      target: round(r.target),
      jump: round(r.jump),
      atcTarget: round(r.atcTarget),
      aov: round(r.aov),
    });
    setResult({ ok: true, message: `Seuils calculés (marge avant pub ${Math.round(r.marginBeforeAds * 1000) / 10} %). Vérifie puis enregistre.` });
  };

  const save = () => {
    const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, toNum(t[f.key] ?? "")]));
    const required = FIELDS.filter((f) => f.key !== "jump").every((f) => parsed[f.key] != null);
    const anyFilled = FIELDS.some((f) => parsed[f.key] != null);
    if (anyFilled && !required) {
      setResult({ ok: false, message: "Remplis tous les seuils (le saut de palier est facultatif)." });
      return;
    }
    run(() =>
      saveShopSettings(shop.slug, {
        thresholds: anyFilled ? (parsed as unknown as Thresholds) : null,
        pnl: pnl.spendColumn && pnl.salesColumn && pnl.roasColumn ? { ...pnl, dateColumn: pnl.dateColumn || "A" } : null,
        metaAdAccountId: account || null,
      }),
    );
  };

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{shop.name}</h2>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-chalk-3">Marché {shop.market}</span>
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Supprimer la boutique ${shop.name} et tout son historique dans Verdict ? Rien n'est supprimé chez Meta.`)) {
                  run(() => deleteShopAction(shop.slug));
                }
              }}
              className="press rounded-[7px] px-2 py-1 text-[12px] text-chalk-3 hover:bg-ink-3 hover:text-cut"
            >
              Supprimer
            </button>
          ) : null}
        </div>
      </div>

      <section className="mt-5">
        <h3 className="text-[13px] font-medium text-chalk-2">Seuils ROAS</h3>
        <p className="mt-0.5 text-[12px] text-chalk-3">Repris de ton fichier « Calcul ROAS BE & TARGET », ou calculés ci-dessous.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {FIELDS.map((f) => (
            <label key={f.key} className="block min-w-0">
              <span className="block truncate text-[12px] text-chalk-2">{f.label}</span>
              <input
                inputMode="decimal"
                value={t[f.key] ?? ""}
                onChange={(e) => setT({ ...t, [f.key]: e.target.value })}
                className="num mt-1 h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-2.5 text-[14px] focus:border-rule-3 focus:outline-none"
              />
              <span className="mt-1 block truncate text-[11px] text-chalk-3">{f.hint}</span>
            </label>
          ))}
        </div>

        <details className="mt-4 rounded-[var(--radius-m)] border border-rule-1 px-4 py-3">
          <summary className="cursor-pointer text-[13px] text-chalk-2">Calculer depuis le produit (formules de ton fichier)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["price", "Prix offre 1 (€)"],
                ["cogs", "COGS (€)"],
                ["psp", "Frais PSP (%)"],
                ["pspFixed", "PSP fixe (€)"],
                ["tax", "TVA ou URSSAF (% du TTC)"],
                ["other", "Autres frais (%)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="block min-w-0">
                <span className="block truncate text-[12px] text-chalk-2">{label}</span>
                <input
                  inputMode="decimal"
                  value={calc[k]}
                  onChange={(e) => setCalc({ ...calc, [k]: e.target.value })}
                  className="num mt-1 h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-2.5 text-[14px] focus:border-rule-3 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={applyCalc} className="press mt-3 h-9 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-3.5 text-[13px] hover:border-rule-3">
            Calculer les seuils
          </button>
          {toNum(t.be ?? "") ? (
            <span className="num ml-3 text-[12px] text-chalk-3">
              BE {fr(toNum(t.be ?? ""))} · target {fr(toNum(t.target ?? ""))}
            </span>
          ) : null}
        </details>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-[13px] font-medium text-chalk-2">Compte publicitaire Meta</h3>
          {accounts.length ? (
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="mt-2 h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-2.5 text-[14px] focus:border-rule-3 focus:outline-none"
            >
              <option value="">Choisir un compte…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.id}
                  {a.active ? "" : " (inactif)"}
                </option>
              ))}
              {account && !accounts.some((a) => a.id === account) ? <option value={account}>{account} (non lisible avec ce jeton)</option> : null}
            </select>
          ) : (
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="1234567890"
              className="num mt-2 h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-2.5 text-[14px] focus:border-rule-3 focus:outline-none"
            />
          )}
          <p className="mt-1 text-[11px] text-chalk-3">
            {accounts.length ? "Comptes que ton jeton Meta peut lire." : "Ajoute ton jeton Meta dans Connexions pour choisir dans la liste."}
          </p>
        </div>
        <div>
          <h3 className="text-[13px] font-medium text-chalk-2">Colonnes du DAILY REPORT</h3>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {(
              [
                ["dateColumn", "Date"],
                ["spendColumn", "FB Ads"],
                ["salesColumn", "Ventes"],
                ["roasColumn", "ROAS"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="block">
                <span className="block text-[11px] text-chalk-3">{label}</span>
                <input
                  value={pnl[k]}
                  maxLength={2}
                  onChange={(e) => setPnl({ ...pnl, [k]: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
                  className="num mt-1 h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-2.5 text-center text-[14px] focus:border-rule-3 focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="press h-9 rounded-[var(--radius-m)] bg-chalk-1 px-4 text-[13px] font-medium text-ink-0 hover:bg-white disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {result ? (
          <span role="status" className={`text-[12px] ${result.ok ? "text-keep" : "text-cut"}`}>
            {result.message}
          </span>
        ) : null}
      </div>

      <ProductBrief slug={shop.slug} initial={shop.productBrief ?? ""} />

      <section className="mt-6 border-t border-rule-1 pt-5">
        <h3 className="text-[13px] font-medium text-chalk-2">Concurrents suivis</h3>
        <ul className="mt-2">
          {competitors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-rule-1 py-2.5 text-[13px]">
              <span>
                {c.name} <span className="num ml-2 text-[11px] text-chalk-3">{c.brandtrackerId.slice(0, 8)}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Retirer ${c.name} du radar ? Son historique sera supprimé.`)) run(() => removeCompetitorAction(c.id));
                }}
                className="press grid size-8 place-items-center rounded-[7px] text-chalk-3 hover:bg-ink-3 hover:text-cut"
                aria-label={`Retirer ${c.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {!competitors.length ? <li className="py-2 text-[13px] text-chalk-3">Aucun concurrent pour l&apos;instant.</li> : null}
        </ul>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (competitorQuery.trim().length < 2) {
              setResult({ ok: false, message: "Entre un nom de marque, un domaine ou un identifiant de brand tracker." });
              return;
            }
            run(() => addCompetitorAction(shop.slug, competitorQuery));
            setCompetitorQuery("");
          }}
        >
          <input
            value={competitorQuery}
            onChange={(e) => setCompetitorQuery(e.target.value)}
            placeholder="shopbagit.com, Inolyo ou identifiant brand tracker"
            className="h-10 min-w-0 flex-1 rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-3 text-[13px] placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none"
          />
          <button disabled={pending} className="press h-10 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-3.5 text-[13px] hover:border-rule-3 disabled:opacity-60">
            Ajouter
          </button>
        </form>
        <p className="mt-2 text-[12px] text-chalk-3">La marque doit être suivie dans ton Brand Tracker TrendTrack. La recherche ne coûte aucun crédit.</p>
      </section>
    </Panel>
  );
}

/** Contexte produit pour le Studio Ads : l'IA écrit des briefs plus justes quand elle sait ce qu'on vend. */
function ProductBrief({ slug, initial }: { slug: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="mt-6 border-t border-rule-1 pt-5">
      <h3 className="text-[13px] font-medium text-chalk-2">Fiche produit (Studio Ads)</h3>
      <p className="mt-0.5 text-[12px] text-chalk-3">Produit, offre et prix, promesse, avatar, objections. Quelques lignes suffisent : le Studio s&apos;en sert pour écrire les briefs.</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        maxLength={3000}
        placeholder="Ex. Sangle rotulienne à coussin d'air, 1+1 à 39,90 €, 2+2 à 59,90 €, livraison offerte. Promesse : marcher et monter les escaliers sans douleur au genou. Avatar : 50-70 ans, actif, douleurs rotuliennes. Objection : « ça ne tient pas en place »."
        className="mt-2 w-full resize-y rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-3 py-2 text-[13px] leading-5 text-chalk-1 placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || value === initial}
          onClick={() => start(async () => setResult(await saveProductBriefAction(slug, value)))}
          className="press h-9 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-3.5 text-[13px] hover:border-rule-3 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer la fiche"}
        </button>
        {result ? <span role="status" className={`text-[12px] ${result.ok ? "text-keep" : "text-cut"}`}>{result.message}</span> : null}
      </div>
    </section>
  );
}
