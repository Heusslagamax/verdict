import clsx from "clsx";
import type { ReactNode } from "react";
import type { VerdictCode } from "@/lib/types";

export const VERDICT_STYLE: Record<VerdictCode, { fg: string; bg: string; label: string }> = {
  keep: { fg: "var(--keep)", bg: "var(--keep-wash)", label: "Garder" },
  iterate: { fg: "var(--iterate)", bg: "var(--iterate-wash)", label: "Itérer" },
  cut: { fg: "var(--cut)", bg: "var(--cut-wash)", label: "Couper" },
  watch: { fg: "var(--watch)", bg: "var(--watch-wash)", label: "Surveiller" },
  wait: { fg: "var(--wait)", bg: "var(--wait-wash)", label: "Attendre" },
};

/** Tampon de verdict : teinte pâle, texte de la même teinte, jamais saturé. */
export function Stamp({ code, children, className }: { code: VerdictCode; children?: ReactNode; className?: string }) {
  const s = VERDICT_STYLE[code];
  return (
    <span
      className={clsx("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[5px] px-2 text-[12px] font-medium leading-none", className)}
      style={{ color: s.fg, background: s.bg }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.fg }} />
      {children ?? s.label}
    </span>
  );
}

export function Panel({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={clsx("rounded-[var(--radius-l)] border border-rule-1 bg-ink-1", className)}>{children}</As>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("text-[12px] text-chalk-3", className)}>{children}</span>;
}

/** Un chiffre clé : libellé gris au-dessus, valeur en mono. Pas de tuile, pas d'icône. */
export function Figure({
  label,
  value,
  sub,
  tone,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: VerdictCode | "signal";
  size?: "md" | "lg";
}) {
  const color = tone === "signal" ? "var(--signal)" : tone ? VERDICT_STYLE[tone].fg : "var(--chalk-1)";
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className={clsx("num mt-1 truncate", size === "lg" ? "text-[30px] leading-9" : "text-[20px] leading-7")} style={{ color }}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[12px] text-chalk-3">{sub}</div> : null}
    </div>
  );
}

export function Notice({ tone = "watch", children }: { tone?: VerdictCode; children: ReactNode }) {
  const s = VERDICT_STYLE[tone];
  return (
    <div className="flex items-start gap-2 rounded-[var(--radius-m)] px-3 py-2 text-[13px]" style={{ background: s.bg, color: s.fg }}>
      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: s.fg }} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Marque Verdict : un tampon dont la coche déborde du cadre. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1.5" y="3.5" width="17" height="17" rx="4" stroke="var(--chalk-2)" strokeWidth="1.5" />
      <path d="M6 11.5l4 4L22.5 2.5" stroke="var(--signal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
