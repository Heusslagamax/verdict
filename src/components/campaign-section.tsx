import type { CampaignView } from "@/lib/data/views";
import type { CampaignActionCode, Thresholds, VerdictCode, Window } from "@/lib/types";
import { eur, int, roas, WINDOW_LABEL } from "@/lib/format";
import { AdsTable } from "./ads-table";
import { PalierTrack } from "./palier-track";
import { RoasRuler } from "./roas-ruler";
import { Figure, Panel, Stamp } from "./ui";

const ACTION_CODE: Record<CampaignActionCode, VerdictCode> = {
  augmenter: "keep",
  scaling: "keep",
  continuer: "wait",
  ne_pas_toucher: "wait",
  optimisation: "watch",
  plancher: "watch",
  descaler: "watch",
  couper: "cut",
};

export function CampaignSection({
  c,
  t,
  window,
  shopSlug,
  pnl,
}: {
  c: CampaignView;
  t: Thresholds | null;
  window: Window;
  shopSlug: string;
  pnl: { roas3d: number | null; roasYesterday: number | null; error: string | null } | null;
}) {
  const ads = c.adsets.flatMap((s) => s.ads);
  const d = c.decision;
  const adsets = c.adsets.length;

  return (
    <Panel className="rise overflow-hidden">
      {/* Décision de campagne : la réponse à « que fais-je aujourd'hui ? » */}
      <div className="grid gap-6 border-b border-rule-1 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="truncate text-[17px] font-semibold">{c.name}</h2>
            <span className="text-[12px] text-chalk-3">
              CBO · {c.dailyBudget != null ? `${eur(c.dailyBudget, 0)}/jour` : "budget non lu"} · {adsets} adset{adsets > 1 ? "s" : ""} · {ads.length} ads · {eur(c.lifetimeSpend, 0)} depuis le lancement
            </span>
          </div>
          {d ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Stamp code={ACTION_CODE[d.action]} className="h-7 px-2.5 text-[13px]">
                  {d.label}
                  {d.nextBudget != null && (d.action === "augmenter" || d.action === "descaler" || d.action === "scaling")
                    ? ` → ${eur(d.nextBudget, 0)}/jour`
                    : ""}
                </Stamp>
                <span className="text-[12px] text-chalk-3">{d.source}</span>
              </div>
              <p className="mt-2 max-w-[68ch] text-[14px] leading-6 text-chalk-1">{d.rule}</p>
              <p className="num mt-1 text-[12px] text-chalk-3">
                {d.computation}
                {d.roasSource === "meta" && pnl?.error ? ` · P&L illisible : ${pnl.error}` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-watch">Renseigne les seuils de cette boutique dans Réglages pour obtenir les verdicts.</p>
          )}
        </div>
        <div className="flex flex-col justify-end gap-3">
          <span className="text-[12px] text-chalk-3">Paliers Zecom · budget actuel {d?.nextBudget != null && d.nextBudget !== c.dailyBudget ? "et cible" : ""}</span>
          <PalierTrack current={c.dailyBudget} next={d?.nextBudget ?? null} />
          <p className="text-[12px] text-chalk-3">Le cockpit est en lecture seule : le budget se change dans le Gestionnaire de publicités.</p>
        </div>
      </div>

      {/* Chiffres de la période : du texte, pas des tuiles */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-rule-1 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label={`Dépense · ${WINDOW_LABEL[window]}`} value={eur(c.totals.spend)} />
        <Figure label="CA Meta" value={eur(c.totals.value)} />
        <Figure label="ROAS Meta" value={roas(c.totals.roas)} tone="signal" />
        <Figure
          label="ROAS P&L · 3 j / hier"
          value={pnl && !pnl.error ? `${roas(pnl.roas3d)} / ${roas(pnl.roasYesterday)}` : "—"}
          sub={pnl ? (pnl.error ? "P&L illisible" : "source des décisions de budget") : "P&L non branché"}
        />
        <Figure label="Achats" value={int(c.totals.purchases)} sub={`CPA ${eur(c.totals.cpa)}`} />
        <Figure label="Coût / ajout panier" value={eur(c.totals.costPerAtc)} sub={t ? `cible ${eur(t.atcTarget)}` : undefined} />
      </div>

      {t ? (
        <div className="border-b border-rule-1 px-5 pb-4 pt-5">
          <RoasRuler
            t={t}
            campaignRoas={c.totals.roas}
            points={ads.map((a) => ({ id: a.id, name: a.name, roas: a.totals.roas, spend: a.totals.spend, purchases: a.totals.purchases, code: a.verdict?.code ?? null }))}
            onSelectHref={(id) => `/${shopSlug}?w=${window}&ad=${id}`}
          />
        </div>
      ) : null}

      <div className="px-5 pb-3 pt-4">
        <AdsTable ads={ads} thresholds={t} shopSlug={shopSlug} campaignId={c.id} />
      </div>
    </Panel>
  );
}
