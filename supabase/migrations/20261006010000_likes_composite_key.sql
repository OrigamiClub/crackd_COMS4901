-- Run once in Supabase -> SQL Editor.
-- likes.crack_id was unique on its own (likely the primary key), which
-- allowed only one like per meme in total and made the API treat
-- cracks -> likes as one-to-one. Replace it with a primary key on
-- (crack_id, liker): one like per user per meme.

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.likes'::regclass
      and c.contype in ('p', 'u')
      and c.conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.likes'::regclass and attname = 'crack_id')
      ]::smallint[]
  loop
    execute format('alter table public.likes drop constraint %I', con.conname);
  end loop;

  -- A standalone unique index on crack_id has the same effect.
  for con in
    select i.indexrelid::regclass as idx
    from pg_index i
    where i.indrelid = 'public.likes'::regclass
      and i.indisunique
      and i.indkey::smallint[] = array[
        (select attnum from pg_attribute
         where attrelid = 'public.likes'::regclass and attname = 'crack_id')
      ]::smallint[]
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
  loop
    execute format('drop index %s', con.idx);
  end loop;
end;
$$;

-- Also drop any primary key left over on other columns.
do $$
declare
  pk text;
begin
  select conname into pk
  from pg_constraint
  where conrelid = 'public.likes'::regclass and contype = 'p';

  if pk is not null and pk <> 'likes_pkey_crack_liker' then
    execute format('alter table public.likes drop constraint %I', pk);
  end if;
end;
$$;

-- The composite primary key replaces the unique constraint added earlier.
alter table public.likes drop constraint if exists likes_crack_id_liker_key;
alter table public.likes drop constraint if exists likes_pkey_crack_liker;
alter table public.likes
  add constraint likes_pkey_crack_liker primary key (crack_id, liker);

notify pgrst, 'reload schema';
