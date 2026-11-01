import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("chiffrement des clés", () => {
  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test_value";
    delete process.env.ENCRYPTION_KEY;
  });

  it("chiffre puis déchiffre avec la clé dérivée", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const enc = encrypt("EAAB-token-meta");
    expect(enc.startsWith("v1:s:")).toBe(true);
    expect(enc).not.toContain("EAAB");
    expect(decrypt(enc)).toBe("EAAB-token-meta");
  });

  it("reste lisible après l'ajout d'ENCRYPTION_KEY", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const old = encrypt("tt_key");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(decrypt(old)).toBe("tt_key");
    const fresh = encrypt("sk-ant");
    expect(fresh.startsWith("v1:k:")).toBe(true);
    expect(decrypt(fresh)).toBe("sk-ant");
  });

  it("renvoie null sur une valeur altérée", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const enc = encrypt("secret");
    const parts = enc.split(":");
    parts[4] = Buffer.from("autre chose").toString("base64");
    expect(decrypt(parts.join(":"))).toBeNull();
    expect(decrypt(null)).toBeNull();
  });
});
