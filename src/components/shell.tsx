"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Clapperboard, Gauge, Radar, Settings2, ShieldCheck, Sparkles, LogOut } from "lucide-react";
import type { Ctx } from "@/lib/workspace";
import { Mark } from "./ui";
import { WorkspaceSwitcher } from "./workspace-switcher";

type Tab = "cockpit" | "radar" | "studio" | "brief" | "reglages" | "admin";

const ICONS = { cockpit: Gauge, radar: Radar, studio: Clapperboard, brief: Sparkles, reglages: Settings2, admin: ShieldCheck } as const;

/**
 * Coque. Sur grand écran, une barre latérale d'instruments : l'espace, ses boutiques, les
 * écrans, le compte. Sur téléphone et tablette, une barre compacte en haut.
 * Rendue une seule fois dans la mise en page : elle reste en place pendant la navigation,
 * l'écran et la boutique actifs se déduisent de l'adresse.
 */
export function Shell({
  ctx,
  shops,
  children,
}: {
  ctx: Pick<Ctx, "viewer" | "workspaces"> & { workspace: Ctx["workspace"] | null };
  shops: { slug: string; name: string }[];
  children: ReactNode;
}) {
  const { viewer, workspace, workspaces } = ctx;
  const parts = usePathname().split("/").filter(Boolean);
  const current = shops.some((s) => s.slug === parts[0]) ? parts[0] : null;
  const tab: Tab =
    parts[0] === "reglages" ? "reglages" : parts[0] === "admin" ? "admin" : parts[1] === "radar" ? "radar" : parts[1] === "studio" ? "studio" : parts[1] === "brief" ? "brief" : "cockpit";
  const shopHref = (slug: string) => (tab === "radar" || tab === "studio" || tab === "brief" ? `/${slug}/${tab}` : `/${slug}`);
  const base = current ?? shops[0]?.slug ?? null;
  const tabs: { id: Tab; label: string; href: string }[] = [
    ...(base
      ? [
          { id: "cockpit" as const, label: "Cockpit", href: `/${base}` },
          { id: "radar" as const, label: "Radar concurrents", href: `/${base}/radar` },
          { id: "studio" as const, label: "Studio Ads", href: `/${base}/studio` },
          { id: "brief" as const, label: "Brief IA", href: `/${base}/brief` },
        ]
      : []),
    ...(workspace ? [{ id: "reglages" as const, label: "Réglages", href: "/reglages" }] : []),
    ...(viewer.isAdmin && !viewer.demo ? [{ id: "admin" as const, label: "Admin", href: "/admin" }] : []),
  ];

  return (
    <div className="min-h-dvh">
      {/* Barre latérale (grand écran) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-rule-1 bg-ink-0 xl:flex">
        <Link href="/" className="flex h-16 shrink-0 items-center gap-2.5 px-5" aria-label="Verdict, accueil">
          <Mark size={24} />
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Verdict</span>
        </Link>

        {workspace ? (
          <div className="px-3">
            <WorkspaceSwitcher current={workspace} workspaces={workspaces} className="w-full justify-between" />
          </div>
        ) : null}

        <nav aria-label="Boutique" className="mt-6 px-3">
          <p className="eyebrow px-2 pb-2">Boutiques</p>
          <ul className="space-y-0.5">
            {shops.map((s) => (
              <li key={s.slug}>
                <Link
                  href={shopHref(s.slug)}
                  prefetch
                  aria-current={s.slug === current ? "page" : undefined}
                  className={clsx(
                    "press flex h-9 items-center gap-2.5 rounded-[8px] px-2 text-[13px]",
                    s.slug === current ? "bg-ink-3 text-chalk-1" : "text-chalk-2 hover:bg-ink-2 hover:text-chalk-1",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "grid size-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold",
                      s.slug === current ? "bg-signal text-signal-ink" : "bg-ink-3 text-chalk-2",
                    )}
                  >
                    {s.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{s.name}</span>
                </Link>
              </li>
            ))}
            {!shops.length ? <li className="px-2 text-[12px] text-chalk-4">Aucune boutique</li> : null}
          </ul>
        </nav>

        <nav aria-label="Sections" className="mt-6 px-3">
          <p className="eyebrow px-2 pb-2">Écrans</p>
          <ul className="space-y-0.5">
            {tabs.map((t) => {
              const Icon = ICONS[t.id];
              const on = t.id === tab;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    prefetch
                    aria-current={on ? "page" : undefined}
                    className={clsx(
                      "press relative flex h-9 items-center gap-2.5 rounded-[8px] px-2 text-[13px]",
                      on ? "bg-ink-2 text-chalk-1" : "text-chalk-3 hover:bg-ink-2 hover:text-chalk-1",
                    )}
                  >
                    {on ? <span aria-hidden className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-signal" /> : null}
                    <Icon className={clsx("size-4 shrink-0", on ? "text-signal" : "")} aria-hidden />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-rule-1 px-5 py-4">
          {viewer.demo ? (
            <span className="mb-3 inline-flex rounded-[5px] bg-watch/10 px-2 py-1 text-[11px] text-watch">Démo · données fictives</span>
          ) : null}
          <p className="truncate text-[12px] text-chalk-3">{viewer.email}</p>
          {!viewer.demo ? (
            <form action="/auth/signout" method="post" className="mt-2">
              <button className="inline-flex items-center gap-1.5 text-[12px] text-chalk-3 hover:text-chalk-1">
                <LogOut className="size-3.5" aria-hidden />
                Se déconnecter
              </button>
            </form>
          ) : null}
          <p className="mt-3 text-[11px] leading-4 text-chalk-4">Lecture seule sur Meta : Verdict ne touche jamais au budget.</p>
        </div>
      </aside>

      {/* Barre du haut (téléphone et tablette) */}
      <header className="sticky top-0 z-30 border-b border-rule-1 bg-ink-0/95 backdrop-blur xl:hidden">
        <div className="flex h-14 items-center gap-2.5 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Verdict, accueil">
            <Mark />
          </Link>
          {workspace ? <WorkspaceSwitcher current={workspace} workspaces={workspaces} /> : null}
          {shops.length ? (
            <nav aria-label="Boutique" className="scrollbar-thin flex min-w-0 items-center overflow-x-auto rounded-[var(--radius-m)] border border-rule-1 bg-ink-1 p-0.5">
              {shops.map((s) => (
                <Link
                  key={s.slug}
                  href={shopHref(s.slug)}
                  prefetch
                  aria-current={s.slug === current ? "page" : undefined}
                  className={clsx(
                    "press shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[13px]",
                    s.slug === current ? "bg-ink-3 text-chalk-1" : "text-chalk-3 hover:text-chalk-1",
                  )}
                >
                  {s.name}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {viewer.demo ? <span className="rounded-[5px] bg-watch/10 px-2 py-1 text-[11px] text-watch">Démo</span> : null}
            {!viewer.demo ? (
              <form action="/auth/signout" method="post">
                <button aria-label="Se déconnecter" className="grid size-9 place-items-center rounded-[8px] text-chalk-3 hover:bg-ink-2 hover:text-chalk-1">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </div>
        <nav aria-label="Sections" className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-rule-1 px-3 py-1.5">
          {tabs.map((t) => {
            const Icon = ICONS[t.id];
            return (
              <Link
                key={t.id}
                href={t.href}
                    prefetch
                aria-current={t.id === tab ? "page" : undefined}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-[7px] px-3 py-2 text-[13px]",
                  t.id === tab ? "bg-ink-2 text-chalk-1" : "text-chalk-3",
                )}
              >
                <Icon className={clsx("size-3.5", t.id === tab ? "text-signal" : "")} aria-hidden />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1520px] px-4 pb-24 pt-6 sm:px-6 xl:ml-[248px] xl:px-8 xl:pt-8">{children}</main>
    </div>
  );
}
