import { describe, expect, it } from "vitest";
import { suggestSources, type SourceLink } from "./sources";

const script = "Ne mets jamais tes baskets en machine sans ce sac, regarde le résultat après un seul lavage";
const own = [
  { id: "a1", name: "V01 · sac machine", script, body: null },
  { id: "a2", name: "V02 · autre", script: "Un tout autre texte sur les semelles orthopédiques confortables", body: null },
];
const comp = [
  { id: "c1", competitorId: "k1", transcript: script, body: null },
  { id: "c2", competitorId: "k1", transcript: "Promo 1 acheté 1 offert livraison gratuite", body: null },
];

describe("suggestions de source", () => {
  it("relie un script identique à sa pub concurrente", () => {
    const s = suggestSources(own, comp, [], new Map());
    expect(s.get("a1")?.[0]).toMatchObject({ competitorAdId: "c1", method: "script" });
    expect(s.get("a2")).toEqual([]);
  });

  it("ne repropose pas une suggestion rejetée, ni une pub déjà confirmée", () => {
    const links: SourceLink[] = [
      { adId: "a1", competitorId: "k1", competitorAdId: "c1", status: "rejected", method: "manuel", score: null },
    ];
    expect(suggestSources(own, comp, links, new Map()).get("a1")).toEqual([]);
    const confirmed: SourceLink[] = [{ adId: "a1", competitorId: "k1", competitorAdId: "c2", status: "confirmed", method: "manuel", score: null }];
    expect(suggestSources(own, comp, confirmed, new Map()).has("a1")).toBe(false);
  });

  it("utilise le verdict IA d'une langue à l'autre", () => {
    const ai = new Map([["k1:c2", { verdict: "doublon" as const, matchedAdName: "V02 · autre", reason: "Traduction fidèle." }]]);
    const s = suggestSources(own, comp, [], ai);
    expect(s.get("a2")?.[0]).toMatchObject({ competitorAdId: "c2", method: "ia" });
  });
});
