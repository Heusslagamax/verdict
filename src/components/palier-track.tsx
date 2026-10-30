import clsx from "clsx";
import { PALIERS } from "@/lib/engine/verdict";

/** Piste des paliers Zecom : où est le budget aujourd'hui, où le moteur conseille d'aller. */
export function PalierTrack({ current, next }: { current: number | null; next: number | null }) {
  const curIdx = current == null ? -1 : nearest(current);
  const nextIdx = next == null ? -1 : nearest(next);
  return (
    <div aria-label="Paliers de budget" className="flex items-end gap-1">
      {PALIERS.map((p, i) => {
        const isCur = i === curIdx;
        const isNext = i === nextIdx && nextIdx !== curIdx;
        return (
          <div key={p} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className={clsx("num text-[11px]", isCur ? "text-chalk-1" : isNext ? "text-signal" : "text-chalk-4")}>{p}</span>
            <span
              className={clsx(
                "h-1.5 w-full rounded-full",
                isCur ? "bg-chalk-1" : isNext ? "bg-signal" : i < curIdx ? "bg-chalk-4" : "bg-ink-3",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function nearest(v: number) {
  let best = 0;
  PALIERS.forEach((p, i) => {
    if (Math.abs(p - v) < Math.abs(PALIERS[best] - v)) best = i;
  });
  return best;
}
