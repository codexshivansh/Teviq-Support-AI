-- Staging first. Configure every intended workspace before production rollout:
-- a missing access record now blocks provider calls rather than granting access.
alter table public.ai_trial_limits add column if not exists access_mode text;
update public.ai_trial_limits set access_mode=case when enabled then 'trial' else 'disabled' end where access_mode is null;
alter table public.ai_trial_limits alter column access_mode set default 'disabled';
alter table public.ai_trial_limits alter column access_mode set not null;
alter table public.ai_trial_limits drop constraint if exists ai_trial_limits_access_mode_check;
alter table public.ai_trial_limits add constraint ai_trial_limits_access_mode_check check (access_mode in ('trial','paid','disabled'));

create or replace function public.reserve_ai_usage(
  p_id uuid,p_brand_id text,p_channel text,p_model text,p_reserved_tokens integer,p_global_max_tokens integer
) returns text language plpgsql security definer set search_path=public as $$
declare
  v_limit public.ai_trial_limits%rowtype;
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_calls integer; v_tokens bigint;
begin
  if p_id is null or p_reserved_tokens is null or p_global_max_tokens is null
    or p_reserved_tokens <= 0 or p_global_max_tokens <= 0
    or coalesce(p_channel,'') not in ('widget','whatsapp','instagram') then
    raise exception 'Invalid usage reservation';
  end if;
  perform pg_advisory_xact_lock(71224701);
  select * into v_limit from public.ai_trial_limits where brand_id=p_brand_id;
  if not found then return 'access_unconfigured'; end if;
  if not v_limit.enabled or v_limit.access_mode='disabled' then return 'access_disabled'; end if;
  if v_limit.starts_at is null or v_limit.ends_at is null
    or now()<v_limit.starts_at or now()>=v_limit.ends_at then
    return case when v_limit.access_mode='trial' then 'trial_inactive' else 'paid_access_inactive' end;
  end if;
  select count(*),coalesce(sum(coalesce(total_tokens,reserved_tokens)),0)
    into v_calls,v_tokens from public.ai_usage_events where brand_id=p_brand_id and usage_day=v_day;
  if v_calls>=v_limit.max_calls_per_day or v_tokens+p_reserved_tokens>v_limit.max_tokens_per_day then return 'brand_limit'; end if;
  select coalesce(sum(coalesce(total_tokens,reserved_tokens)),0) into v_tokens
    from public.ai_usage_events where usage_day=v_day;
  if v_tokens+p_reserved_tokens>p_global_max_tokens then return 'global_limit'; end if;
  insert into public.ai_usage_events(id,brand_id,usage_day,channel,model,reserved_tokens)
    values(p_id,p_brand_id,v_day,p_channel,p_model,p_reserved_tokens);
  return 'allowed';
end $$;
revoke all on function public.reserve_ai_usage(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_usage(uuid,text,text,text,integer,integer) to service_role;
