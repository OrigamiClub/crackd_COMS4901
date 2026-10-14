-- Run once in Supabase -> SQL Editor.
-- Powers the "Likes on My Cracks" filter: lists other people's likes on
-- the caller's cracks with the liker's first name and photo. profiles
-- stays private; this security definer function only reveals those two
-- fields, and only to the owner of the liked crack.
-- Also tracks when the user last opened that filter, for the "new" dot.

alter table public.profiles
  add column if not exists notifications_seen_at timestamptz;

create or replace function public.my_like_notifications(max_rows int default 50)
returns table (
  crack_id bigint,
  crack_text text,
  crack_img_url text,
  liker_first_name text,
  liker_profpic text,
  liked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id::bigint, c.text::text, c.img_url::text,
         p.first_name::text, p.profpic::text, l.liked_at::timestamptz
  from likes l
  join cracks c on c.id = l.crack_id
  left join profiles p on p.id = l.liker
  where c.creator_id = auth.uid()
    and l.liker <> auth.uid()
  order by l.liked_at desc
  limit least(greatest(max_rows, 0), 100);
$$;

revoke execute on function public.my_like_notifications(int) from public, anon;
grant execute on function public.my_like_notifications(int) to authenticated;

notify pgrst, 'reload schema';
