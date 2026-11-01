"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTransition } from "react";
import clsx from "clsx";
import { switchWorkspace } from "@/app/actions";
import type { WorkspaceRef } from "@/lib/workspace";

/** Sélecteur d'espace : simple étiquette quand on n'appartient qu'à un seul espace. */
export function WorkspaceSwitcher({ current, workspaces, className }: { current: WorkspaceRef; workspaces: WorkspaceRef[]; className?: string }) {
  const [pending, start] = useTransition();
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-ink-3 text-[11px] font-semibold text-chalk-1">
        {current.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="hidden max-w-[140px] truncate text-[13px] text-chalk-1 sm:inline">{current.name}</span>
    </span>
  );

  if (workspaces.length < 2) return <div className={clsx("flex shrink-0 items-center px-1", className)}>{label}</div>;

  return (
    <Popover.Root>
      <Popover.Trigger
        className={clsx("press flex shrink-0 items-center gap-1.5 rounded-[var(--radius-m)] px-1.5 py-1.5 hover:bg-ink-2", className)}
        aria-label={`Espace : ${current.name}. Changer d'espace`}
        aria-busy={pending}
      >
        {label}
        <ChevronsUpDown className="size-3.5 text-chalk-3" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-[var(--radius-l)] border border-rule-2 bg-ink-2 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[12px] text-chalk-3">Tes espaces</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={pending}
              onClick={() => start(() => switchWorkspace(w.id))}
              className={clsx(
                "flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left text-[13px] hover:bg-ink-3",
                w.id === current.id ? "text-chalk-1" : "text-chalk-2",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate">{w.name}</span>
                <span className="block text-[11px] text-chalk-3">{w.role === "owner" ? "Propriétaire" : "Membre"}</span>
              </span>
              {w.id === current.id ? <Check className="size-4 shrink-0 text-signal" aria-hidden /> : null}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
