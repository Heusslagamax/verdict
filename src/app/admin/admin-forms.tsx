"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { cancelAccountInvitationAction, inviteAccountAction, type ActionResult } from "@/app/actions";

const input =
  "h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-3 text-[14px] placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none";

export function AdminInvite() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await inviteAccountAction(email, name);
          setResult(r);
          if (r.ok) {
            setEmail("");
            setName("");
          }
        });
      }}
    >
      <label className="block">
        <span className="text-[12px] text-chalk-2">E-mail</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.com" className={clsx(input, "mt-1")} />
      </label>
      <label className="block">
        <span className="text-[12px] text-chalk-2">Nom de son espace</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sa marque" className={clsx(input, "mt-1")} />
      </label>
      <button
        disabled={pending || !email.trim() || !name.trim()}
        className="press h-10 rounded-[var(--radius-m)] bg-chalk-1 px-4 text-[13px] font-medium text-ink-0 hover:bg-white disabled:opacity-50"
      >
        {pending ? "Ouverture…" : "Ouvrir l'accès"}
      </button>
      {result ? <p className={clsx("text-[12px]", result.ok ? "text-keep" : "text-cut")}>{result.message}</p> : null}
    </form>
  );
}

export function CancelAccountInvite({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await cancelAccountInvitationAction(id)))}
      className="shrink-0 text-[12px] text-chalk-3 hover:text-cut disabled:opacity-50"
    >
      Annuler
    </button>
  );
}
