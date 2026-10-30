import { describe, expect, it } from "vitest";
import { decideCampaign, judgeAd, nextPalier, previousPalier } from "./verdict";
import { sumDays, thresholdsFromInputs } from "./metrics";
import { readCompetitorAd } from "./competitors";
import type { MetaCampaign, Thresholds, Totals, CompetitorAd } from "@/lib/types";

const TODAY = new Date("2026-10-30T09:00:00Z");

const t145: Thresholds = { be: 1.45, targetLow: 1.8, target: 2, loss20: 1.16, jump: 2.6, atcTarget: 12.5, aov: 62.5 };

function campaign(over: Partial<MetaCampaign>): MetaCampaign {
  return {
    id: "c1",
    name: "T1",
    status: "ACTIVE",
    dailyBudget: 50,
    createdTime: "2026-10-26T00:00:00Z",
    lifetimeSpend: 0,
    lifetimeValue: 0,
    lifetimeAddToCart: 0,
    lifetimeLinkClicks: 0,
    lifetimePurchases: 0,
    firstDeliveryDate: "2026-10-27",
    ...over,
  };
}

const empty: Totals = sumDays([]);

function totals(spend: number, value: number, extra: Partial<Totals> = {}): Totals {
  return { ...empty, spend, value, roas: spend ? value / spend : null, ...extra };
}

describe("seuils (formules Zecom 7.2)", () => {
  it("retrouve l'exemple chiffré de la formation (49,90 €, COGS 12 €, micro)", () => {
    const r = thresholdsFromInputs({ price: 49.9, cogs: 12, pspPct: 0.029, pspFixed: 0.3, taxPct: 0.123, otherPct: 0 });
    expect(r.be).toBeCloseTo(1.66, 2);
    expect(r.targetLow).toBeCloseTo(2.21, 2);
    expect(r.target).toBeCloseTo(2.49, 2);
    expect(r.loss20).toBeCloseTo(1.25, 2); // formule du fichier utilisateur : 1 / (m + 0,20)
    expect(r.jump).toBeCloseTo(3.32, 2);
    expect(r.atcTarget).toBeCloseTo(9.98, 2);
  });

  it("retrouve la ligne Norveline du fichier « Calcul ROAS BE & TARGET »", () => {
    const r = thresholdsFromInputs({ price: 55.45, cogs: 11.25, pspPct: 0.03, pspFixed: 0, taxPct: 0.22, otherPct: 0 });
    expect(r.be).toBeCloseTo(1.83, 2);
    expect(r.targetLow).toBeCloseTo(2.52, 2);
    expect(r.target).toBeCloseTo(2.88, 2);
    expect(r.loss20).toBeCloseTo(1.34, 2);
    expect(r.atcTarget).toBeCloseTo(11.09, 2);
  });
});

describe("paliers", () => {
  it("monte et descend selon la grille", () => {
    expect(nextPalier(50)).toBe(100);
    expect(nextPalier(150, 1)).toBe(300);
    expect(nextPalier(200)).toBe(300);
    expect(previousPalier(100)).toBe(50);
    expect(previousPalier(300)).toBe(200);
    expect(previousPalier(50)).toBe(50);
  });
});

describe("décision de campagne — testing", () => {
  const base = { thresholds: t145, meta3d: empty, metaYesterday: empty, today: TODAY };

  it("J1 : 0 vente, CPC 1,18 € → couper", () => {
    const d = decideCampaign({ ...base, campaign: campaign({ lifetimeSpend: 50, lifetimeLinkClicks: 42 }) });
    expect(d.action).toBe("couper");
  });
  it("J1 : 0 vente, CPC 0,84 € → continuer", () => {
    const d = decideCampaign({ ...base, campaign: campaign({ lifetimeSpend: 50, lifetimeLinkClicks: 60 }) });
    expect(d.action).toBe("continuer");
  });
  it("J2 : ROAS 1,20 et coût/ATC 11,45 € → continuer (exemple formation)", () => {
    const d = decideCampaign({
      ...base,
      campaign: campaign({ lifetimeSpend: 100, lifetimeValue: 120, lifetimeAddToCart: 100 / 11.45, lifetimePurchases: 2 }),
    });
    expect(d.action).toBe("continuer");
  });
  it("J2 : ROAS 1,25 et coût/ATC 14 € → couper (exemple formation)", () => {
    const d = decideCampaign({
      ...base,
      campaign: campaign({ lifetimeSpend: 100, lifetimeValue: 125, lifetimeAddToCart: 100 / 14, lifetimePurchases: 2 }),
    });
    expect(d.action).toBe("couper");
  });
  it("J4 : ROAS 1,80 → optimisation ; 2,15 → scaling (exemple formation)", () => {
    const opti = decideCampaign({ ...base, campaign: campaign({ lifetimeSpend: 200, lifetimeValue: 360, lifetimePurchases: 6 }) });
    expect(opti.action).toBe("optimisation");
    const scale = decideCampaign({ ...base, campaign: campaign({ lifetimeSpend: 200, lifetimeValue: 430, lifetimePurchases: 7 }) });
    expect(scale.action).toBe("scaling");
    expect(scale.nextBudget).toBe(100);
  });
});

