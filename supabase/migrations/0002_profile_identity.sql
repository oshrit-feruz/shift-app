-- The identity Google actually gives us, stored alongside the profile.
--
-- Scope note: an OAuth sign-in with `scope=email profile` returns the user's
-- email, display name and picture — and nothing else. There is no phone,
-- birthday, address or contact list here, because the app never asks for
-- those scopes. These three columns are the whole of it.
--
-- Google's key names are not stable across providers (and Supabase copies the
-- raw claims through), so each value is read with a fallback: `full_name` or
-- `name`, `avatar_url` or `picture`. Apple, when it is enabled later, sends a
-- name only on the *first* authorisation and never a picture — the coalesce
-- chain degrades to null rather than breaking, and the UI already treats a
-- missing name as "no name" rather than showing a placeholder.

alter table public.profiles
  add column if not exists email      text,
  add column if not exists full_name  text,
  add column if not exists avatar_url text,
  -- Stored because it is used, not because it was available: the app picks
  -- the sign-in language from it, and anything sent to the user server-side
  -- later (an alert email) needs the same answer without a live session.
  add column if not exists locale     text;

-- Signup trigger, now capturing the identity as well as the provider.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, provider, email, full_name, avatar_url, locale)
  values (
    new.id,
    new.raw_app_meta_data->>'provider',
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    new.raw_user_meta_data->>'locale'
  );
  insert into public.user_state (user_id) values (new.id);
  return new;
end;
$$;

-- Backfill anyone who signed up before this migration: the trigger only fires
-- on new users, so without this the accounts that already exist would keep
-- three empty columns forever.
update public.profiles p
set email      = u.email,
    full_name  = coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
    avatar_url = coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
    locale     = u.raw_user_meta_data->>'locale'
from auth.users u
where u.id = p.id;
