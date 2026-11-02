-- Add provider receipt metadata to the durable channel inbox.
-- Provider IDs are scoped to the channel/account pair; no webhook payloads
-- or credentials are retained.
alter table public.channel_message_inbox
  add column if not exists provider_status text,
  add column if not exists provider_status_at timestamptz,
  add column if not exists provider_failure_category text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists last_status_update_at timestamptz;

alter table public.channel_message_inbox drop constraint if exists channel_message_inbox_provider_status_check;
alter table public.channel_message_inbox add constraint channel_message_inbox_provider_status_check
  check (provider_status is null or provider_status in ('accepted','sent','delivered','read','seen','failed','uncertain'));

create index if not exists channel_message_inbox_provider_message_idx
  on public.channel_message_inbox(channel, account_id, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.provider_message_statuses (
  channel text not null check (channel in ('whatsapp','instagram')),
  account_id text not null,
  provider_message_id text not null,
  brand_id text not null references public.brands(id) on delete cascade,
  customer_id text not null,
  provider_status text not null check (provider_status in ('accepted','sent','delivered','read','seen','failed','uncertain')),
  provider_status_at timestamptz not null,
  provider_failure_category text,
  delivered_at timestamptz,
  read_at timestamptz,
  last_status_update_at timestamptz not null default now(),
  primary key (channel,account_id,provider_message_id)
);
alter table public.provider_message_statuses enable row level security;
revoke all on public.provider_message_statuses from public, anon, authenticated;
grant select, insert, update, delete on public.provider_message_statuses to service_role;

create or replace function public.record_provider_message_accepted(
  p_channel text,p_account_id text,p_message_id text,p_brand_id text,p_customer_id text,p_status_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_channel not in ('whatsapp','instagram') or nullif(trim(p_account_id),'') is null
    or nullif(trim(p_message_id),'') is null or nullif(trim(p_customer_id),'') is null or p_status_at is null then raise exception 'invalid provider message'; end if;
  insert into public.provider_message_statuses(channel,account_id,provider_message_id,brand_id,customer_id,provider_status,provider_status_at)
    values(p_channel,p_account_id,p_message_id,p_brand_id,p_customer_id,'accepted',p_status_at)
  on conflict(channel,account_id,provider_message_id) do nothing;
  return true;
end $$;

create or replace function public.apply_provider_message_status(
  p_channel text, p_account_id text, p_message_id text, p_status text,
  p_status_at timestamptz, p_failure_category text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_channel not in ('whatsapp','instagram') or nullif(trim(p_account_id),'') is null
     or nullif(trim(p_message_id),'') is null or p_status not in ('sent','delivered','read','failed','seen','uncertain')
     or p_status_at is null then
    raise exception 'invalid provider status';
  end if;

  -- Idempotent and monotonic. Equal timestamps allow a terminal state to
  -- replace a less informative state, but stale lifecycle events cannot.
  update public.channel_message_inbox set
    provider_status = case
      when provider_status = 'read' then 'read'
      when provider_status = 'seen' then 'seen'
      when provider_status = 'failed' and p_status not in ('read','seen') then 'failed'
      when p_status in ('read','seen') then p_status
      when p_status_at < coalesce(provider_status_at, '-infinity'::timestamptz) then provider_status
      when p_status = 'delivered' and coalesce(provider_status,'') not in ('read','seen') then 'delivered'
      when p_status = 'failed' and coalesce(provider_status,'') not in ('read','seen') then 'failed'
      when p_status = 'sent' and provider_status is null then 'sent'
      else provider_status end,
    provider_status_at = greatest(coalesce(provider_status_at, p_status_at), p_status_at),
    delivered_at = case when p_status in ('delivered','read','seen')
      then coalesce(delivered_at, p_status_at) else delivered_at end,
    read_at = case when p_status in ('read','seen') then coalesce(read_at, p_status_at) else read_at end,
    provider_failure_category = case when p_status = 'failed' then left(nullif(trim(p_failure_category),''),80)
      else provider_failure_category end,
    last_status_update_at = case when p_status_at > coalesce(provider_status_at,'-infinity'::timestamptz)
      or (p_status in ('read','seen') and coalesce(provider_status,'') not in ('read','seen'))
      then now() else last_status_update_at end,
    updated_at = case when p_status_at > coalesce(provider_status_at,'-infinity'::timestamptz)
      or (p_status in ('read','seen') and coalesce(provider_status,'') not in ('read','seen'))
      then now() else updated_at end
  where channel = p_channel and account_id = p_account_id and provider_message_id = p_message_id;
  get diagnostics v_count = row_count;
  update public.provider_message_statuses set
    provider_status = case
      when provider_status in ('read','seen') then provider_status
      when provider_status = 'failed' and p_status not in ('read','seen') then 'failed'
      when p_status in ('read','seen') then p_status
      when p_status_at < provider_status_at then provider_status
      when p_status = 'delivered' then 'delivered'
      when p_status = 'failed' then 'failed'
      when p_status = 'sent' and provider_status = 'accepted' then 'sent'
      else provider_status end,
    provider_status_at = greatest(provider_status_at,p_status_at),
    delivered_at = case when p_status in ('delivered','read','seen') then coalesce(delivered_at,p_status_at) else delivered_at end,
    read_at = case when p_status in ('read','seen') then coalesce(read_at,p_status_at) else read_at end,
    provider_failure_category = case when p_status='failed' then left(nullif(trim(p_failure_category),''),80) else provider_failure_category end,
    last_status_update_at = case when p_status_at > provider_status_at
      or (p_status in ('read','seen') and provider_status not in ('read','seen'))
      then now() else last_status_update_at end
  where channel=p_channel and account_id=p_account_id and provider_message_id=p_message_id;
  return v_count;
end $$;

revoke all on function public.apply_provider_message_status(text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.apply_provider_message_status(text,text,text,text,timestamptz,text) to service_role;
revoke all on function public.record_provider_message_accepted(text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_provider_message_accepted(text,text,text,text,text,timestamptz) to service_role;
