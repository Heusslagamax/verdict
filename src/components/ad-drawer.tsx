"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { AdView } from "@/lib/data/views";
import type { Thresholds } from "@/lib/types";
import { eur, int, pct, roas } from "@/lib/format";
import { saveAdScript } from "@/app/actions";
import { Figure, Stamp } from "./ui";
import { roasColor } from "./ads-table";

interface Preview {
  iframe: string | null;
  video: { source: string | null; picture: string | null } | null;
  error?: string;
}

/** N'accepte que les iframes servies par Facebook, et ne réinjecte jamais le HTML reçu. */
function previewSrc(html: string | null): string | null {
  if (!html) return null;
  const m = html.match(/src="([^"]+)"/);
  if (!m) return null;
  const src = m[1].replace(/&amp;/g, "&");
  try {
    const u = new URL(src);
    return u.hostname.endsWith("facebook.com") ? src : null;
  } catch {
    return null;
  }
}

export function AdDrawer({
  ad,
  thresholds,
  shopSlug,
  onClose,
}: {
  ad: AdView | null;
  thresholds: Thresholds | null;
  shopSlug: string;
  campaignId: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"video" | "feed">("video");

  useEffect(() => {
    if (!ad) return;
    setPreview(null);
    setMode(ad.creative.videoId ? "video" : "feed");
    if (!/^\d+$/.test(ad.id)) return; // démo
    const q = new URLSearchParams({ ad: ad.id });
    if (ad.creative.videoId) q.set("video", ad.creative.videoId);
    const ctrl = new AbortController();
    fetch(`/api/meta/preview?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => {});
    return () => ctrl.abort();
  }, [ad]);

  const src = previewSrc(preview?.iframe ?? null);
  const video = preview?.video?.source ?? null;

  return (
    <Dialog.Root open={Boolean(ad)} onOpenChange={(o) => (!o ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-[rise_200ms]" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[880px] flex-col border-l border-rule-2 bg-ink-1 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] focus:outline-none"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {ad ? (
            <>
              <header className="flex items-start justify-between gap-4 border-b border-rule-1 px-5 py-4">
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-[18px] font-semibold">{ad.name}</Dialog.Title>
                  <p className="mt-0.5 text-[12px] text-chalk-3">
                    Créée il y a {ad.ageDays} j · {eur(ad.lifetimeSpend)} dépensés depuis le lancement · {ad.status.toLowerCase()}
                  </p>
                </div>
                <Dialog.Close className="press grid size-9 place-items-center rounded-[var(--radius-m)] text-chalk-2 hover:bg-ink-3 hover:text-chalk-1" aria-label="Fermer">
                  <X className="size-4" />
                </Dialog.Close>
              </header>

              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                {/* Créa */}
                <div className="border-b border-rule-1 p-5 md:border-b-0 md:border-r">
                  {ad.creative.videoId && src ? (
                    <div className="mb-3 flex gap-1 rounded-[var(--radius-m)] border border-rule-1 p-0.5 text-[12px]">
                      {(["video", "feed"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={`flex-1 rounded-[7px] py-1.5 ${mode === m ? "bg-ink-3 text-chalk-1" : "text-chalk-3"}`}
                        >
                          {m === "video" ? "Vidéo" : "Aperçu fil"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="overflow-hidden rounded-[var(--radius-m)] bg-ink-well outline outline-1 -outline-offset-1 outline-white/10">
                    {mode === "video" && video ? (
                      <video
                        src={video}
                        poster={preview?.video?.picture ?? ad.creative.thumbnailUrl ?? undefined}
                        controls
                        playsInline
                        className="aspect-[9/16] max-h-[560px] w-full bg-black object-contain"
                      />
                    ) : src ? (
                      <iframe src={src} title="Aperçu Meta" className="h-[560px] w-full border-0 bg-white" loading="lazy" />
                    ) : ad.creative.thumbnailUrl || ad.creative.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ad.creative.imageUrl ?? ad.creative.thumbnailUrl!} alt="" referrerPolicy="no-referrer" className="w-full object-contain" />
                    ) : (
                      <div className="grid aspect-[4/5] place-items-center text-[13px] text-chalk-3">
                        {preview === null && /^\d+$/.test(ad.id) ? "Chargement de l'aperçu…" : "Aperçu indisponible"}
                      </div>
                    )}
                  </div>
                  {preview?.error ? <p className="mt-2 text-[12px] text-cut">Meta : {preview.error}</p> : null}
                  {ad.creative.body ? (
                    <details className="mt-4 text-[13px] text-chalk-2">
                      <summary className="cursor-pointer text-chalk-3">Texte de l&apos;ad</summary>
                      <p className="mt-2 whitespace-pre-line">{ad.creative.body}</p>
                    </details>
                  ) : null}
                </div>

                {/* Lecture */}
                <div className="space-y-6 p-5">
                  {ad.verdict ? (
                    <section>
                      <div className="flex items-center gap-2">
                        <Stamp code={ad.verdict.code} />
                        <span className="text-[12px] text-chalk-3">{ad.verdict.source}</span>
                      </div>
                      <p className="mt-2 text-[14px] leading-6 text-chalk-1">{ad.verdict.rule}</p>
                    </section>
                  ) : null}

                  <section className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-rule-1 py-4 sm:grid-cols-3">
                    <Figure label="Dépense" value={eur(ad.totals.spend)} sub={`${pct(ad.share)} de la campagne`} />
                    <Figure
                      label="ROAS"
                      value={<span style={{ color: roasColor(ad.totals.roas, thresholds) }}>{roas(ad.totals.roas)}</span>}
                      sub={thresholds ? `BE ${roas(thresholds.be)} · target ${roas(thresholds.target)}` : undefined}
                    />
                    <Figure label="Achats" value={int(ad.totals.purchases)} sub={`CPA ${eur(ad.totals.cpa)}`} />
                    <Figure label="Coût / ajout panier" value={eur(ad.totals.costPerAtc)} sub={thresholds ? `cible ${eur(thresholds.atcTarget)}` : undefined} />
                    <Figure label="CPC lien" value={eur(ad.totals.cpc)} sub={`CTR ${pct(ad.totals.ctr, 2)}`} />
                    <Figure label="Ajouts panier" value={int(ad.totals.addToCart)} sub={`${int(ad.totals.checkouts)} paiements initiés`} />
                  </section>

                  <section>
                    <h3 className="text-[13px] font-medium text-chalk-2">Jour par jour</h3>
                    <table className="mt-2 w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-[12px] text-chalk-3">
                          <th className="py-1 font-normal">Jour</th>
                          <th className="py-1 text-right font-normal">Dépense</th>
                          <th className="py-1 text-right font-normal">ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...ad.trend].reverse().map((d) => (
                          <tr key={d.date} className="border-t border-rule-1">
                            <td className="num py-1.5 text-chalk-2">{new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</td>
                            <td className="num py-1.5 text-right">{eur(d.spend)}</td>
                            <td className="num py-1.5 text-right" style={{ color: roasColor(d.roas, thresholds) }}>{roas(d.roas)}</td>
                          </tr>
                        ))}
                        {!ad.trend.length ? (
                          <tr className="border-t border-rule-1">
                            <td colSpan={3} className="py-2 text-chalk-3">Aucune dépense sur les 7 derniers jours.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </section>

                  <ScriptEditor key={ad.id} shopSlug={shopSlug} adId={ad.id} initial={ad.script ?? ""} />
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScriptEditor({ shopSlug, adId, initial }: { shopSlug: string; adId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section>
      <h3 className="text-[13px] font-medium text-chalk-2">Script de cette ad</h3>
      <p className="mt-0.5 text-[12px] text-chalk-3">
        Colle le texte parlé de la vidéo. Le radar s&apos;en sert pour ne jamais te proposer une créa concurrente dont le script est déjà testé.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder="Hai mai lavato le scarpe in lavatrice senza rovinarle ?"
        className="mt-2 w-full resize-y rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-3 py-2 text-[13px] leading-5 text-chalk-1 placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || value === initial}
          onClick={() => start(async () => setMsg((await saveAdScript(shopSlug, adId, value)).message))}
          className="press h-9 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-3.5 text-[13px] hover:border-rule-3 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer le script"}
        </button>
        {msg ? <span role="status" className="text-[12px] text-chalk-3">{msg}</span> : null}
      </div>
    </section>
  );
}
