"use client";

import type { AdView } from "@/lib/data/views";
import type { VerdictCode } from "@/lib/types";
import { eur } from "@/lib/format";
import { Stamp } from "@/components/ui";
import { useAdParam } from "./url-state";

const STEPS: { code: VerdictCode; verb: string; hint: string }[] = [
  { code: "cut", verb: "Couper", hint: "Elles brûlent du budget sans ventes suffisantes." },
  { code: "iterate", verb: "Itérer", hint: "Au-dessus du target : décline leur hook en nouvelles créas." },
  { code: "watch", verb: "Surveiller", hint: "Pas encore assez de données, ou intention correcte sans vente." },
  { code: "wait", verb: "Attendre", hint: "Moins de 3 jours : on ne juge pas encore." },
  { code: "keep", verb: "Garder", hint: "Rentables ou milieux de terrain d'une campagne qui tient." },
];

/** Les verdicts du jour transformés en liste d'actions, les plus urgentes d'abord. */
export function TodoList({ ads }: { ads: AdView[] }) {
  const [, open] = useAdParam();
  const groups = STEPS.map((s) => ({ ...s, ads: ads.filter((a) => a.verdict?.code === s.code) })).filter((g) => g.ads.length);
  if (!groups.length) return <p className="text-[13px] text-chalk-3">Aucun verdict : les seuils de la boutique manquent.</p>;
  return (
    <ol className="space-y-4">
      {groups.map((g) => (
        <li key={g.code}>
          <div className="flex items-center gap-2">
            <Stamp code={g.code}>
              {g.verb} · {g.ads.length}
            </Stamp>
            <span className="min-w-0 truncate text-[12px] text-chalk-3">{g.hint}</span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {g.ads.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => open(a.id)}
                  className="press inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-[7px] border border-rule-1 bg-ink-2 px-2 text-[12px] text-chalk-1 hover:border-rule-3"
                >
                  <span className="truncate">{a.name}</span>
                  <span className="num shrink-0 text-chalk-3">{eur(a.totals.spend, 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
