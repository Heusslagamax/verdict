"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { relativeTime } from "@/lib/format";
import { syncMetaIfStale } from "@/app/actions";

/**
 * Pastille d'état Meta. Si la photo affichée est périmée, lance la resynchronisation en
 * arrière-plan puis rafraîchit la page : l'écran s'affiche tout de suite, les chiffres frais
 * arrivent quelques secondes plus tard, sans rien bloquer.
 */
export function MetaAutoSync({ slug, stale, fetchedAt, demo, failed }: { slug: string; stale: boolean; fetchedAt: string | null; demo: boolean; failed: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"idle" | "syncing" | "error">("idle");

  useEffect(() => {
    if (!stale || started.current) return;
    started.current = true;
    setState("syncing");
    syncMetaIfStale(slug)
      .then((r) => {
        if (r.updated) router.refresh();
        setState(r.error ? "error" : "idle");
      })
      .catch(() => setState("error"));
  }, [stale, slug, router]);

  const label = demo ? "données de démo" : state === "syncing" ? "Meta : mise à jour…" : `Meta ${relativeTime(fetchedAt)}`;
  const dot = state === "syncing" ? "bg-signal animate-pulse" : failed || state === "error" ? "bg-cut" : "bg-keep";
  return (
    <span className="inline-flex items-center gap-1.5" aria-live="polite">
      <span className={clsx("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
