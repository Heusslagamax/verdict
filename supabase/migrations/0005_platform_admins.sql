-- Administrateurs de la plateforme : peuvent créer un espace pour un nouvel e-mail.
-- Lue uniquement par le serveur (aucune politique RLS).
create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
insert into public.platform_admins (user_id)
select id from auth.users where email = 'hossamounouna@gmail.com';
