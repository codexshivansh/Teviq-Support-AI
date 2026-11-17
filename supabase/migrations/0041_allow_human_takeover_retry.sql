-- A message held before AI generation is safe to retry after an operator
-- resumes the conversation. Ambiguous delivery failures still require a
-- persisted reply, preserving the existing duplicate-send protection.
create or replace function public.review_channel_message(
  p_id bigint, p_brand_id text, p_actor_id text, p_action text, p_reason text
) returns boolean language plpgsql security definer set search_path = public as $$
declare e public.channel_message_inbox%rowtype;
begin
  if length(trim(coalesce(p_actor_id,''))) = 0 or length(trim(coalesce(p_reason,''))) < 10
     or length(p_reason) > 1000 or coalesce(p_action,'') not in ('resolve','retry_reply') then
    raise exception 'invalid review';
  end if;
  select * into e from public.channel_message_inbox where id=p_id and brand_id=p_brand_id for update;
  if not found or e.status <> 'needs_review' then return false; end if;
  if p_action='retry_reply' and (
       e.event_at <= now()-interval '23 hours'
       or (e.reply is null and coalesce(e.error_code,'') <> 'human_takeover')
     ) then
    return false;
  end if;
  insert into public.channel_message_reviews(event_id,brand_id,actor_id,action,reason)
    values(p_id,p_brand_id,p_actor_id,p_action,trim(p_reason));
  update public.channel_message_inbox set
    status=case when p_action='resolve' then 'resolved' else 'ready' end,
    worker_id=null, lease_until=now()-interval '1 second', updated_at=now(), error_code=null
    where id=p_id;
  return true;
end $$;
revoke all on function public.review_channel_message(bigint,text,text,text,text) from public, anon, authenticated;
grant execute on function public.review_channel_message(bigint,text,text,text,text) to service_role;
