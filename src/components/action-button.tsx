"use client";

import { useState, useTransition, type ReactNode } from "react";
import clsx from "clsx";
import type { ActionResult } from "@/app/actions";

/** Bouton qui lance une action serveur et affiche son résultat en une ligne. */
export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = "secondary",
  className,
  icon,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  icon?: ReactNode;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className={clsx("inline-flex items-center gap-3", className)}>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            try {
              setResult(await action());
            } catch (e) {
              setResult({ ok: false, message: e instanceof Error ? e.message : "Erreur" });
            }
          })
        }
        className={clsx(
          "press inline-flex h-9 items-center gap-2 rounded-[var(--radius-m)] px-3.5 text-[13px] font-medium disabled:cursor-wait disabled:opacity-60",
          variant === "primary" && "bg-chalk-1 text-ink-0 hover:bg-white",
          variant === "secondary" && "border border-rule-2 bg-ink-2 text-chalk-1 hover:border-rule-3 hover:bg-ink-3",
          variant === "ghost" && "text-chalk-2 hover:bg-ink-2 hover:text-chalk-1",
        )}
      >
        {icon}
        {pending ? (pendingLabel ?? "En cours…") : children}
      </button>
      {result ? (
        <span role="status" className={clsx("text-[12px]", result.ok ? "text-keep" : "text-cut")}>
          {result.message}
        </span>
      ) : null}
    </span>
  );
}
