-- Run once in Supabase -> SQL Editor, after public.likes exists.
-- Links likes to cracks (so the home page can count them), allows one like
-- per user per meme, and lets anyone read likes while logged-in users can
-- only add or remove their own.
-- Assumes likes.crack_id has the same type as cracks.id and likes.liker is
-- a uuid.

alter table public.likes alter column liked_at set default now();
alter table public.likes alter column liker set default auth.uid();

alter table public.likes drop constraint if exists likes_crack_id_fkey;
alter table public.likes
  add constraint likes_crack_id_fkey
  foreign key (crack_id) references public.cracks (id) on delete cascade;

alter table public.likes drop constraint if exists likes_liker_fkey;
alter table public.likes
  add constraint likes_liker_fkey
  foreign key (liker) references auth.users (id) on delete cascade;

alter table public.likes drop constraint if exists likes_crack_id_liker_key;
alter table public.likes
  add constraint likes_crack_id_liker_key unique (crack_id, liker);

alter table public.likes enable row level security;

drop policy if exists "Likes are publicly readable" on public.likes;
create policy "Likes are publicly readable"
on public.likes for select
using (true);

drop policy if exists "Users can like as themselves" on public.likes;
create policy "Users can like as themselves"
on public.likes for insert
to authenticated
with check (liker = auth.uid());

drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Users can remove their own likes"
on public.likes for delete
to authenticated
using (liker = auth.uid());

-- Make the API pick up the new foreign key right away.
notify pgrst, 'reload schema';
