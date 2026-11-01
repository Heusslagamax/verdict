-- Studio Ads : d'où vient chaque pub (pub concurrente copiée) et briefs d'itération suivis.

-- Fiche produit courte saisie dans Réglages (produit, offre, promesse, avatar) : contexte de l'IA.
alter table public.shops add column if not exists product_brief text;

-- Liaison pub → pub concurrente d'origine. Une seule source confirmée par pub ; les rejets
-- sont gardés pour ne plus reproposer la même suggestion. competitor_ad_id = '' marque une
-- pub « originale » (aucune source concurrente).
create table public.ad_source_links (
  shop_id uuid not null references public.shops on delete cascade,
  ad_id text not null,
  competitor_id uuid references public.competitors on delete cascade,
  competitor_ad_id text not null default '',
  status text not null check (status in ('confirmed', 'rejected')),
  method text not null default 'manuel' check (method in ('manuel', 'script', 'texte', 'ia', 'studio')),
  score numeric,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  primary key (shop_id, ad_id, competitor_ad_id)
);
create unique index ad_source_links_one_confirmed on public.ad_source_links (shop_id, ad_id) where status = 'confirmed';
create index ad_source_links_competitor on public.ad_source_links (competitor_id, competitor_ad_id) where status = 'confirmed';

-- Briefs d'itération produits par le Studio, avec leur suivi jusqu'au résultat Meta.
create table public.studio_briefs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  source_kind text not null check (source_kind in ('own', 'competitor')),
  source_id text not null,
  source_label text not null,
  competitor_id uuid references public.competitors on delete set null,
  element text not null,
  title text not null,
  brief jsonb not null,
  rule_ids text[] not null default '{}',
  status text not null default 'a_produire' check (status in ('a_produire', 'en_production', 'lancee', 'abandonnee')),
  launched_ad_id text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_briefs_shop on public.studio_briefs (shop_id, created_at desc);

alter table public.ad_source_links enable row level security;
alter table public.studio_briefs enable row level security;

create policy "membres de l'espace" on public.ad_source_links for all to authenticated
  using ((select private.shop_member(shop_id))) with check ((select private.shop_member(shop_id)));
create policy "membres de l'espace" on public.studio_briefs for all to authenticated
  using ((select private.shop_member(shop_id))) with check ((select private.shop_member(shop_id)));
