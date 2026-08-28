-- Auth foundation: per-user profile + persisted app state, RLS-only access.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → new query → run).
--
-- profiles    — the minimal identity row other features attach to later
--               (per-user alerts, SnapTrade connections). Created by trigger
--               on signup, never by the client.
-- user_state  — jsonb mirror of the app's PERSISTED slice (see
--               app/src/state/appState.tsx). jsonb on purpose: the slice is a
--               bag of keys written wholesale, so the schema survives
--               whitelist changes without a migration, and advAnswers/advStage
--               stay opaque — the regulatory mapping logic in
--               app/src/lib/advisory.ts is never re-encoded server-side.

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  provider   text
);

create table public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles   enable row level security;
alter table public.user_state enable row level security;

-- Each user reads/writes only their own rows. No delete policies and no anon
-- access: with RLS enabled and no matching policy, everything else is denied.
create policy "own profile read"   on public.profiles   for select using (auth.uid() = id);
create policy "own profile update" on public.profiles   for update using (auth.uid() = id);
create policy "own state read"     on public.user_state for select using (auth.uid() = user_id);
create policy "own state insert"   on public.user_state for insert with check (auth.uid() = user_id);
create policy "own state update"   on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Rows are created server-side at signup so the client never needs insert
-- rights on profiles. security definer: the trigger runs as the function
-- owner because the signing-up user has no table grants yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, provider)
  values (new.id, new.raw_app_meta_data->>'provider');
  insert into public.user_state (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
