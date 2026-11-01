"use client";

import { useSearchParams } from "next/navigation";

/**
 * Paramètres d'adresse purement visuels (pub ouverte, période) : on les écrit avec l'API
 * History du navigateur. Next.js synchronise `useSearchParams` sans redemander la page au
 * serveur, donc le changement est instantané et l'adresse reste partageable.
 */
export function setUrlParam(key: string, value: string | null) {
  const next = new URLSearchParams(window.location.search);
  if (value) next.set(key, value);
  else next.delete(key);
  const qs = next.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

export function useAdParam(): [string | null, (id: string | null) => void] {
  const params = useSearchParams();
  return [params.get("ad"), (id) => setUrlParam("ad", id)];
}
