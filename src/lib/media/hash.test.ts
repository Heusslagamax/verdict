import { describe, expect, it } from "vitest";
import { compareFrames, dhashFromGray, hamming, SAME_SHOT } from "./hash";

const gradient = (dir: 1 | -1, noise = 0) => {
  const g = new Uint8Array(72);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) g[y * 9 + x] = Math.max(0, Math.min(255, 128 + dir * (x * 12 + y * 3) + ((x * 7 + y * 13) % 5) * noise));
  return g;
};

describe("empreintes perceptuelles", () => {
  it("donne 16 caractères hexadécimaux", () => {
    expect(dhashFromGray(gradient(1))).toMatch(/^[0-9a-f]{16}$/);
  });

  it("deux images opposées sont très éloignées, une image légèrement bruitée reste proche", () => {
    const a = dhashFromGray(gradient(1));
    expect(hamming(a, dhashFromGray(gradient(-1)))).toBeGreaterThan(40);
    expect(hamming(a, dhashFromGray(gradient(1, 2)))).toBeLessThanOrEqual(SAME_SHOT);
  });

  it("retrouve un plan copié même placé ailleurs dans la vidéo", () => {
    const shot = dhashFromGray(gradient(1));
    const other = dhashFromGray(gradient(-1));
    const m = compareFrames(
      [
        { t: 0.5, hash: shot },
        { t: 2, hash: other },
      ],
      [
        { t: 9, hash: other },
        { t: 14, hash: shot },
      ],
    );
    expect(m.share).toBe(1);
    expect(m.pairs.find((p) => p.a === 0.5)?.b).toBe(14);
  });
});
