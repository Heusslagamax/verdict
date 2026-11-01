import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import type { Ctx } from "@/lib/workspace";
import { Mark } from "./ui";
import { WorkspaceSwitcher } from "./workspace-switcher";

type Tab = "cockpit" | "radar" | "brief" | "reglages" | "admin";

/**
 * Coque : la marque, l'espace en cours et ses boutiques à gauche (la portée de l'écran),
 * la navigation qui s'efface, le compte à droite.
 */
export function Shell({
  ctx,
  shops,
  current,
  tab,
  children,
}: {
  ctx: Pick<Ctx, "viewer" | "workspaces"> & { workspace: Ctx["workspace"] | null };
  shops: { slug: string; name: string }[];
  current: string | null;
  tab: Tab;
  children: ReactNode;
}) {
  const { viewer, workspace, workspaces } = ctx;
  const shopHref = (slug: string) => (tab === "radar" || tab === "brief" ? `/${slug}/${tab}` : `/${slug}`);
  const base = current ?? shops[0]?.slug ?? null;
  const tabs: { id: Tab; label: string; href: string }[] = [
    ...(base
      ? [
          { id: "cockpit" as const, label: "Cockpit", href: `/${base}` },
          { id: "radar" as const, label: "Radar concurrents", href: `/${base}/radar` },
          { id: "brief" as const, label: "Brief IA", href: `/${base}/brief` },
        ]
      : []),
    ...(workspace ? [{ id: "reglages" as const, label: "Réglages", href: "/reglages" }] : []),
    ...(viewer.isAdmin && !viewer.demo ? [{ id: "admin" as const, label: "Admin", href: "/admin" }] : []),
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule-1 bg-ink-0">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 pr-1" aria-label="Verdict, accueil">
            <Mark />
            <span className="hidden text-[15px] font-semibold tracking-[-0.01em] lg:inline">Verdict</span>
          </Link>

          {workspace ? <WorkspaceSwitcher current={workspace} workspaces={workspaces} /> : null}

          {shops.length ? (
            <nav
              aria-label="Boutique"
              className="scrollbar-thin flex min-w-0 items-center overflow-x-auto rounded-[var(--radius-m)] border border-rule-1 bg-ink-1 p-0.5"
            >
              {shops.map((s) => (
                <Link
                  key={s.slug}
                  href={shopHref(s.slug)}
                  aria-current={s.slug === current ? "page" : undefined}
                  className={clsx(
                    "press shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[13px] sm:px-3",
                    s.slug === current ? "bg-ink-3 text-chalk-1" : "text-chalk-3 hover:text-chalk-1",
                  )}
                >
                  {s.name}
                </Link>
              ))}
            </nav>
          ) : null}

          <nav aria-label="Sections" className="ml-1 hidden items-center gap-1 lg:flex">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={t.id === tab ? "page" : undefined}
                className={clsx("whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[13px]", t.id === tab ? "text-chalk-1" : "text-chalk-3 hover:text-chalk-1")}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {viewer.demo ? (
              <span className="whitespace-nowrap rounded-[5px] bg-watch/10 px-2 py-1 text-[12px] text-watch">
                Démo<span className="hidden sm:inline"> · données fictives</span>
              </span>
            ) : null}
            <span className="hidden text-[12px] text-chalk-3 xl:inline">{viewer.email}</span>
            {!viewer.demo ? (
              <form action="/auth/signout" method="post">
                <button className="whitespace-nowrap text-[12px] text-chalk-3 hover:text-chalk-1">Se déconnecter</button>
              </form>
            ) : null}
          </div>
        </div>
        <nav aria-label="Sections" className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-rule-1 px-3 py-1.5 lg:hidden">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={t.id === tab ? "page" : undefined}
              className={clsx("shrink-0 rounded-[7px] px-3 py-2 text-[13px]", t.id === tab ? "bg-ink-2 text-chalk-1" : "text-chalk-3")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
