-- 0007: the SnapTrade user behind each of our users.
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
-- NOBODY BUT THE SERVER MAY READ IT. RLS is enabled with NO policies at all,
-- which under RLS denies every operation to the `anon` and `authenticated`
-- roles the browser uses; the grants are revoked as well, so the table is
-- closed by two independent mechanisms rather than one. The service-role key
-- bypasses RLS and is what api/snaptrade.ts uses — it is server-only and
-- never shipped to the client (see app/.env.example).
--
-- Run after 0006, once, in the SQL editor, BEFORE deploying the client
-- release that offers brokerage linking: without the table every connect
-- attempt answers an honest configuration error.

create table if not exists public.snaptrade_users (
  -- One SnapTrade user per app user. `on delete cascade` keeps the mapping
  -- from outliving the account, and is why deletion order matters above.
  user_id            uuid primary key references auth.users (id) on delete cascade,
  -- The id we chose for them at SnapTrade. Stored rather than derived, so a
  -- change to how we name users cannot orphan the ones already registered.
  snaptrade_user_id  text not null unique,
  -- SnapTrade's generated secret. See the note above.
  user_secret        text not null,
  created_at         timestamptz not null default now()
);

alter table public.snaptrade_users enable row level security;

-- Deliberately no policies. With RLS on and none defined, every statement
-- from a client role is denied; only the service role gets through.
revoke all on public.snaptrade_users from anon, authenticated;
