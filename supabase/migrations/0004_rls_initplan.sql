-- Performance-only rewrite of every RLS policy: wrap auth.uid() in a scalar
-- subselect, per Supabase's own auth_rls_initplan advisor lint.
--
-- WHY: auth.uid() is STABLE, not IMMUTABLE, so the planner re-evaluates it
-- for every candidate row instead of hoisting it into an InitPlan evaluated
-- once per query. On profiles/user_state that is invisible (every access is
-- a single-row PK lookup), but storage.objects is shared across all buckets
-- and users, and a listing there pays the call per row scanned — a cost that
-- grows with every avatar uploaded. `(select auth.uid())` forces one
-- evaluation per query.
--
-- BEHAVIOR IS UNCHANGED: the predicate value is identical for every row of a
-- given query — auth.uid() is constant within a statement — so the set of
-- visible/writable rows before and after this migration is exactly the same.
-- Each policy below is a verbatim copy of its predecessor (0001_auth.sql,
-- 0003_profile_overrides.sql) with only that wrapping added.

-- ── public.profiles / public.user_state (from 0001_auth.sql) ────────────

drop policy if exists "own profile read"   on public.profiles;
create policy "own profile read"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update
  using ((select auth.uid()) = id);

drop policy if exists "own state read"     on public.user_state;
create policy "own state read"
  on public.user_state for select
  using ((select auth.uid()) = user_id);

drop policy if exists "own state insert"   on public.user_state;
create policy "own state insert"
  on public.user_state for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "own state update"   on public.user_state;
create policy "own state update"
  on public.user_state for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── storage.objects avatar policies (from 0003_profile_overrides.sql) ───
-- "avatars are publicly readable" contains no auth.uid() and is untouched.

drop policy if exists "users write their own avatar" on storage.objects;
create policy "users write their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users update their own avatar" on storage.objects;
create policy "users update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users delete their own avatar" on storage.objects;
create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
