-- Apply before deploying the durable WhatsApp/Instagram webhook handlers.
-- Service-only inbox: never store channel access tokens in event payloads.
create table if not exists public.channel_message_inbox (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('whatsapp', 'instagram')),
  account_id text not null check (length(account_id) > 0),
  message_id text not null check (length(message_id) > 0),
  brand_id text not null references public.brands(id) on delete cascade,
  customer_id text not null check (length(customer_id) > 0),
  message text not null check (length(message) > 0),
  event_at timestamptz not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'sending', 'sent', 'needs_review')),
  worker_id uuid,
  lease_until timestamptz,
  reply text,
  provider_message_id text,
  error_code text,
  updated_at timestamptz not null default now(),
  unique (channel, account_id, message_id)
);
create index if not exists channel_message_inbox_pending_idx
  on public.channel_message_inbox(status, id);
create index if not exists channel_message_inbox_customer_idx
  on public.channel_message_inbox(channel, account_id, customer_id, id);
alter table public.channel_message_inbox enable row level security;
revoke all on public.channel_message_inbox from public, anon, authenticated;
grant select, insert, update, delete on public.channel_message_inbox to service_role;
grant usage, select on sequence public.channel_message_inbox_id_seq to service_role;

-- Legacy Instagram IDs have no payload/account ownership to migrate reliably.
-- Quarantine their redelivery instead of generating another answer after rollout.
create or replace function public.guard_legacy_instagram_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.channel = 'instagram' and exists (
    select 1 from public.instagram_webhook_events where message_id = new.message_id
  ) then
    new.status := 'needs_review';
    new.error_code := 'legacy_instagram_event';
  end if;
  return new;
end $$;
revoke all on function public.guard_legacy_instagram_event() from public, anon, authenticated;
drop trigger if exists channel_inbox_legacy_guard on public.channel_message_inbox;
create trigger channel_inbox_legacy_guard before insert on public.channel_message_inbox
  for each row execute function public.guard_legacy_instagram_event();

-- All instances use this transaction-level lock. Claiming is short; processing
-- is outside the transaction. No two instances can own the same event or run
-- two events for the same channel/customer concurrently.
create or replace function public.claim_channel_message(p_worker_id uuid)
returns setof public.channel_message_inbox
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  if p_worker_id is null then raise exception 'worker required'; end if;
  perform pg_advisory_xact_lock(628041);
  -- An interrupted AI/action/send may already have had side effects. Never
  -- replay automatically; preserve it for operator reconciliation.
  update public.channel_message_inbox
  set status = 'needs_review', error_code = 'interrupted_' || status, updated_at = now()
  where status in ('processing', 'sending') and lease_until < now();

  select e.id into v_id from public.channel_message_inbox e
  where (e.status = 'pending' or (e.status = 'ready' and e.lease_until < now()))
    and not exists (
      select 1 from public.channel_message_inbox older
      where older.channel = e.channel and older.account_id = e.account_id
        and older.customer_id = e.customer_id and older.id < e.id
        and older.status <> 'sent'
    )
  order by e.id limit 1 for update;
  if v_id is null then return; end if;
  return query update public.channel_message_inbox
    set status = case when reply is null then 'processing' else 'ready' end,
        worker_id = p_worker_id, lease_until = now() + interval '5 minutes', updated_at = now()
    where id = v_id returning *;
end $$;

create or replace function public.transition_channel_message(
  p_id bigint, p_worker_id uuid, p_action text,
  p_reply text default null, p_provider_message_id text default null,
  p_error_code text default null
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_rows integer;
begin
  update public.channel_message_inbox set
    status = case p_action when 'ready' then 'ready' when 'sending' then 'sending'
                          when 'sent' then 'sent' else 'needs_review' end,
    reply = case when p_action = 'ready' then p_reply else reply end,
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    error_code = p_error_code,
    lease_until = now() + interval '5 minutes', updated_at = now()
  where id = p_id and worker_id = p_worker_id and lease_until > now()
    and ((p_action = 'ready' and status = 'processing' and length(p_reply) > 0)
      or (p_action = 'sending' and status = 'ready')
      or (p_action = 'sent' and status = 'sending')
      or (p_action = 'needs_review' and status in ('processing', 'ready', 'sending')));
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

revoke all on function public.claim_channel_message(uuid) from public, anon, authenticated;
revoke all on function public.transition_channel_message(bigint, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_channel_message(uuid) to service_role;
grant execute on function public.transition_channel_message(bigint, uuid, text, text, text, text) to service_role;
