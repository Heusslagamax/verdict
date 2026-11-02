import { describe, expect, it } from "vitest";
import { rankCandidates, wordOverlap, type Fingerprint } from "./matching";

const card = (angle: string, shots: string[]) => ({ angle, message: angle, concept: "mashup", keyShots: shots, hook: { text: "", visual: shots[0] ?? "" } });
const own: Fingerprint = {
  id: "mine",
  frames: [
    { t: 0.5, hash: "f0f0f0f0f0f0f0f0" },
    { t: 2, hash: "0123456789abcdef" },
  ],
  script: null,
  card: card("douleur au genou dans les escaliers", ["genou douloureux escaliers", "sangle posée sur le genou"]),
};

describe("pré-filtre du rapprochement", () => {
  it("met en tête la créa qui partage des plans", () => {
    const ranked = rankCandidates(own, [
      { id: "same-shots", frames: [{ t: 9, hash: "f0f0f0f0f0f0f0f1" }], script: null, card: null },
      { id: "same-angle", frames: [{ t: 1, hash: "0000000000000000" }], script: null, card: card("douleur genou escaliers", ["escaliers genou douloureux"]) },
      { id: "unrelated", frames: [{ t: 1, hash: "ffffffffffffffff" }], script: null, card: card("dormir mieux la nuit", ["oreiller"]) },
    ]);
    expect(ranked[0].id).toBe("same-shots");
    expect(ranked.map((r) => r.id)).toContain("same-angle");
    expect(ranked.map((r) => r.id)).not.toContain("unrelated");
  });

  it("compare le vocabulaire des fiches sans les mots vides", () => {
    expect(wordOverlap("la douleur au genou", "douleur genou")).toBe(1);
    expect(wordOverlap("oreiller cervical", "sangle rotulienne")).toBe(0);
  });
});
