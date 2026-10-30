import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Mark } from "./ui";

type Tab = "cockpit" | "radar" | "brief" | "reglages";

/**
 * Coque : la marque et la boutique en cours à gauche (la portée de l'écran), la navigation
 * qui s'efface (un simple changement de ton sur l'onglet actif), le compte à droite.
 */
export function Shell({
  shops,
  current,
  tab,
  email,
  demo,
  children,
}: {
  shops: { slug: string; name: string }[];
  current: string | null;
  tab: Tab;
  email: string;
  demo: boolean;
  children: ReactNode;
}) {
  const shopHref = (slug: string) => (tab === "reglages" || tab === "cockpit" ? `/${slug}` : `/${slug}/${tab}`);
  const tabs: { id: Tab; label: string; href: string }[] = current
    ? [
        { id: "cockpit", label: "Cockpit", href: `/${current}` },
        { id: "radar", label: "Radar concurrents", href: `/${current}/radar` },
        { id: "brief", label: "Brief IA", href: `/${current}/brief` },
        { id: "reglages", label: "Réglages", href: `/reglages` },
      ]
    : [{ id: "reglages", label: "Réglages", href: "/reglages" }];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule-1 bg-ink-0">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2.5 px-4 sm:gap-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 pr-1" aria-label="Verdict, accueil">
            <Mark />
            <span className="hidden text-[15px] font-semibold tracking-[-0.01em] sm:inline">Verdict</span>
          </Link>

          <nav aria-label="Boutique" className="flex items-center rounded-[var(--radius-m)] border border-rule-1 bg-ink-1 p-0.5">
            {shops.map((s) => (
              <Link
                key={s.slug}
                href={shopHref(s.slug)}
                aria-current={s.slug === current ? "page" : undefined}
                className={clsx(
                  "press whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[13px] sm:px-3",
                  s.slug === current ? "bg-ink-3 text-chalk-1" : "text-chalk-3 hover:text-chalk-1",
                )}
              >
                {s.name}
              </Link>
            ))}
          </nav>

          <nav aria-label="Sections" className="ml-2 hidden items-center gap-1 md:flex">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={t.id === tab ? "page" : undefined}
                className={clsx(
                  "rounded-[7px] px-2.5 py-1.5 text-[13px]",
                  t.id === tab ? "text-chalk-1" : "text-chalk-3 hover:text-chalk-1",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {demo ? (
              <span className="whitespace-nowrap rounded-[5px] bg-watch/10 px-2 py-1 text-[12px] text-watch">
                Démo<span className="hidden sm:inline"> · données fictives</span>
              </span>
            ) : null}
            <span className="hidden text-[12px] text-chalk-3 lg:inline">{email}</span>
            {!demo ? (
              <form action="/auth/signout" method="post">
                <button className="text-[12px] text-chalk-3 hover:text-chalk-1">Se déconnecter</button>
              </form>
            ) : null}
          </div>
        </div>
        <nav aria-label="Sections" className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-rule-1 px-3 py-1.5 md:hidden">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={t.id === tab ? "page" : undefined}
              className={clsx(
                "shrink-0 rounded-[7px] px-3 py-2 text-[13px]",
                t.id === tab ? "bg-ink-2 text-chalk-1" : "text-chalk-3",
              )}
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
