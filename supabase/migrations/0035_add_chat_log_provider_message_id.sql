-- Link outbound transcript rows to provider receipts without retaining payloads.
alter table public.chat_logs add column if not exists provider_message_id text;
create index if not exists chat_logs_provider_message_idx
  on public.chat_logs(channel, provider_message_id) where provider_message_id is not null;

create or replace function public.link_provider_message_to_latest_chat_log(
  p_brand_id text,p_customer_id text,p_channel text,p_reply text,p_message_id text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_channel not in ('whatsapp','instagram') or nullif(trim(p_brand_id),'') is null
    or nullif(trim(p_customer_id),'') is null or nullif(trim(p_reply),'') is null
    or nullif(trim(p_message_id),'') is null then raise exception 'invalid transcript link'; end if;
  select id into v_id from public.chat_logs where brand_id=p_brand_id and customer_id=p_customer_id
    and channel=p_channel and reply=p_reply and provider_message_id is null
    order by created_at desc,id desc limit 1 for update;
  if v_id is null then return false; end if;
  update public.chat_logs set provider_message_id=p_message_id where id=v_id;
  return true;
end $$;
revoke all on function public.link_provider_message_to_latest_chat_log(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.link_provider_message_to_latest_chat_log(text,text,text,text,text) to service_role;
