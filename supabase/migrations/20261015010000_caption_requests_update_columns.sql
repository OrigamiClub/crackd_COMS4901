-- Run once in Supabase -> SQL Editor.
-- Users could write any column of their own caption_requests rows, so a
-- direct API call could move created_at into the past (dodging the caption
-- rate limit) or make up the options they were shown. Now they can only
-- log a request (user_id, direction) and, after posting, record which
-- option they picked and on which crack. The options themselves are saved
-- by the server's service-role key.

revoke insert, update on public.caption_requests from authenticated, anon;
grant insert (user_id, direction) on public.caption_requests to authenticated;
grant update (chosen_index, crack_id) on public.caption_requests to authenticated;

notify pgrst, 'reload schema';
