-- Connexion par e-mail sans création manuelle des comptes : seules les adresses de cette
-- liste peuvent obtenir un compte ; toute autre inscription est refusée par la base.
-- Ajouter une adresse : insert into public.allowed_emails (email) values ('prenom@exemple.com');

create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
create policy "membres" on public.allowed_emails for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

create or replace function private.gate_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Adresse non autorisée sur Verdict';
  end if;
  return new;
end;
$$;
revoke all on function private.gate_new_user() from public, anon, authenticated;

drop trigger if exists gate_new_user on auth.users;
create trigger gate_new_user
  before insert on auth.users
  for each row execute function private.gate_new_user();
