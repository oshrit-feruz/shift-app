-- Lets a user override what the provider said about them.
--
-- The override lives in its own column rather than replacing the provider's
-- value, for a concrete reason: the client re-writes the provider's identity
-- into this row on every sign-in (people rename themselves in Google, and the
-- signup trigger fires only once). If an edit overwrote `full_name`, the very
-- next sign-in would silently undo it. Keeping the two apart also makes
-- "reset to my Google name" a deletion rather than a re-fetch.
--
-- Display rule, applied in the client: display_name ?? full_name.

alter table public.profiles
  add column if not exists display_name text,
  -- Storage object path, e.g. '<uid>/avatar-1712345678.webp'. A path rather
  -- than a URL: the public URL is derived from it and would otherwise be
  -- stored stale if the project or bucket ever moves.
  add column if not exists avatar_path  text;

-- Guard rails on the free-text field. A display name is not a document, and
-- an unbounded column reachable from the client is an invitation. The trim
-- check rejects a name that is only whitespace, which would render as a blank
-- line where a name should be.
alter table public.profiles
  drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or (char_length(display_name) between 1 and 60 and btrim(display_name) <> ''));

-- ── Avatar storage ──────────────────────────────────────────────────────
-- Public-read bucket: an avatar is shown to the person viewing the app and
-- the provider's own picture URL is public too, so signed URLs would add
-- ceremony without adding privacy. Writes are owner-only (policies below).
--
-- Size and MIME limits are set on the bucket, not just in the UI, because a
-- client-side check is a convenience, not a control — anything holding a
-- session token can call the storage API directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Each user may only write inside a folder named after their own uid, so one
-- account can never overwrite or delete another's picture.
drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users write their own avatar" on storage.objects;
create policy "users write their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update their own avatar" on storage.objects;
create policy "users update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete their own avatar" on storage.objects;
create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
