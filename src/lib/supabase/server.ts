import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Client lié à la session de l'utilisateur (respecte la RLS). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Appelé depuis un Server Component : le proxy se charge du rafraîchissement.
        }
      },
    },
  });
}

/** Client serveur avec la clé secrète : synchronisations et tâches planifiées uniquement. */
export function supabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
