"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanSearch, Square } from "lucide-react";
import { fingerprintAction, finishRapprochementAction, matchAction, rapprochementPlanAction } from "@/app/actions";

type Job = { label: string; run: () => Promise<{ ok: boolean; message: string }> };

/**
 * Lance le rapprochement créa par créa, depuis le navigateur : chaque appel serveur traite une
 * seule créa (extraction des images + fiche IA, ou jugement d'une de mes pubs). On voit la
 * progression, on peut arrêter, et une erreur sur une créa n'arrête pas les autres.
 */
export function RapprochementRunner({ slug, disabled }: { slug: string; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [force, setForce] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const stop = useRef(false);

  const start = async () => {
    stop.current = false;
    setErrors([]);
    setMsg(null);
    setState("running");
    setProgress({ done: 0, total: 0, label: "Préparation…" });
    const p = await rapprochementPlanAction(slug, force);
    if (!p.ok) {
      setMsg(p.message);
      setState("idle");
      return;
    }
    const { plan } = p;
    const phases: { jobs: Job[]; parallel: number }[] = [
      {
        parallel: 2,
        jobs: plan.analyzeCompetitor.map((id, i) => ({
          label: `Analyse des créas concurrentes (${i + 1}/${plan.analyzeCompetitor.length})`,
          run: () => fingerprintAction(slug, "competitor", id),
        })),
      },
      {
        parallel: 2,
        jobs: plan.analyzeOwn.map((id, i) => ({ label: `Analyse de tes pubs (${i + 1}/${plan.analyzeOwn.length})`, run: () => fingerprintAction(slug, "own", id) })),
      },
      {
        parallel: 2,
        jobs: plan.match.map((id, i) => ({ label: `Rapprochement de tes pubs (${i + 1}/${plan.match.length})`, run: () => matchAction(slug, id) })),
      },
    ];
    const total = phases.reduce((a, ph) => a + ph.jobs.length, 0);
    let done = 0;
    setProgress({ done, total, label: "" });
    for (const ph of phases) {
      let next = 0;
      const worker = async () => {
        while (!stop.current && next < ph.jobs.length) {
          const job = ph.jobs[next++];
          setProgress((x) => ({ ...x, label: job.label }));
          try {
            const r = await job.run();
            if (!r.ok && r.message) setErrors((e) => [...e, `${job.label} : ${r.message}`]);
          } catch (e) {
            setErrors((x) => [...x, `${job.label} : ${e instanceof Error ? e.message : String(e)}`]);
          }
          done++;
          setProgress((x) => ({ ...x, done }));
        }
      };
      await Promise.all(Array.from({ length: ph.parallel }, worker));
      if (stop.current) break;
    }
    await finishRapprochementAction(slug);
    router.refresh();
    setState("done");
    setProgress((x) => ({ ...x, label: stop.current ? "Arrêté" : "Terminé" }));
  };

  const pctDone = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {state === "running" ? (
          <button
            type="button"
            onClick={() => (stop.current = true)}
            className="press inline-flex h-10 items-center gap-2 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-4 text-[13px] hover:border-rule-3"
          >
            <Square className="size-3.5" aria-hidden /> Arrêter
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={start}
            className="press inline-flex h-10 items-center gap-2 rounded-[var(--radius-m)] bg-chalk-1 px-4 text-[13px] font-medium text-ink-0 hover:bg-white disabled:opacity-50"
          >
            <ScanSearch className="size-4" aria-hidden /> {state === "done" ? "Relancer le rapprochement" : "Lancer le rapprochement"}
          </button>
        )}
        <label className="inline-flex items-center gap-2 text-[12px] text-chalk-3">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={state === "running"} className="accent-[var(--signal)]" />
          Tout réanalyser (sinon seules les nouvelles créas sont analysées)
        </label>
      </div>

      {state !== "idle" ? (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-chalk-2">{progress.label}</span>
            <span className="num text-chalk-3">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-3">
            <div className="h-full rounded-full bg-signal transition-[width] duration-300" style={{ width: `${pctDone}%` }} />
          </div>
          {errors.length ? (
            <details className="mt-2 text-[12px] text-watch">
              <summary className="cursor-pointer">
                {errors.length} créa{errors.length > 1 ? "s" : ""} non analysée{errors.length > 1 ? "s" : ""} (voir le détail)
              </summary>
              <ul className="mt-1 space-y-0.5 text-chalk-3">
                {errors.slice(0, 30).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-[12px] text-watch">{msg}</p> : null}
    </div>
  );
}