describe("décision de campagne — scaling (tableau 10.3 de la formation)", () => {
  const t: Thresholds = { be: 1.54, targetLow: 2.0, target: 2.17, loss20: 1.23, jump: 3.5, atcTarget: 12, aov: 60 };
  const old = campaign({ lifetimeSpend: 2000, lifetimeValue: 5000, firstDeliveryDate: "2026-09-01" });
  const run = (r3: number, ry: number | null, budget: number) =>
    decideCampaign({
      campaign: { ...old, dailyBudget: budget },
      thresholds: t,
      pnl: { roas3d: r3, roasYesterday: ry },
      meta3d: empty,
      metaYesterday: empty,
      today: TODAY,
    });

  it("2,98 / 2,18 à 50 € → augmenter à 100", () => {
    const d = run(2.98, 2.18, 50);
    expect(d.action).toBe("augmenter");
    expect(d.nextBudget).toBe(100);
    expect(d.roasSource).toBe("pnl");
  });
  it("2,18 / 0,80 → ne pas toucher (scénario 2)", () => expect(run(2.18, 0.8, 100).action).toBe("ne_pas_toucher"));
  it("2,10 → ne pas toucher (scénario 3)", () => expect(run(2.1, 1.5, 100).action).toBe("ne_pas_toucher"));
  it("1,86 à 100 € → descaler à 50", () => {
    const d = run(1.86, 1.5, 100);
    expect(d.action).toBe("descaler");
    expect(d.nextBudget).toBe(50);
  });
  it("scénario 4 au plancher de 50 € → optimisation, pas de coupe", () => expect(run(1.4, 1.2, 50).action).toBe("plancher"));
  it("repli sur Meta quand le P&L est absent", () => {
    const d = decideCampaign({
      campaign: old,
      thresholds: t,
      pnl: null,
      meta3d: totals(100, 250),
      metaYesterday: totals(50, 100),
      today: TODAY,
    });
    expect(d.roasSource).toBe("meta");
    expect(d.action).toBe("augmenter");
  });
});

describe("verdict par ad (règles CBO)", () => {
  const t: Thresholds = { be: 1.83, targetLow: 2.52, target: 2.88, loss20: 1.46, jump: 3.7, atcTarget: 11.09, aov: 55.45 };
  const camp = totals(350, 380);

  it("nouvelle créa < 3 jours → attendre", () => {
    expect(judgeAd({ window: totals(20, 0), lifetimeSpend: 20, ageDays: 1, campaignWindow: camp, thresholds: t }).code).toBe("wait");
  });
  it("attaquant au-dessus du target → itérer", () => {
    const v = judgeAd({ window: totals(12, 60, { purchases: 1 }), lifetimeSpend: 40, ageDays: 20, campaignWindow: camp, thresholds: t });
    expect(v.code).toBe("iterate");
    expect(v.role).toBe("attaquant");
  });
  it("milieu de terrain d'une campagne rentable → garder même à ROAS moyen", () => {
    const healthy = totals(350, 1000);
    const v = judgeAd({ window: totals(180, 340, { purchases: 6 }), lifetimeSpend: 400, ageDays: 20, campaignWindow: healthy, thresholds: t });
    expect(v.code).toBe("keep");
    expect(v.role).toBe("milieu");
  });
  it("ROAS < 1 avec assez de dépense → couper", () => {
    const v = judgeAd({
      window: totals(60, 40, { purchases: 1, addToCart: 2, costPerAtc: 30 }),
      lifetimeSpend: 80,
      ageDays: 10,
      campaignWindow: camp,
      thresholds: t,
    });
    expect(v.code).toBe("cut");
  });
  it("0 vente mais coût/ATC bon → surveiller", () => {
    const v = judgeAd({
      window: totals(60, 0, { addToCart: 8, costPerAtc: 7.5 }),
      lifetimeSpend: 60,
      ageDays: 10,
      campaignWindow: camp,
      thresholds: t,
    });
    expect(v.code).toBe("watch");
  });
  it("ad sans diffusion → surveiller (2e CBO)", () => {
    expect(judgeAd({ window: totals(0.5, 0), lifetimeSpend: 1, ageDays: 12, campaignWindow: camp, thresholds: t }).role).toBe("muet");
  });
});

describe("lecture concurrent", () => {
  const ad: CompetitorAd = {
    id: "facebook_1",
    competitorId: "x",
    status: "active",
    firstSeenAt: "2026-10-16T07:00:00Z",
    lastSeenAt: "2026-10-29T06:00:00Z",
    daysRunning: 14,
    mediaType: "image",
    mediaUrl: null,
    thumbnailUrl: null,
    body: "Tes baskets ressortent comme neuves en machine, sans frotter.",
    transcript: null,
    landingUrl: null,
    cta: null,
    reach: 29677,
    reachDelta7d: 29212,
    estimatedSpend: 267,
    currentRank: 38,
    previousRank: 84,
    rankDelta: 46,
  };
  it("rang +46 → montante et récupérable si aucun script proche", () => {
    const r = readCompetitorAd(ad, [], TODAY);
    expect(r.signals).toContain("montante");
    expect(r.recoverable).toBe(true);
  });
  it("script identique déjà dans l'adset → pas récupérable", () => {
    const r = readCompetitorAd(ad, [{ adId: "a", name: "PUB19", text: ad.body! }], TODAY);
    expect(r.recoverable).toBe(false);
  });
  it("verdict IA « doublon » prioritaire sur la similarité locale (langues différentes)", () => {
    const r = readCompetitorAd(ad, [], TODAY, { verdict: "doublon", matchedAdName: "PUB19", reason: "même script en italien" });
    expect(r.recoverable).toBe(false);
  });
  it("ad passée inactive depuis le dernier relevé → coupée", () => {
    const r = readCompetitorAd({ ...ad, status: "inactive", previousStatus: "active" }, [], TODAY);
    expect(r.signals).toContain("coupee");
  });
});
