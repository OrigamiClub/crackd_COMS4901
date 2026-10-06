-- Run once in Supabase -> SQL Editor.
-- Everyone can read public.cracks; logged-in users can create memes under
-- their own uuid and edit/delete only the ones they created. Also adds the
-- storage bucket for meme images.

alter table public.cracks enable row level security;

drop policy if exists "Cracks are publicly readable" on public.cracks;
create policy "Cracks are publicly readable"
on public.cracks for select
using (true);

drop policy if exists "Users can create own cracks" on public.cracks;
create policy "Users can create own cracks"
on public.cracks for insert
to authenticated
with check (creator_id = auth.uid());

drop policy if exists "Users can update own cracks" on public.cracks;
create policy "Users can update own cracks"
on public.cracks for update
to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid());

drop policy if exists "Users can delete own cracks" on public.cracks;
create policy "Users can delete own cracks"
on public.cracks for delete
to authenticated
using (creator_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('cracks', 'cracks', true)
on conflict (id) do nothing;

drop policy if exists "Crack images are publicly accessible" on storage.objects;
create policy "Crack images are publicly accessible"
on storage.objects for select
using (bucket_id = 'cracks');

drop policy if exists "Users can upload their own crack images" on storage.objects;
create policy "Users can upload their own crack images"
on storage.objects for insert
with check (
  bucket_id = 'cracks'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own crack images" on storage.objects;
create policy "Users can update their own crack images"
on storage.objects for update
using (
  bucket_id = 'cracks'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own crack images" on storage.objects;
create policy "Users can delete their own crack images"
on storage.objects for delete
using (
  bucket_id = 'cracks'
  and (storage.foldername(name))[1] = auth.uid()::text
);
