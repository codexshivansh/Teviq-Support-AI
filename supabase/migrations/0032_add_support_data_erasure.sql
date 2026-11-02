-- Operator-only maintenance operation. Stop intake and ALL backend instances
-- before invocation; restart them afterward to clear every in-memory cache.
-- This erases Teviq support records, NOT provider data, backups or Shopify orders.
create or replace function public.erase_customer_support_records(
  p_brand_id text, p_customer_id text, p_maintenance_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_table text; v_count bigint; v_counts jsonb := '{}'::jsonb;
begin
  if p_maintenance_confirmed is distinct from true or length(trim(coalesce(p_brand_id,'')))=0
    or length(trim(coalesce(p_customer_id,'')))=0 then raise exception 'verified scope and maintenance required'; end if;
  -- Match worker lock before taking table locks. Never race an active worker.
  perform pg_advisory_xact_lock(628041);
  lock table public.channel_message_inbox in share row exclusive mode;
  if exists(select 1 from public.channel_message_inbox where brand_id=p_brand_id
    and customer_id=p_customer_id and status in ('processing','sending')) then
    raise exception 'reconcile active or uncertain processing before erasure';
  end if;
  delete from public.channel_message_reviews where event_id in
    (select id from public.channel_message_inbox where brand_id=p_brand_id and customer_id=p_customer_id);
  get diagnostics v_count=row_count;
  v_counts:=v_counts || jsonb_build_object('channel_message_reviews',v_count);
  -- Retain provider event IDs as restricted deduplication tombstones. A repeated
  -- known webhook cannot recreate erased content. No raw customer ID remains.
  update public.channel_message_inbox set customer_id='erased:'||id::text,
    message='[erased]',reply=null,provider_message_id=null,error_code='support_data_erased',
    status='resolved',worker_id=null,lease_until=null,updated_at=now()
    where brand_id=p_brand_id and customer_id=p_customer_id;
  get diagnostics v_count=row_count;
  v_counts:=v_counts || jsonb_build_object('channel_message_inbox',v_count);
  foreach v_table in array array['conversation_handoffs','conversation_handoff_actions','chat_logs','conversation_states','leads','return_requests'] loop
    -- These are established schema prerequisites; fail atomically if missing.
    execute format('delete from public.%I where brand_id=$1 and customer_id=$2',v_table)
      using p_brand_id,p_customer_id;
    get diagnostics v_count=row_count;
    v_counts:=v_counts || jsonb_build_object(v_table,v_count);
  end loop;
  return v_counts;
end $$;
revoke all on function public.erase_customer_support_records(text,text,boolean) from public,anon,authenticated;
grant execute on function public.erase_customer_support_records(text,text,boolean) to service_role;
