-- A runtime switch for the entry experiment.
--
-- WHY THIS EXISTS. PR 2 changed the first thing a new user sees. Reverting
-- that has, until now, meant changing code and waiting for a deploy: the
-- repo's only two flags (VITE_REQUIRE_INSTALL, VITE_APPLE_AUTH_ENABLED) are
-- build-time Vite variables, so flipping one on Vercel still rebuilds. A
-- routing change to the first screen needs to be revertible faster than that,
-- by someone who is not mid-deploy.
--
-- ONE ROW, ENFORCED BY THE KEY. `id boolean primary key check (id)` admits
-- exactly one value — true — so the table cannot quietly acquire a second row
-- that half the readers see. A config table with two rows is a config table
-- nobody can reason about.
create table public.app_config (
  id                       boolean primary key default true check (id),
  entry_experiment_enabled boolean     not null default false,
  updated_at               timestamptz not null default now()
);

-- Seeded OFF. The row exists from the start so that flipping the switch is an
-- update rather than an insert, and so a reader that finds no row at all knows
-- something is wrong rather than treating absence as a setting.
insert into public.app_config (id, entry_experiment_enabled) values (true, false);

alter table public.app_config enable row level security;

-- Readable by everyone, including signed-out clients: the flag decides what an
-- unauthenticated boot renders, and it holds nothing private — one boolean
-- about which screen the app shows.
create policy app_config_read on public.app_config
  for select to anon, authenticated using (true);

grant select on public.app_config to anon, authenticated;

-- Deliberately no insert/update/delete grant. The switch is flipped from the
-- SQL editor or by a service-role key, never by the app. A client that can
-- turn its own experiment off is not a kill switch, it is a preference.
