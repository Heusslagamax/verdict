import { redirect } from "next/navigation";
import { demoMode } from "@/lib/env";
import { Mark } from "@/components/ui";
import { LoginForm } from "./login-form";

// Rendu à chaque requête : la session et les données ne sont jamais figées au build.
export const dynamic = "force-dynamic";

export const metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  lien: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau.",
  acces: "Ce compte n'a pas accès au cockpit.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (demoMode) redirect("/");
  const { e } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="text-[17px] font-semibold">Verdict</span>
        </div>
        <h1 className="mt-8 text-[24px] font-semibold">Connexion</h1>
        <p className="mt-1 text-[14px] text-chalk-2">Accès sur invitation. Reçois un lien de connexion par e-mail.</p>
        {typeof e === "string" && ERRORS[e] ? <p className="mt-4 text-[13px] text-cut">{ERRORS[e]}</p> : null}
        <LoginForm />
      </div>
    </main>
  );
}
