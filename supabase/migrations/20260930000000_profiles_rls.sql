-- Run once in Supabase -> SQL Editor.
-- Lets a logged-in user read and update their own profiles row.
-- (The insert on signup already works via the security definer trigger,
-- which bypasses RLS.)

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);
