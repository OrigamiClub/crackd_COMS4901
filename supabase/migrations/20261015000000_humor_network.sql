-- Run once in Supabase -> SQL Editor.
-- Powers the /humor page:
-- 1. crack_traits: Gemini's humor-style and topic tags for each crack.
-- 2. humor_profiles: a cached Gemini-written summary of each user's taste.
-- 3. humor_network(): users with likes (first name + photo only) and the
--    pairs of users who liked the same cracks.
-- Both tables are written only by the server's service-role key, so users
-- can read them but not fake them.

create table if not exists public.crack_traits (
  crack_id bigint primary key references public.cracks (id) on delete cascade,
  styles text[] not null default '{}',
  topics text[] not null default '{}',
  tagged_at timestamptz not null default now()
);

alter table public.crack_traits enable row level security;

drop policy if exists "Crack traits are publicly readable" on public.crack_traits;
create policy "Crack traits are publicly readable"
on public.crack_traits for select
using (true);

create table if not exists public.humor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  summary text,
  likes_at_summary int not null default 0,
  picks_at_summary int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.humor_profiles enable row level security;

drop policy if exists "Users can read their own humor profile" on public.humor_profiles;
create policy "Users can read their own humor profile"
on public.humor_profiles for select
to authenticated
using (user_id = auth.uid());

create or replace function public.humor_network()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with node_likes as (
    select liker, count(*) as likes
    from likes
    group by liker
  ),
  -- Each user's most common style among the cracks they liked.
  top_styles as (
    select distinct on (l.liker) l.liker, s.style
    from likes l
    join crack_traits t on t.crack_id = l.crack_id
    cross join lateral unnest(t.styles) as s (style)
    group by l.liker, s.style
    order by l.liker, count(*) desc, s.style
  ),
  pairs as (
    select a.liker as a, b.liker as b, count(*) as shared,
           (array_agg(a.crack_id order by a.liked_at desc))[1:3] as cracks
    from likes a
    join likes b on b.crack_id = a.crack_id and a.liker < b.liker
    group by a.liker, b.liker
  )
  select json_build_object(
    'nodes', coalesce((
      select json_agg(json_build_object(
        'id', n.liker,
        'name', p.first_name,
        'profpic', p.profpic,
        'likes', n.likes,
        'topStyle', ts.style
      ))
      from node_likes n
      left join profiles p on p.id = n.liker
      left join top_styles ts on ts.liker = n.liker
    ), '[]'::json),
    'edges', coalesce((
      select json_agg(json_build_object(
        'a', a, 'b', b, 'shared', shared, 'cracks', cracks
      ))
      from pairs
    ), '[]'::json)
  );
$$;

revoke execute on function public.humor_network() from public, anon;
grant execute on function public.humor_network() to authenticated;

notify pgrst, 'reload schema';
