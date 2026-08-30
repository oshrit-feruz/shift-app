-- The holdings ledger: the user's own portfolios and the transactions in them.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → new query → run).
--
-- WHY TABLES AND NOT THE user_state JSONB BAG. The bag is written wholesale on
-- a 1.5s debounce, so two devices adding a transaction in the same window each
-- upload their own copy of the whole bag and the later write wins — one
-- transaction disappears with no error anywhere. That is survivable for a
-- watchlist; it is not survivable for someone's cost basis. Rows insert
-- independently and cannot overwrite each other.
--
-- portfolios   — one per theoretical portfolio, including the auto-provisioned
--                Sandbox every user gets.
-- transactions — immutable buy / sell / dividend rows. No update path at all
--                (see the policies): an edit is a delete and a re-add, which
--                is one extra tap and is what makes the client's offline
--                outbox commutative — operations can be applied in any order
--                and replayed without changing the result.

-- ── Tables ─────────────────────────────────────────────────────────────

-- `id` is text and generated on the device (app/src/lib/ids.ts), not a
-- database default. This is what makes the offline outbox simple: the client
-- needs the id before the network call, a retried insert becomes a no-op via
-- `on conflict do nothing` rather than a duplicate, and the ids already in the
-- legacy jsonb bag move across verbatim, so the one-time import is idempotent
-- with no "already migrated" flag that would itself need syncing.
create table public.portfolios (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  -- The Sandbox. Exactly one per user (see the partial unique index) and it
  -- cannot be deleted (see the delete policy) — the client assumes a user
  -- always has somewhere to record a trade.
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.transactions (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  side        text not null check (side in ('buy', 'sell', 'div')),
  -- Matches the client's validateTx regex. Uppercase, 1-10 characters, with
  -- dots and hyphens for class shares and foreign listings (BRK.B, RY-PT).
  ticker      text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,9}$'),
  -- numeric, not double precision. This is someone's cost basis: binary
  -- floating point cannot represent 0.1, and an average cost that drifts in
  -- the seventh decimal across a hundred transactions is a bug nobody can
  -- explain to the person holding the position.
  shares      numeric(20, 8) not null check (shares >= 0),
  price       numeric(20, 8) not null check (price >= 0),
  -- The trade date, which is not the row's creation date: a back-dated trade
  -- entered today still happened when it happened, and average-cost
  -- accounting is order-dependent, so the fold sorts on this.
  trade_date  date not null check (trade_date <= (now() at time zone 'utc')::date + 1),
  created_at  timestamptz not null default now()
);

-- Ordered reads of one portfolio's log, which is every read this table has.
-- created_at is in the index because same-day trades need a tiebreaker that
-- does not change between two clients folding the same rows.
create index transactions_portfolio_date_idx
  on public.transactions (portfolio_id, trade_date, created_at);
create index transactions_user_idx on public.transactions (user_id);
create index portfolios_user_idx   on public.portfolios (user_id);

-- Exactly one Sandbox per user, enforced by the database rather than by
-- everyone who writes to it. The signup trigger below and the client's
-- ensureSandbox() self-heal can therefore both run without coordination: the
-- loser of a race gets 23505, which the client reads as success.
create unique index portfolios_one_default_per_user
  on public.portfolios (user_id) where is_default;

-- ── Row-Level Security ─────────────────────────────────────────────────

alter table public.portfolios   enable row level security;
alter table public.transactions enable row level security;

-- auth.uid() wrapped in a scalar subselect throughout, per 0004_rls_initplan.

create policy "own portfolios read" on public.portfolios
  for select using ((select auth.uid()) = user_id);
create policy "own portfolios insert" on public.portfolios
  for insert with check ((select auth.uid()) = user_id);
create policy "own portfolios update" on public.portfolios
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- DELETE is granted here, unlike on profiles/user_state in 0001_auth.sql, and
-- deliberately so. Those are singleton lifecycle rows created by trigger and
-- removed by cascade, where a client delete could only be a mistake. These are
-- user-authored content, where deleting is the ordinary editing gesture — a
-- typo in a cost basis has to be removable, and soft-delete tombstones would
-- be more surface to get wrong, not less.
--
-- `and not is_default` keeps Sandbox: the invariant that every user has a
-- portfolio is enforced where it cannot be talked around, rather than by the
-- UI merely declining to offer the button.
create policy "own portfolios delete" on public.portfolios
  for delete using ((select auth.uid()) = user_id and not is_default);

create policy "own transactions read" on public.transactions
  for select using ((select auth.uid()) = user_id);

-- The `exists` clause is not redundant with the foreign key. A foreign key is
-- validated by the system, which does not apply RLS — without this, a caller
-- could file a transaction into someone else's portfolio, and although they
-- could never read it back, its owner would see it appear in their holdings.
create policy "own transactions insert" on public.transactions
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.portfolios p
      where p.id = portfolio_id and p.user_id = (select auth.uid())
    )
  );

create policy "own transactions delete" on public.transactions
  for delete using ((select auth.uid()) = user_id);

-- No update policy on transactions, on purpose. With RLS enabled and no
-- matching policy, updates are denied — the rows are immutable, which is the
-- property the client's sync relies on.

-- ── Auto-provisioning ──────────────────────────────────────────────────

-- Extends the signup trigger from 0001_auth.sql. Re-declared in full because
-- `create or replace` replaces the whole body; the profiles/user_state inserts
-- below are verbatim from 0001.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, provider)
  values (new.id, new.raw_app_meta_data->>'provider');
  insert into public.user_state (user_id) values (new.id);
  insert into public.portfolios (id, user_id, name, is_default)
  values ('pf-sandbox-' || new.id::text, new.id, 'Sandbox', true);
  return new;
end;
$$;

-- Backfill every user who signed up before this migration. `on conflict do
-- nothing` covers the unique index, so re-running this file is safe.
insert into public.portfolios (id, user_id, name, is_default)
select 'pf-sandbox-' || u.id::text, u.id, 'Sandbox', true
from auth.users u
on conflict do nothing;
