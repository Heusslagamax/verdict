-- Durcissement (audit de sécurité Supabase) : les fonctions SECURITY DEFINER ne doivent pas
-- être appelables depuis l'API publique.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid()));
$$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'members','shops','competitors','meta_snapshots','meta_ad_days','ad_scripts',
    'competitor_ads','competitor_rank_history','competitor_flags','ai_matches','briefs','sync_runs'
  ] loop
    execute format('drop policy if exists "membres" on public.%I', t);
    execute format(
      'create policy "membres" on public.%I for all to authenticated using ((select private.is_member())) with check ((select private.is_member()))',
      t
    );
  end loop;
end $$;

drop function if exists public.is_member();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
