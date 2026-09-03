-- 0006: any portfolio can be deleted by its owner — the Sandbox included.
--
-- 0005 kept the Sandbox with `and not is_default` on the delete policy, on
-- the reasoning that every user must always have somewhere to record a
-- trade. That turned out to be the wrong invariant: the Sandbox is the
-- user's own content like any other portfolio, and someone who has finished
-- with it should be able to remove it — the app asks for confirmation
-- first, and creating a new portfolio is one tap.
--
-- What stays: the signup trigger still gives every new account a Sandbox,
-- and the partial unique index still allows at most one default portfolio
-- per user. Only the delete guard goes. The client's self-heal that used to
-- re-create a missing Sandbox is removed in the same release, because it
-- would otherwise put a deleted one straight back.
--
-- Run after 0005_ledger.sql, once, in the SQL editor. Deploy the client
-- release that offers the Sandbox delete only after this has been run: with
-- the old policy still in place a delete affects no rows and reports no
-- error, so the Sandbox would vanish from the screen and return on the
-- next read.

drop policy if exists "own portfolios delete" on public.portfolios;

create policy "own portfolios delete" on public.portfolios
  for delete using ((select auth.uid()) = user_id);
