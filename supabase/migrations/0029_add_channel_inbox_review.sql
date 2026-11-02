-- Apply after 0028. Operator resolution never pretends a reply was sent.
alter table public.channel_message_inbox drop constraint if exists channel_message_inbox_status_check;
alter table public.channel_message_inbox add constraint channel_message_inbox_status_check
  check (status in ('pending', 'processing', 'ready', 'sending', 'sent', 'needs_review', 'resolved'));

create table if not exists public.channel_message_reviews (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.channel_message_inbox(id) on delete cascade,
  brand_id text not null references public.brands(id) on delete cascade,
  actor_id text not null,
  action text not null check (action in ('resolve', 'retry_reply')),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.channel_message_reviews enable row level security;
revoke all on public.channel_message_reviews from public, anon, authenticated;
grant select on public.channel_message_reviews to service_role;

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
  if p_action='retry_reply' and (e.reply is null or e.event_at <= now()-interval '23 hours') then
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

create or replace function public.claim_channel_message(p_worker_id uuid)
returns setof public.channel_message_inbox
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_worker_id is null then raise exception 'worker required'; end if;
  perform pg_advisory_xact_lock(628041);
  update public.channel_message_inbox
    set status='needs_review', error_code='interrupted_' || status, updated_at=now()
    where status in ('processing','sending') and lease_until < now();
  select e.id into v_id from public.channel_message_inbox e
    where (e.status='pending' or (e.status='ready' and e.lease_until < now()))
      and not exists (select 1 from public.channel_message_inbox older
        where older.channel=e.channel and older.account_id=e.account_id
          and older.customer_id=e.customer_id and older.id < e.id
          and older.status not in ('sent','resolved'))
    order by e.id limit 1 for update;
  if v_id is null then return; end if;
  return query update public.channel_message_inbox
    set status=case when reply is null then 'processing' else 'ready' end,
      worker_id=p_worker_id, lease_until=now()+interval '5 minutes', updated_at=now()
    where id=v_id returning *;
end $$;
revoke all on function public.claim_channel_message(uuid) from public, anon, authenticated;
grant execute on function public.claim_channel_message(uuid) to service_role;
