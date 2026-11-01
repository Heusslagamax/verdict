-- Multi-espaces : chaque compte a son espace (boutiques, concurrents, clés), partageable
-- avec des membres. Accès uniquement sur invitation : un administrateur de la plateforme
-- crée un espace pour un nouvel e-mail, un propriétaire invite des membres dans le sien.
-- Le serveur lit et écrit avec la clé secrète après avoir vérifié l'appartenance ; la RLS
-- ci-dessous reste une seconde barrière si un client interrogeait la base directement.

-- ---------- Espaces ----------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  pnl_spreadsheet_id text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- Clés des services, chiffrées par l'application (AES-256-GCM). Aucune politique RLS :
-- seul le serveur (clé secrète) y accède.
create table public.workspace_secrets (
  workspace_id uuid primary key references public.workspaces on delete cascade,
  meta_token text,
  trendtrack_key text,
  anthropic_key text,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);

-- Invitations : workspace_id renseigné = rejoindre cet espace ; sinon = créer un nouvel
-- espace nommé workspace_name dont l'invité sera propriétaire.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  workspace_id uuid references public.workspaces on delete cascade,
  workspace_name text,
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (workspace_id is not null or workspace_name is not null)
);
create index on public.invitations (email) where accepted_at is null;

-- ---------- Reprise de l'existant : un espace pour le compte déjà créé ----------
insert into public.workspaces (id, name, created_by)
select gen_random_uuid(), 'Moulay Agency', u.id from auth.users u
where u.email = 'hossamounouna@gmail.com';

insert into public.workspace_members (workspace_id, user_id, email, role)
select w.id, w.created_by, 'hossamounouna@gmail.com', 'owner' from public.workspaces w
where w.name = 'Moulay Agency';

update public.workspaces set pnl_spreadsheet_id = '1G1Du9llysrNUx4rUHV-Ri79cfOzLW0B9iuPXuefy9Ps'
where name = 'Moulay Agency';

-- ---------- Boutiques rattachées à un espace ----------
alter table public.shops add column workspace_id uuid references public.workspaces on delete cascade;
update public.shops set workspace_id = (select id from public.workspaces where name = 'Moulay Agency' limit 1);
alter table public.shops alter column workspace_id set not null;
alter table public.shops drop constraint shops_slug_key;
alter table public.shops add constraint shops_workspace_slug_key unique (workspace_id, slug);
create index on public.shops (workspace_id);

-- Un même compte pub peut être suivi par deux espaces : clés composées par boutique.
alter table public.meta_ad_days drop constraint meta_ad_days_pkey;
alter table public.meta_ad_days add primary key (shop_id, ad_id, date);
alter table public.ad_scripts drop constraint ad_scripts_pkey;
alter table public.ad_scripts add primary key (shop_id, ad_id);

-- ---------- Fonctions privées ----------
create or replace function private.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;

create or replace function private.shop_member(s uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shops sh
    join public.workspace_members m on m.workspace_id = sh.workspace_id
    where sh.id = s and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.shop_member(uuid) from public, anon;
grant execute on function private.shop_member(uuid) to authenticated;

create or replace function private.competitor_member(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.competitors co
    join public.shops sh on sh.id = co.shop_id
    join public.workspace_members m on m.workspace_id = sh.workspace_id
    where co.id = c and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.competitor_member(uuid) from public, anon;
grant execute on function private.competitor_member(uuid) to authenticated;

-- Applique une invitation à un utilisateur existant.
create or replace function private.apply_invitation(inv public.invitations, uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if inv.workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, email, role)
    values (inv.workspace_id, uid, inv.email, inv.role)
    on conflict (workspace_id, user_id) do nothing;
  else
    insert into public.workspaces (name, created_by) values (inv.workspace_name, uid) returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, email, role)
    values (ws, uid, inv.email, 'owner');
  end if;
  update public.invitations set accepted_at = now() where id = inv.id;
end;
$$;
revoke all on function private.apply_invitation(public.invitations, uuid) from public, anon, authenticated;

-- Création d'un compte : refusée sans invitation en attente.
create or replace function private.gate_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.invitations i where i.email = lower(new.email) and i.accepted_at is null
  ) then
    raise exception 'Adresse non autorisée sur Verdict';
  end if;
  return new;
end;
$$;

-- Compte créé : on applique toutes ses invitations en attente.
create or replace function private.on_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  for inv in select * from public.invitations where email = lower(new.email) and accepted_at is null loop
    perform private.apply_invitation(inv, new.id);
  end loop;
  return new;
end;
$$;
revoke all on function private.on_user_created() from public, anon, authenticated;

-- Invitation d'une personne qui a déjà un compte : appliquée tout de suite.
create or replace function private.on_invitation_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = new.email limit 1;
  if uid is not null then
    perform private.apply_invitation(new, uid);
  end if;
  return null;
end;
$$;
revoke all on function private.on_invitation_created() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.on_user_created();

create trigger on_invitation_created
  after insert on public.invitations
  for each row execute function private.on_invitation_created();

-- ---------- Nettoyage de l'ancien modèle ----------
do $$
declare t text;
begin
  foreach t in array array[
    'members','shops','competitors','meta_snapshots','meta_ad_days','ad_scripts',
    'competitor_ads','competitor_rank_history','competitor_flags','ai_matches','briefs','sync_runs','allowed_emails'
  ] loop
    execute format('drop policy if exists "membres" on public.%I', t);
  end loop;
end $$;
drop table public.allowed_emails;
drop table public.members;
drop function if exists public.handle_new_user();
drop function if exists private.is_member();

-- ---------- RLS par appartenance à l'espace ----------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_secrets enable row level security;
alter table public.invitations enable row level security;

create policy "membres de l'espace" on public.workspaces for select to authenticated
  using ((select private.is_workspace_member(id)));
create policy "membres de l'espace" on public.workspace_members for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy "membres de l'espace" on public.shops for all to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

do $$
declare t text;
begin
  foreach t in array array['meta_snapshots','meta_ad_days','ad_scripts','briefs','sync_runs','competitors'] loop
    execute format(
      'create policy "membres de l''espace" on public.%I for all to authenticated using ((select private.shop_member(shop_id))) with check ((select private.shop_member(shop_id)))',
      t
    );
  end loop;
  foreach t in array array['competitor_ads','competitor_rank_history','competitor_flags','ai_matches'] loop
    execute format(
      'create policy "membres de l''espace" on public.%I for all to authenticated using ((select private.competitor_member(competitor_id))) with check ((select private.competitor_member(competitor_id)))',
      t
    );
  end loop;
end $$;
