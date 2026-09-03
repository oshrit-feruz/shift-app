-- Two corrections to 0006, both found in review of the alert engine.
-- Run in the Supabase SQL editor after 0006 and 0007.

-- ── 1. A reader may mark a notification read. Nothing else. ─────────────
--
-- The "own notifications update" policy in 0006 decides WHICH ROW a client
-- may update; it says nothing about which COLUMNS. Supabase grants the
-- `authenticated` role table-wide UPDATE by default, so a signed-in client
-- could rewrite the title, the ticker, the kind or the dedupe key of its own
-- notification — engine-authored facts, and the dedupe key is what stops the
-- same event being recorded twice.
--
-- The row policy stays as it is; this narrows the grant underneath it to the
-- one column marking a row read is allowed to touch. A client attempting any
-- other column now gets a permission error rather than a silent rewrite.
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- ── 2. A device that changes hands can still register for push. ─────────
--
-- `push_subscriptions.endpoint` is unique: one browser profile, one row.
-- When a second account signs in on the same browser, the endpoint the push
-- service hands it is the SAME one, still owned by the first account. The
-- client's upsert then hits a row it may not update (the update policy wants
-- user_id = auth.uid()) and it may not delete, so registering push simply
-- fails, with no way out short of clearing site data.
--
-- Ownership moves server-side instead, in one statement, as the caller:
-- the endpoint is a capability only the device holding it can present, and
-- presenting it is what transfers the row. That is the same trust the push
-- service itself places in the endpoint. A client still cannot read, write
-- or delete another account's row directly — the policies from 0006 are
-- untouched.
create or replace function public.claim_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_lang       text,
  p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'claim_push_subscription: not signed in';
  end if;
  if p_lang is null or p_lang not in ('en', 'he') then
    raise exception 'claim_push_subscription: lang must be en or he';
  end if;
  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'claim_push_subscription: endpoint and keys are required';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, lang, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, p_lang, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        lang       = excluded.lang,
        user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.claim_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.claim_push_subscription(text, text, text, text, text) to authenticated;
