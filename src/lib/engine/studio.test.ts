import { describe, expect, it } from "vitest";
import { diagnoseCompetitor, diagnoseOwn, planSize, MAX_BRIEFS, type OwnSource } from "./studio";
import type { Thresholds, Totals } from "@/lib/types";

const t: Thresholds = { be: 1.83, targetLow: 2.52, target: 2.88, loss20: 1.34, jump: 4.05, atcTarget: 11.09, aov: 55.45 };

const totals = (p: Partial<Totals>): Totals => ({
  spend: 0,
  impressions: 0,
  linkClicks: 0,
  addToCart: 0,
  checkouts: 0,
  purchases: 0,
  value: 0,
  roas: null,
  cpc: null,
  ctr: null,
  costPerAtc: null,
  cpa: null,
  aov: null,
  ...p,
});

const own = (p: Partial<OwnSource>): OwnSource => ({
  name: "V01",
  verdict: { code: "iterate", role: "attaquant" },
  share: 0.2,
  totals: totals({ spend: 200, roas: 3.2, linkClicks: 250, addToCart: 30, cpc: 0.8 }),
  lifetimeSpend: 600,
  roasByDay: Array(14).fill(3.2),
  spendByDay: Array(14).fill(30),
  isVideo: true,
  ...p,
});

describe("Studio : diagnostic de mes pubs", () => {
  it("refuse d'itérer sur un loser (Zecom 3.2)", () => {
    const d = diagnoseOwn(own({ totals: totals({ spend: 8, roas: 4 }), lifetimeSpend: 20 }), t, { dailyRevenue: 300 });
    expect(d.eligible).toBe(false);
    expect(d.triggered[0].ruleId).toBe("Z-3.2-LOSER");
  });

  it("gagnant : les hooks d'abord, plafonné à 5 briefs", () => {
    const d = diagnoseOwn(own({}), t, { dailyRevenue: 300 });
    expect(d.eligible).toBe(true);
    expect(d.plan[0]).toMatchObject({ element: "hook", count: 3, ruleId: "Z-5.1-HOOKS" });
    expect(planSize(d)).toBeLessThanOrEqual(MAX_BRIEFS);
    expect(d.guardrails).toContain("Z-11-AWARENESS");
  });

  it("gagnant qui s'essouffle : un nouveau message entre dans le plan (Zecom 10 et 12.1)", () => {
    const roasByDay = [...Array(11).fill(3.6), 1.9, 1.8, 2.0];
    const d = diagnoseOwn(own({ roasByDay, totals: totals({ spend: 200, roas: 3.0, linkClicks: 250, addToCart: 30, cpc: 0.8 }) }), t, { dailyRevenue: 300 });
    expect(d.triggered.map((x) => x.ruleId)).toContain("Z-12.1-FATIGUE");
    expect(d.plan.some((p) => p.element === "message")).toBe(true);
  });

  it("milieu de terrain rentable sous le target : fraîcheur, pas de coupe", () => {
    const d = diagnoseOwn(
      own({ verdict: { code: "keep", role: "milieu" }, share: 0.45, totals: totals({ spend: 300, roas: 2.1, linkClicks: 400, addToCart: 40, cpc: 0.75 }) }),
      t,
      { dailyRevenue: 300 },
    );
    expect(d.eligible).toBe(true);
    expect(d.headline).toMatch(/Milieu de terrain/);
    expect(d.plan.map((p) => p.element)).toEqual(expect.arrayContaining(["hook", "message"]));
  });

  it("CPC bas et peu d'ajouts au panier : statique offre (Zecom 12.1-7)", () => {
    const d = diagnoseOwn(own({ totals: totals({ spend: 200, roas: 3.0, linkClicks: 500, addToCart: 20, cpc: 0.4 }) }), t, { dailyRevenue: 300 });
    expect(d.triggered.map((x) => x.ruleId)).toContain("Z-12.1-SITE");
  });

  it("perdante qui n'est pas un milieu de terrain : pas une base", () => {
    const d = diagnoseOwn(own({ verdict: { code: "cut", role: "remplaçant" }, share: 0.1, totals: totals({ spend: 120, roas: 0.9 }) }), t, { dailyRevenue: 300 });
    expect(d.eligible).toBe(false);
  });
});

describe("Studio : créas concurrentes", () => {
  it("vidéo : 1:1 d'abord puis deux hooks tirés des plans", () => {
    const d = diagnoseCompetitor({ mediaType: "video", hasScript: true }, { dailyRevenue: 300 });
    expect(d.plan[0]).toMatchObject({ element: "traduction_1_1", ruleId: "Z-4.0-1TO1" });
    expect(d.plan[1]).toMatchObject({ element: "hook", count: 2 });
    expect(d.guardrails).toContain("C-3-LOCAL");
  });

  it("statique : 1:1 puis variantes d'offre", () => {
    const d = diagnoseCompetitor({ mediaType: "image", hasScript: false }, { dailyRevenue: 300 });
    expect(d.plan[1]).toMatchObject({ element: "offre", ruleId: "Z-5.3-OFFRE" });
  });
});
