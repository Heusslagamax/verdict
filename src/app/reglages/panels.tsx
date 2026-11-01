"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Copy, Trash2 } from "lucide-react";
import clsx from "clsx";
import {
  cancelInvitationAction,
  createShopAction,
  deleteSecretAction,
  inviteMemberAction,
  removeMemberAction,
  saveSecretAction,
  saveWorkspaceAction,
  type ActionResult,
} from "@/app/actions";
import type { MetaAccount } from "@/lib/adapters/meta";
import { Panel } from "@/components/ui";

const input =
  "h-10 w-full rounded-[var(--radius-m)] border border-rule-2 bg-ink-well px-3 text-[14px] placeholder:text-chalk-4 focus:border-rule-3 focus:outline-none disabled:opacity-50";
const btn = "press h-10 shrink-0 rounded-[var(--radius-m)] border border-rule-2 bg-ink-2 px-3.5 text-[13px] hover:border-rule-3 disabled:opacity-50";
const primary = "press h-10 shrink-0 rounded-[var(--radius-m)] bg-chalk-1 px-4 text-[13px] font-medium text-ink-0 hover:bg-white disabled:opacity-50";

function useRunner() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      setResult(null);
      try {
        const r = await fn();
        setResult(r);
        if (r.ok) onOk?.();
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : "Erreur" });
      }
    });
  const status = result ? (
    <p role="status" className={clsx("mt-2 text-[12px]", result.ok ? "text-keep" : "text-cut")}>
      {result.message}
    </p>
  ) : null;
  return { run, pending, status };
}

function Section({ title, hint, children, aside }: { title: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {aside}
      </div>
      {hint ? <p className="mt-1 max-w-[72ch] text-[13px] text-chalk-3">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

// ---------- Espace ----------
export function WorkspacePanel({
  name,
  pnlSpreadsheetId,
  serviceAccountEmail,
  isOwner,
}: {
  name: string;
  pnlSpreadsheetId: string | null;
  serviceAccountEmail: string | null;
  isOwner: boolean;
}) {
  const [n, setN] = useState(name);
  const [sheet, setSheet] = useState(pnlSpreadsheetId ?? "");
  const [copied, setCopied] = useState(false);
  const { run, pending, status } = useRunner();
  return (
    <Section title="Espace" hint="Le nom de ton espace et ton fichier P&L Google Sheets (onglet DAILY REPORT), source des décisions de budget.">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-[12px] text-chalk-2">Nom de l&apos;espace</span>
          <input value={n} onChange={(e) => setN(e.target.value)} disabled={!isOwner} className={clsx(input, "mt-1")} />
        </label>
        <label className="block">
          <span className="text-[12px] text-chalk-2">Lien ou identifiant du fichier P&L</span>
          <input
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
            disabled={!isOwner}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className={clsx(input, "num mt-1")}
          />
        </label>
      </div>
      {serviceAccountEmail ? (
        <div className="mt-3 rounded-[var(--radius-m)] border border-rule-1 px-3 py-2.5 text-[12px] text-chalk-3">
          Partage ton fichier P&L en <span className="text-chalk-1">Lecteur</span> avec cette adresse :
          <span className="mt-1 flex items-center gap-2">
            <code className="num break-all text-chalk-1">{serviceAccountEmail}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(serviceAccountEmail).then(() => setCopied(true));
              }}
              className="press grid size-7 shrink-0 place-items-center rounded-[6px] hover:bg-ink-3"
              aria-label="Copier l'adresse"
            >
              <Copy className="size-3.5" />
            </button>
            {copied ? <span className="text-keep">Copiée</span> : null}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-chalk-3">La lecture du P&L n&apos;est pas encore activée sur la plateforme (compte de service Google).</p>
      )}
      {isOwner ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => saveWorkspaceAction({ name: n, pnlSpreadsheetId: sheet }))}
          className={clsx(primary, "mt-4")}
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      ) : (
        <p className="mt-3 text-[12px] text-chalk-3">Seul un propriétaire de l&apos;espace peut modifier ces réglages.</p>
      )}
      {status}
    </Section>
  );
}

