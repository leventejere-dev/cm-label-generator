-- ===========================================================================
-- CM Label Generator — private storage for photographed supplier labels
-- ===========================================================================
-- The bucket is PRIVATE. The app never builds public URLs; it asks Supabase for
-- a short-lived signed URL when it needs to display a photo.
--
-- Retention: the MVP keeps the source photograph so extraction quality can be
-- inspected. All image handling is isolated behind LabelRepository
-- (src/lib/data/*), so changing the retention policy later means changing
-- uploadSourceImage() and adding a scheduled cleanup — nothing else.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'label-sources',
  'label-sources',
  false,
  8388608, -- 8 MB; the client targets ~2 MB after optimisation
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object-level policies. Same MVP trade-off as public.labels above: without
-- authentication the anon role may upload and read within this one bucket.
-- Switch `to anon, authenticated` to `to authenticated` once Auth is enabled.

drop policy if exists label_sources_insert on storage.objects;
drop policy if exists label_sources_select on storage.objects;
drop policy if exists label_sources_update on storage.objects;

create policy label_sources_insert
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'label-sources');

create policy label_sources_select
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'label-sources');

create policy label_sources_update
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'label-sources')
  with check (bucket_id = 'label-sources');

-- No DELETE policy: photographs cannot be removed through the client API.
