-- VERDICT — schéma initial.
-- Accès : seuls les membres (utilisateurs invités depuis le tableau de bord Supabase,
-- inscriptions publiques désactivées) lisent et écrivent. Le serveur synchronise avec la
-- clé secrète, qui contourne la RLS ; le navigateur n'interroge jamais ces tables directement.

create extension if not exists pgcrypto;

-- ---------- Membres ----------
create table public.members (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid()));
$$;

-- Tout utilisateur créé (donc invité, puisque les inscriptions sont fermées) devient membre.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (user_id, email) values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Boutiques et concurrents ----------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  market text not null default 'IT',
  meta_ad_account_id text,
  thresholds jsonb,  -- { be, targetLow, target, loss20, jump, atcTarget, aov }
  pnl jsonb,         -- { dateColumn, spendColumn, salesColumn, roasColumn }
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name text not null,
  brandtracker_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, brandtracker_id)
);

-- ---------- Données Meta ----------
-- Photo complète par boutique (campagnes + ads + jours) : petite volumétrie, lecture en un coup.
create table public.meta_snapshots (
  shop_id uuid primary key references public.shops on delete cascade,
  fetched_at timestamptz not null,
  campaigns jsonb not null,
  ads jsonb not null
);

-- Historique journalier par ad, conservé au-delà de la fenêtre Meta.
create table public.meta_ad_days (
  shop_id uuid not null references public.shops on delete cascade,
  ad_id text not null,
  date date not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  link_clicks integer not null default 0,
  add_to_cart integer not null default 0,
  checkouts integer not null default 0,
  purchases integer not null default 0,
  value numeric not null default 0,
  primary key (ad_id, date)
);

-- Scripts de tes ads (collés à la main) pour comparer avec les créas concurrentes.
create table public.ad_scripts (
  ad_id text primary key,
  shop_id uuid not null references public.shops on delete cascade,
  script text not null,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);

-- ---------- Données concurrents (TrendTrack) ----------
create table public.competitor_ads (
  competitor_id uuid not null references public.competitors on delete cascade,
  id text not null,
  data jsonb not null,
  status text not null,
  previous_status text,
  first_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (competitor_id, id)
);

create table public.competitor_rank_history (
  competitor_id uuid not null references public.competitors on delete cascade,
  ad_id text not null,
  date date not null,
  status text not null,
  rank integer,
  reach bigint,
  primary key (competitor_id, ad_id, date)
);

create table public.competitor_flags (
  competitor_id uuid not null references public.competitors on delete cascade,
  ad_id text not null,
  flag text not null check (flag in ('deja_teste', 'iteration', 'ignore')),
  note text,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  primary key (competitor_id, ad_id)
);

create table public.ai_matches (
  competitor_id uuid not null references public.competitors on delete cascade,
  ad_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (competitor_id, ad_id)
);

-- ---------- Brief IA et journal ----------
create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  content jsonb not null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table public.sync_runs (
  id bigserial primary key,
  source text not null check (source in ('meta', 'trendtrack', 'ai', 'pnl')),
  shop_id uuid references public.shops on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail text,
  credits_left integer
);

create index on public.meta_ad_days (shop_id, date);
create index on public.competitor_ads (competitor_id, status);
create index on public.briefs (shop_id, created_at desc);
create index on public.sync_runs (source, shop_id, started_at desc);

-- ---------- RLS : membres uniquement ----------
do $$
declare t text;
begin
  foreach t in array array[
    'members','shops','competitors','meta_snapshots','meta_ad_days','ad_scripts',
    'competitor_ads','competitor_rank_history','competitor_flags','ai_matches','briefs','sync_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "membres" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))',
      t
    );
  end loop;
end $$;
