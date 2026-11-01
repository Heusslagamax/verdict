"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import type { Window } from "@/lib/types";
import { WINDOW_LABEL } from "@/lib/format";
import { setUrlParam } from "./url-state";

const WINDOWS: Window[] = ["1d", "3d", "7d"];

/**
 * Sélecteur de période instantané : les trois périodes sont déjà calculées et rendues par le
 * serveur, le clic ne fait que changer celle qu'on affiche (aucun aller-retour réseau).
 */
export function PeriodView({
  initial,
  panels,
  summary,
}: {
  initial: Window;
  panels: Record<Window, ReactNode>;
  summary: Record<Window, { cut: number; iterate: number }>;
}) {
  const [w, setW] = useState<Window>(initial);
  const s = summary[w];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Période" className="flex rounded-[var(--radius-m)] border border-rule-1 bg-ink-1 p-0.5">
          {WINDOWS.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={x === w}
              onClick={() => {
                setW(x);
                setUrlParam("w", x);
              }}
              className={clsx("press rounded-[7px] px-3.5 py-1.5 text-[13px]", x === w ? "bg-ink-4 text-chalk-1" : "text-chalk-3 hover:text-chalk-1")}
            >
              {WINDOW_LABEL[x]}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-3 text-[12px] text-chalk-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-cut" />
            {s.cut} pub{s.cut > 1 ? "s" : ""} à couper
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-iterate" />
            {s.iterate} à itérer
          </span>
        </p>
      </div>
      <div className="mt-6">{panels[w]}</div>
    </div>
  );
}
