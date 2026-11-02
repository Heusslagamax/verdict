-- Rapprochement : empreinte de chaque créa (images clés + fiche IA) et correspondances jugées.

-- Une ligne par créa analysée (la mienne ou celle d'un concurrent). Les images clés sont
-- gardées en petit (320 px) pour les montrer côte à côte et les redonner à l'IA sans
-- retélécharger la vidéo.
create table public.creative_fingerprints (
  shop_id uuid not null references public.shops on delete cascade,
  kind text not null check (kind in ('own', 'competitor')),
  ref_id text not null,
  media text not null default 'none' check (media in ('video', 'image', 'thumbnail', 'none')),
  frames jsonb not null default '[]',
  thumbs jsonb not null default '[]',
  card jsonb,
  error text,
  updated_at timestamptz not null default now(),
  primary key (shop_id, kind, ref_id)
);

-- Correspondance jugée entre une de mes pubs et une pub concurrente, critère par critère.
create table public.source_matches (
  shop_id uuid not null references public.shops on delete cascade,
  ad_id text not null,
  competitor_ad_id text not null,
  competitor_id uuid references public.competitors on delete cascade,
  relation text not null check (relation in ('copie_1_1', 'iteration', 'meme_angle', 'different')),
  confidence text not null check (confidence in ('haute', 'moyenne', 'faible')),
  criteria jsonb not null,
  image_share numeric not null default 0,
  frame_pairs jsonb not null default '[]',
  evidence text not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, ad_id, competitor_ad_id)
);
create index source_matches_shop on public.source_matches (shop_id, created_at desc);

alter table public.creative_fingerprints enable row level security;
alter table public.source_matches enable row level security;

create policy "membres de l'espace" on public.creative_fingerprints for all to authenticated
  using ((select private.shop_member(shop_id))) with check ((select private.shop_member(shop_id)));
create policy "membres de l'espace" on public.source_matches for all to authenticated
  using ((select private.shop_member(shop_id))) with check ((select private.shop_member(shop_id)));
