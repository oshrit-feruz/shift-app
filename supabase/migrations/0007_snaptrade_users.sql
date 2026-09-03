-- 0007: the SnapTrade user behind each of our users.
--
-- HEADS UP, THIS TABLE HAS TWO AUTHORS. The branch
-- claude/customer-portfolio-connection-uubbde creates the same table in its
-- own `0006_snaptrade.sql`, and on the shared project that file is what
-- actually ran — so the table is already there. This one is written to be
-- idempotent against that: the create is `if not exists`, the column list
-- matches theirs exactly, and the operative statement here is the revoke.
-- If the two branches are merged, renumber one of them; nothing below has to
-- change for the app to work either way.
--
-- Per-user brokerage linking on SnapTrade's Commercial tier works like this:
-- we register a SnapTrade user, SnapTrade generates a `userSecret` once, and
-- every later read of that person's accounts must present it. This table is
-- where it lives.
--
-- THE SECRET IS THE ONLY COPY. SnapTrade never returns it again:
-- `resetUserSecret` requires the current secret to rotate it, so losing this
-- row means the connection can never be read or removed — the only way out
-- is to delete the SnapTrade user and ask the person to reconnect. Two
-- consequences are built into the code rather than left to care:
--
--   * api/snaptrade.ts registers, then writes here, and if the write fails it
--     deletes the SnapTrade user it just created, so a retry starts clean
--     instead of orphaning a secret nobody holds.
--   * api/delete-account.ts deletes the SnapTrade user BEFORE deleting the
--     auth user, because the cascade below removes this row — deleting in the
--     other order would leave a live brokerage connection at SnapTrade that
--     no one can ever reach.
--
-- NOBODY BUT THE SERVER MAY READ IT, BY TWO INDEPENDENT MECHANISMS. RLS is
-- enabled with NO policies at all, which denies every statement from the
-- `anon` and `authenticated` roles the browser uses. The grants are revoked
-- as well — and that revoke is not decoration: when this migration ran
-- against the shared project the table was already present with RLS on, and
-- both client roles still held full SELECT/INSERT/UPDATE/DELETE on it. RLS
-- was denying them, so nothing was exposed; but a single policy added later
-- by mistake would have opened a per-user brokerage secret to the client.
-- The service-role key bypasses RLS, keeps its grants, and is what
-- api/snaptrade.ts uses — it is server-only and never shipped to the client
-- (see app/.env.example).
--
-- Run once, in the SQL editor, BEFORE deploying the client release that
-- offers brokerage linking: without the table every connect attempt answers
-- an honest configuration error.

create table if not exists public.snaptrade_users (
  -- One SnapTrade user per app user. `on delete cascade` keeps the mapping
  -- from outliving the account, and is why deletion order matters above.
  user_id            uuid primary key references auth.users (id) on delete cascade,
  -- The id we chose for them at SnapTrade. Stored rather than derived, so a
  -- change to how we name users cannot orphan the ones already registered.
  snaptrade_user_id  text not null unique,
  -- SnapTrade's generated secret. See the note above.
  user_secret        text not null,
  -- Named to match the table already deployed; the app reads neither.
  linked_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.snaptrade_users enable row level security;

-- Deliberately no policies. With RLS on and none defined, every statement
-- from a client role is denied; only the service role gets through.
revoke all on public.snaptrade_users from anon, authenticated;
