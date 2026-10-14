-- Run once in Supabase -> SQL Editor.
-- The caption generator now offers three captions per request. Each
-- caption_requests row keeps the options shown, the direction typed, and
-- which option (0-2) ended up on a posted crack, so humor-profile analysis
-- can later look at what users pick and what they pass over. A row whose
-- chosen_index stays null means none of its options were used.

alter table public.caption_requests
  add column if not exists direction text,
  add column if not exists options jsonb,
  add column if not exists chosen_index smallint
    check (chosen_index between 0 and 2),
  add column if not exists crack_id bigint
    references public.cracks (id) on delete set null;

drop policy if exists "Users can update their own caption requests" on public.caption_requests;
create policy "Users can update their own caption requests"
on public.caption_requests for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

notify pgrst, 'reload schema';
