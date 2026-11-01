import clsx from "clsx";

/** Bloc fantôme : la forme de l'écran apparaît dès le clic, avant les données. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-[8px] bg-ink-2", className)} />;
}

export function PageHeaderSkeleton({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <Bone className="mt-2 h-8 w-56" />
        <Bone className="mt-2 h-3.5 w-80 max-w-full" />
      </div>
      <Bone className="hidden h-9 w-40 sm:block" />
    </div>
  );
}

export function PanelSkeleton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={clsx("rounded-[var(--radius-l)] border border-rule-1 bg-ink-1 p-5", className)}>{children}</div>;
}
