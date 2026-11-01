import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Chiffrement des clés de service par espace (AES-256-GCM).
 * Clé : ENCRYPTION_KEY (32 octets en base64) si elle est définie, sinon une clé dérivée
 * (HKDF) de SUPABASE_SECRET_KEY. Le préfixe de chaque valeur indique la clé utilisée, pour
 * qu'ajouter ENCRYPTION_KEY plus tard ne rende pas illisibles les valeurs déjà stockées.
 */

type KeyId = "k" | "s";

function key(id: KeyId): Buffer {
  if (id === "k") {
    const raw = process.env.ENCRYPTION_KEY ?? "";
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("ENCRYPTION_KEY doit faire 32 octets en base64");
    return buf;
  }
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!secret) throw new Error("SUPABASE_SECRET_KEY manquante");
  return Buffer.from(hkdfSync("sha256", secret, "verdict", "workspace-secrets-v1", 32));
}

const activeKeyId = (): KeyId => (process.env.ENCRYPTION_KEY ? "k" : "s");

export function encrypt(plain: string): string {
  const id = activeKeyId();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(id), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", id, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/** Renvoie null si la valeur est absente ou illisible (clé changée, valeur altérée). */
export function decrypt(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [v, id, iv, tag, ct] = stored.split(":");
    if (v !== "v1" || (id !== "k" && id !== "s")) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(id), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Les 4 derniers caractères, pour montrer quelle clé est enregistrée sans la révéler. */
export const last4 = (v: string | null) => (v ? v.slice(-4) : null);