// ---------- Connexions ----------
type Kind = "meta" | "trendtrack" | "anthropic";
type Status = Record<Kind, { set: boolean; last4: string | null; readable: boolean }>;

const CONNECTIONS: { kind: Kind; name: string; what: string; how: ReactNode; placeholder: string }[] = [
  {
    kind: "meta",
    name: "Meta Ads",
    what: "Tes ads, leurs chiffres et leurs créas, en lecture seule.",
    how: (
      <>
        Business Manager → Paramètres → Utilisateurs système → Ajouter (Employé) → Attribuer tes comptes pub (« Voir les performances ») → Générer un jeton
        avec la seule permission <code className="num text-chalk-2">ads_read</code>, expiration « Jamais ».
      </>
    ),
    placeholder: "EAAB…",
  },
  {
    kind: "trendtrack",
    name: "TrendTrack",
    what: "Le radar concurrents : ads qui montent, validées, coupées.",
    how: <>app.trendtrack.io → Workspace settings → API → Nouvelle clé.</>,
    placeholder: "tt_…",
  },
  {
    kind: "anthropic",
    name: "IA Anthropic",
    what: "Le brief du matin et la comparaison des scripts d'une langue à l'autre. Facturé sur ton compte Anthropic.",
    how: <>console.anthropic.com → API Keys → Create Key.</>,
    placeholder: "sk-ant-…",
  },
];

export function ConnectionsPanel({ status, isOwner }: { status: Status; isOwner: boolean }) {
  return (
    <Section
      title="Connexions"
      hint="Les clés de cet espace. Elles sont vérifiées auprès du service avant d'être enregistrées, puis chiffrées. Personne ne peut les relire, pas même toi : seuls les 4 derniers caractères s'affichent."
    >
      <ul>
        {CONNECTIONS.map((c) => (
          <ConnectionRow key={c.kind} {...c} state={status[c.kind]} isOwner={isOwner} />
        ))}
      </ul>
    </Section>
  );
}

