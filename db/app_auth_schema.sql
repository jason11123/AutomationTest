create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  role text not null default 'user' check (role in ('admin','user')),
  is_active boolean not null default true,
  timezone text not null default 'Asia/Jakarta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill for older schema that previously linked profiles.id -> auth.users(id)
do $$
declare
  fk_name text;
begin
  select c.conname
  into fk_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and c.contype = 'f'
  limit 1;

  if fk_name is not null then
    execute format('alter table public.profiles drop constraint %I', fk_name);
  end if;
end $$;

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists password_hash text;
alter table public.profiles alter column id set default gen_random_uuid();
create unique index if not exists uq_profiles_email on public.profiles (lower(email));

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_token text not null unique,
  ip_address inet,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare
  fk_name text;
begin
  select c.conname
  into fk_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'auth_sessions'
    and c.contype = 'f'
  limit 1;

  if fk_name is not null then
    execute format('alter table public.auth_sessions drop constraint %I', fk_name);
  end if;
end $$;

alter table public.auth_sessions
  add constraint auth_sessions_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

create index if not exists idx_auth_sessions_user_id on public.auth_sessions(user_id);
create index if not exists idx_auth_sessions_expires_at on public.auth_sessions(expires_at);
