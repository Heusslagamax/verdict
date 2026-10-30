"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          setState({ ok: false, msg: "Entre une adresse e-mail valide." });
          return;
        }
        start(async () => {
          const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          );
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm` },
          });
          setState(
            error
              ? { ok: false, msg: "Envoi impossible. Vérifie que ton adresse a bien été invitée." }
              : { ok: true, msg: "Lien envoyé. Ouvre ta boîte mail sur cet appareil." },
          );
        });
      }}
    >
      <label className="block">
        <span className="text-[12px] text-chalk-3">Adresse e-mail</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setState(null);
          }}
          placeholder="toi@exemple.com"
          className="mt-1 h-11 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-3 text-[14px] placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none"
        />
      </label>
      <button
        disabled={pending}
        className="press h-11 w-full rounded-[var(--radius-m)] bg-chalk-1 text-[14px] font-medium text-ink-0 hover:bg-white disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Recevoir le lien"}
      </button>
      {state ? (
        <p role="status" className={`text-[13px] ${state.ok ? "text-keep" : "text-cut"}`}>
          {state.msg}
        </p>
      ) : null}
    </form>
  );
}