function ConnectionRow({
  kind,
  name,
  what,
  how,
  placeholder,
  state,
  isOwner,
}: (typeof CONNECTIONS)[number] & { state: Status[Kind]; isOwner: boolean }) {
  const [editing, setEditing] = useState(!state.set);
  const [value, setValue] = useState("");
  const [accounts, setAccounts] = useState<MetaAccount[] | null>(null);
  const { run, pending, status } = useRunner();
  const label = !state.set ? "Absente" : !state.readable ? "Illisible, à ressaisir" : `Branchée · ••••${state.last4}`;
  return (
    <li className="border-t border-rule-1 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-medium">{name}</h3>
          <p className="text-[12px] text-chalk-3">{what}</p>
        </div>
        <span className={clsx("num text-[12px]", state.set && state.readable ? "text-keep" : state.set ? "text-cut" : "text-chalk-3")}>{label}</span>
      </div>
      {isOwner ? (
        editing ? (
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim().length < 10) return;
              run(
                async () => {
                  const r = await saveSecretAction(kind, value);
                  if ("accounts" in r && r.accounts) setAccounts(r.accounts);
                  return r;
                },
                () => {
                  setValue("");
                  setEditing(false);
                },
              );
            }}
          >
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className={clsx(input, "num min-w-0 flex-1")}
              />
              <button disabled={pending || value.trim().length < 10} className={primary}>
                {pending ? "Vérification…" : "Vérifier et enregistrer"}
              </button>
              {state.set ? (
                <button type="button" onClick={() => setEditing(false)} className={btn}>
                  Annuler
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-chalk-3">{how}</p>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className={btn}>
              Remplacer
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Supprimer la clé ${name} de cet espace ?`)) run(() => deleteSecretAction(kind), () => setEditing(true));
              }}
              className={clsx(btn, "text-chalk-3 hover:text-cut")}
            >
              Supprimer
            </button>
          </div>
        )
      ) : null}
      {status}
      {accounts?.length ? (
        <p className="mt-1 text-[12px] text-chalk-3">
          Comptes accessibles : {accounts.map((a) => `${a.name} (${a.id})`).join(", ")}. Choisis-en un par boutique ci-dessous.
        </p>
      ) : null}
    </li>
  );
}

// ---------- Nouvelle boutique ----------
export function NewShopPanel({ accounts }: { accounts: MetaAccount[] }) {
  const [name, setName] = useState("");
  const [market, setMarket] = useState("IT");
  const [account, setAccount] = useState("");
  const { run, pending, status } = useRunner();
  return (
    <Section title="Ajouter une boutique" hint="Une boutique = un compte publicitaire Meta. Tu régleras ses seuils ROAS et ses concurrents juste après.">
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createShopAction({ name, market, metaAdAccountId: account || null }), () => {
            setName("");
            setAccount("");
          });
        }}
      >
        <label className="block">
          <span className="text-[12px] text-chalk-2">Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ma boutique" className={clsx(input, "mt-1")} />
        </label>
        <label className="block">
          <span className="text-[12px] text-chalk-2">Marché</span>
          <input value={market} maxLength={2} onChange={(e) => setMarket(e.target.value.toUpperCase())} className={clsx(input, "num mt-1 text-center")} />
        </label>
        <label className="block">
          <span className="text-[12px] text-chalk-2">Compte publicitaire</span>
          {accounts.length ? (
            <select value={account} onChange={(e) => setAccount(e.target.value)} className={clsx(input, "mt-1")}>
              <option value="">Plus tard</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.id}
                </option>
              ))}
            </select>
          ) : (
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Facultatif" className={clsx(input, "num mt-1")} />
          )}
        </label>
        <div className="flex items-end">
          <button disabled={pending || !name.trim()} className={primary}>
            {pending ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>
      {status}
    </Section>
  );
}

// ---------- Membres ----------
export function MembersPanel({
  members,
  pending: invites,
  viewerId,
  isOwner,
}: {
  members: { userId: string; email: string; role: "owner" | "member" }[];
  pending: { id: string; email: string; role: string }[];
  viewerId: string;
  isOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const { run, pending, status } = useRunner();
  return (
    <Section
      title="Membres"
      hint="Les personnes qui voient ce cockpit. Un membre consulte, marque les créas et colle des scripts ; un propriétaire gère aussi les clés, les boutiques et les membres."
      aside={<span className="num text-[12px] text-chalk-3">{members.length}</span>}
    >
      <ul>
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 border-b border-rule-1 py-2.5 text-[13px]">
            <span className="min-w-0 truncate">
              {m.email}
              {m.userId === viewerId ? <span className="ml-2 text-chalk-3">(toi)</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[12px] text-chalk-3">{m.role === "owner" ? "Propriétaire" : "Membre"}</span>
              {isOwner && m.userId !== viewerId ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Retirer ${m.email} de cet espace ?`)) run(() => removeMemberAction(m.userId));
                  }}
                  className="press grid size-8 place-items-center rounded-[7px] text-chalk-3 hover:bg-ink-3 hover:text-cut"
                  aria-label={`Retirer ${m.email}`}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </span>
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 border-b border-rule-1 py-2.5 text-[13px] text-chalk-2">
            <span className="min-w-0 truncate">{i.email}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[12px] text-watch">Invité · pas encore connecté</span>
              {isOwner ? (
                <button type="button" onClick={() => run(() => cancelInvitationAction(i.id))} className="text-[12px] text-chalk-3 hover:text-cut">
                  Annuler
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => inviteMemberAction(email, role), () => setEmail(""));
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="associe@exemple.com"
            className={clsx(input, "min-w-0 flex-1")}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "member" | "owner")} className={clsx(input, "w-auto")}>
            <option value="member">Membre</option>
            <option value="owner">Propriétaire</option>
          </select>
          <button disabled={pending || !email.trim()} className={primary}>
            Inviter
          </button>
        </form>
      ) : null}
      {status}
      {isOwner ? (
        <p className="mt-2 text-[12px] text-chalk-3">L&apos;invité se connecte avec son e-mail sur la page de connexion : son accès est déjà ouvert.</p>
      ) : null}
    </Section>
  );
}
