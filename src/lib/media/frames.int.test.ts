import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { videoFrames } from "./frames";
import { compareFrames } from "./hash";

// Test d'intégration ffmpeg : lancé seulement avec MEDIA_SAMPLES=<dossier contenant a.mp4, b.mp4, c.mp4>.
const dir = process.env.MEDIA_SAMPLES;

describe.skipIf(!dir)("extraction d'images (ffmpeg)", () => {
  it("reconnaît une copie recompressée et écarte une autre vidéo", async () => {
    const [a, b, c] = await Promise.all(["a", "b", "c"].map((n) => videoFrames(`${dir}/${n}.mp4`, { local: true })));
    expect(a.length).toBeGreaterThanOrEqual(5);
    const copy = compareFrames(a, b);
    const other = compareFrames(a, c);
    console.log("copie", copy.share, copy.best, "autre", other.share, other.best);
    expect(copy.share).toBeGreaterThanOrEqual(0.8);
    expect(other.share).toBeLessThanOrEqual(0.2);
  }, 120_000);
});
