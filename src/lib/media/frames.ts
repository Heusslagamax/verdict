import "server-only";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { dhashFromGray } from "./hash";

/**
 * Images clés d'une créa, pour comparer deux pubs « image par image ».
 * Vidéo : 3 images dans le hook (0,5 s, 2 s, 4 s) puis 3 dans le corps (30 %, 55 %, 80 %).
 * Statique : l'image elle-même. Chaque image a une empreinte perceptuelle (dHash 64 bits) :
 * deux plans identiques, même recadrés ou recompressés, ont des empreintes très proches.
 */

export interface Frame {
  /** Seconde de la vidéo (0 pour un statique). */
  t: number;
  /** JPEG 480 px de large, pour l'IA. */
  jpeg: Buffer;
  /** Empreinte perceptuelle, 16 caractères hexadécimaux. */
  hash: string;
}

/** Domaines autorisés : uniquement les CDN de Meta et de TrendTrack (pas d'URL arbitraire côté serveur). */
const ALLOWED = [/\.fbcdn\.net$/, /\.facebook\.com$/, /\.cdninstagram\.com$/, /(^|\.)trendtrack\.io$/];

export function assertAllowedUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED.some((re) => re.test(u.hostname))) {
    throw new Error(`Média refusé (domaine non autorisé) : ${u.hostname}`);
  }
}

function run(args: string[], timeoutMs: number): Promise<{ stdout: Buffer; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg indisponible sur ce serveur"));
    const p = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => {
      if (err.length < 20_000) err += d.toString();
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(out), stderr: err, code });
    });
  });
}

export async function videoDuration(src: string): Promise<number | null> {
  const { stderr } = await run(["-hide_banner", "-i", src], 20_000);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function keyTimes(duration: number | null): number[] {
  const d = duration && duration > 0 ? duration : 30;
  const hook = [0.5, 2, 4];
  const body = [0.3, 0.55, 0.8].map((r) => Math.round(d * r * 10) / 10);
  return [...new Set([...hook, ...body])].filter((t) => t < d - 0.2).sort((a, b) => a - b);
}

async function grab(src: string, t: number): Promise<Buffer | null> {
  const { stdout } = await run(
    ["-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "5", "pipe:1"],
    25_000,
  );
  return stdout.length > 500 ? stdout : null;
}

export async function hashImage(buf: Buffer): Promise<string> {
  const gray = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  return dhashFromGray(gray);
}

/** Images clés d'une vidéo (URL autorisée, ou fichier local pour les tests). */
export async function videoFrames(src: string, opts: { local?: boolean } = {}): Promise<Frame[]> {
  if (!opts.local) assertAllowedUrl(src);
  const times = keyTimes(await videoDuration(src));
  const frames: Frame[] = [];
  // Deux extractions à la fois : assez rapide, sans saturer la fonction.
  for (let i = 0; i < times.length; i += 2) {
    const batch = await Promise.all(times.slice(i, i + 2).map(async (t) => ({ t, jpeg: await grab(src, t) })));
    for (const f of batch) if (f.jpeg) frames.push({ t: f.t, jpeg: f.jpeg, hash: await hashImage(f.jpeg) });
  }
  if (!frames.length) throw new Error("Aucune image extraite de la vidéo");
  return frames;
}

/** Une image statique, redimensionnée comme les images de vidéo. */
export async function imageFrame(url: string): Promise<Frame[]> {
  assertAllowedUrl(url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Image inaccessible (${res.status})`);
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 480 }).jpeg({ quality: 75 }).toBuffer();
  return [{ t: 0, jpeg, hash: await hashImage(jpeg) }];
}
