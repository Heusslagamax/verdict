"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Largeur réelle d'un conteneur (les graphiques se dessinent au pixel près, sans déformer le texte). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export const dayLabel = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`)).replace(".", "");
export const longDay = (iso: string) => longFmt.format(new Date(`${iso}T00:00:00Z`));

/** Graduations « rondes » pour un axe allant de 0 à max. */
export function ticks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Chemin d'une courbe qui s'interrompt sur les jours sans donnée. */
export function linePath(points: ({ x: number; y: number } | null)[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
}
