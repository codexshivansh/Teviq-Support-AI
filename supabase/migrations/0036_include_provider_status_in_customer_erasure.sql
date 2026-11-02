-- Provider message IDs are pseudonymous but linkable customer data. Remove
-- them when scoped support-record erasure deletes the matching transcript.
create or replace function public.erase_provider_status_after_chat_log_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from public.provider_message_statuses
    where brand_id=old.brand_id and customer_id=old.customer_id
      and channel=coalesce(old.channel,'widget');
  return old;
end $$;
revoke all on function public.erase_provider_status_after_chat_log_delete() from public,anon,authenticated;
drop trigger if exists chat_logs_provider_status_erasure on public.chat_logs;
create trigger chat_logs_provider_status_erasure after delete on public.chat_logs
  for each row execute function public.erase_provider_status_after_chat_log_delete();
