-- Run once in Supabase -> SQL Editor.
-- 1. Storage only accepts JPG/PNG/GIF/WebP images up to 5MB in both buckets,
--    so HTML/SVG can't be hosted there even by requests that skip the app.
-- 2. Users can delete their own avatar files, so replaced photos get cleaned up.
-- 3. A log of caption requests, used to rate-limit Gemini calls per user.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    file_size_limit = 5242880
where id in ('cracks', 'avatars');

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create table if not exists public.caption_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists caption_requests_user_time_idx
  on public.caption_requests (user_id, created_at desc);

alter table public.caption_requests enable row level security;

drop policy if exists "Users can see their own caption requests" on public.caption_requests;
create policy "Users can see their own caption requests"
on public.caption_requests for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can log their own caption requests" on public.caption_requests;
create policy "Users can log their own caption requests"
on public.caption_requests for insert
to authenticated
with check (user_id = auth.uid());

-- Make the API pick up the new table right away.
notify pgrst, 'reload schema';
