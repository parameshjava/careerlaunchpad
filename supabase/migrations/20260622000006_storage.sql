-- ============================================================================
-- 20260622000006_storage.sql
-- Supabase Storage buckets (spec §7): resumes (private), avatars (public-read).
-- Files live under a "<user_id>/..." prefix so a student writes only their own.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ---- resumes: private. Owner of the file (student) read/write own prefix. -----
-- Employers fetch resumes via a server route that issues a signed URL after a
-- permission check, so no broad employer SELECT policy is needed here.
create policy "resumes - student manages own"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- avatars: public read; student writes only own prefix. -------------------
create policy "avatars - public read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

create policy "avatars - student writes own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars - student updates own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars - student deletes own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
