-- Per-user SnapTrade links: the row that lets one signed-in user read their
-- own brokerage accounts, and nobody else's.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → new query → run).
--
-- WHAT CHANGED, AND WHY THIS TABLE EXISTS AT ALL. The connected-account
-- integration used to be a founder demo: one SnapTrade Personal key that WAS
-- the identity, one account, no users. Under a Commercial client id every end
-- user gets their own SnapTrade user, and every user-scoped request carries
-- that user's `userSecret`. This table is where those secrets live.
--
-- THE SECRET IS NOT STORED IN PLAINTEXT. `user_secret` holds the output of
-- app/api/_lib/secretBox.ts — AES-256-GCM under a key that exists only in the
-- server's environment (SNAPTRADE_SECRET_KEY), never in the database and never
-- in the client bundle. A dump of this table on its own therefore reads no
-- brokerage data: it is ciphertext plus the id it belongs to.

create table public.snaptrade_users (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  -- The id SnapTrade knows this person by. It is the Supabase user id today,
  -- but it is stored rather than re-derived: SnapTrade documents it as
  -- immutable, so a future change to how we mint it must not silently
  -- re-point an existing row at a user SnapTrade has never heard of.
  snaptrade_user_id  text not null unique,
  -- Ciphertext. See secretBox.ts for the envelope format.
  user_secret        text not null,
  -- When this person authorised the link, from the app's own side. Kept
  -- because "the user consented, and when" is a fact about a read-only
  -- connection to someone's brokerage that should be recorded where it can be
  -- shown back to them, not inferred from a row's existence.
  linked_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.snaptrade_users enable row level security;

-- Belt and braces. RLS with no policy already denies both roles every row, so
-- nothing here is exploitable today — but that denial is then the ONLY thing
-- standing in the way, because Supabase grants table-level access to `anon`
-- and `authenticated` on new tables in `public` by default. Taking the grant
-- away too means a policy added here by mistake later cannot hand out the
-- ciphertext on its own. This is the one table holding a credential.
revoke all on public.snaptrade_users from anon, authenticated;

-- DELIBERATELY NO POLICIES. Every other table in this schema grants the owner
-- read access to their own row; this one grants nobody anything. With RLS on
-- and no policy, the anon and authenticated roles are denied outright, so the
-- browser cannot read the ciphertext even for its own user — the only thing
-- that touches this table is the server, through the service-role key, which
-- bypasses RLS and never leaves app/api/.
