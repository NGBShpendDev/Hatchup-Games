-- HatchUp account and save-data schema.
--
-- Important security boundary:
-- Supabase Auth owns email/password credentials in auth.users and auth.identities.
-- Public HatchUp tables must not store plaintext passwords, password hashes, OAuth
-- provider secrets, refresh tokens, or identity-provider access tokens.
-- These tables store only app profile, privacy settings, and gameplay save data.

create extension if not exists "pgcrypto";

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
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  onboarding_status text,
  privacy_consent_version text,
  leaderboard_share_enabled boolean not null default false
);

comment on table public.profiles is
  'HatchUp user-facing profile metadata. Credentials are managed by Supabase Auth, not this table.';
comment on column public.profiles.email is
  'Convenience copy of the authenticated email for app display/support. Supabase Auth remains source of truth.';

create table if not exists public.hatchup_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  save_data jsonb not null,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.hatchup_saves is
  'Cloud-backed HatchUp gameplay save blobs. Contains app/game data only, never auth credentials.';

create unique index if not exists hatchup_saves_user_id_unique
  on public.hatchup_saves(user_id);

create index if not exists hatchup_saves_updated_at_idx
  on public.hatchup_saves(updated_at desc);

create table if not exists public.account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  analytics_enabled boolean not null default false,
  crash_reporting_enabled boolean not null default true,
  cloud_sync_enabled boolean not null default true,
  health_connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_settings is
  'Per-user HatchUp settings and privacy flags. Does not store credentials or provider secrets.';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_hatchup_saves_updated_at on public.hatchup_saves;
create trigger set_hatchup_saves_updated_at
before update on public.hatchup_saves
for each row
execute function public.set_updated_at();

drop trigger if exists set_account_settings_updated_at on public.account_settings;
create trigger set_account_settings_updated_at
before update on public.account_settings
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.hatchup_saves enable row level security;
alter table public.account_settings enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

drop policy if exists "hatchup_saves_select_own" on public.hatchup_saves;
create policy "hatchup_saves_select_own"
on public.hatchup_saves
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "hatchup_saves_insert_own" on public.hatchup_saves;
create policy "hatchup_saves_insert_own"
on public.hatchup_saves
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "hatchup_saves_update_own" on public.hatchup_saves;
create policy "hatchup_saves_update_own"
on public.hatchup_saves
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "hatchup_saves_delete_own" on public.hatchup_saves;
create policy "hatchup_saves_delete_own"
on public.hatchup_saves
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "account_settings_select_own" on public.account_settings;
create policy "account_settings_select_own"
on public.account_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "account_settings_insert_own" on public.account_settings;
create policy "account_settings_insert_own"
on public.account_settings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "account_settings_update_own" on public.account_settings;
create policy "account_settings_update_own"
on public.account_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "account_settings_delete_own" on public.account_settings;
create policy "account_settings_delete_own"
on public.account_settings
for delete
to authenticated
using (auth.uid() = user_id);

-- Setup notes:
-- 1. In Supabase Dashboard > Authentication > Providers, enable Email auth.
-- 2. Enable Google provider and configure the Google OAuth client values in the
--    Supabase dashboard. Do not put Google client secrets in the mobile app.
-- 3. Enable Apple provider and configure Apple Services ID / key material in
--    the Supabase dashboard. Do not put Apple provider secrets in the mobile app.
-- 4. Configure redirect URLs for Expo/dev/prod. Include:
--      hatchup://auth/callback
--      exp://127.0.0.1:8081/--/auth/callback
--      exp://localhost:8081/--/auth/callback
--      https://<your-production-domain>/auth/callback
--    Keep this list aligned with Expo/EAS builds and any Vercel landing/auth
--    callback routes you add later.
-- 5. Add production env vars to EAS for mobile builds:
--      EXPO_PUBLIC_SUPABASE_URL
--      EXPO_PUBLIC_SUPABASE_ANON_KEY
--    If the landing page needs auth-aware routes later, add equivalent public
--    Supabase env vars to Vercel as well.
