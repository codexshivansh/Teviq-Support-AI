-- Apply before enabling AI_TRIAL_METERING_ENABLED. No trial is active by default.
create table if not exists public.ai_trial_limits (
  brand_id text primary key references public.brands(id) on delete cascade,
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  max_calls_per_day integer not null default 10 check (max_calls_per_day > 0),
  max_tokens_per_day integer not null default 30000 check (max_tokens_per_day > 0),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.ai_usage_events (
  id uuid primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  usage_day date not null,
  channel text not null,
  model text not null,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'unknown')),
  reserved_tokens integer not null check (reserved_tokens > 0),
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_usage_events_brand_day_idx on public.ai_usage_events (brand_id, usage_day);
create index if not exists ai_usage_events_day_idx on public.ai_usage_events (usage_day);

alter table public.ai_trial_limits enable row level security;
alter table public.ai_usage_events enable row level security;

-- This RPC is called only with the backend service-role key. Serialize all
-- reservations so concurrent channel messages cannot overrun the shared cap.
create or replace function public.reserve_ai_usage(
  p_id uuid, p_brand_id text, p_channel text, p_model text,
  p_reserved_tokens integer, p_global_max_tokens integer
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_limit public.ai_trial_limits%rowtype;
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_calls integer;
  v_tokens bigint;
begin
  if p_reserved_tokens <= 0 or p_global_max_tokens <= 0 then
    raise exception 'Invalid usage reservation';
  end if;
  perform pg_advisory_xact_lock(71224701);
  select * into v_limit from public.ai_trial_limits where brand_id = p_brand_id;
  if found and v_limit.enabled then
    if v_limit.starts_at is null or v_limit.ends_at is null
      or now() < v_limit.starts_at or now() >= v_limit.ends_at then
      return 'trial_inactive';
    end if;
    select count(*), coalesce(sum(coalesce(total_tokens, reserved_tokens)), 0)
      into v_calls, v_tokens from public.ai_usage_events
      where brand_id = p_brand_id and usage_day = v_day;
    if v_calls >= v_limit.max_calls_per_day
      or v_tokens + p_reserved_tokens > v_limit.max_tokens_per_day then
      return 'brand_limit';
    end if;
  end if;
  select coalesce(sum(coalesce(total_tokens, reserved_tokens)), 0)
    into v_tokens from public.ai_usage_events where usage_day = v_day;
  if v_tokens + p_reserved_tokens > p_global_max_tokens then
    return 'global_limit';
  end if;
  insert into public.ai_usage_events
    (id, brand_id, usage_day, channel, model, reserved_tokens)
  values (p_id, p_brand_id, v_day, p_channel, p_model, p_reserved_tokens);
  return 'allowed';
end $$;

create or replace function public.finish_ai_usage(
  p_id uuid, p_prompt_tokens integer, p_completion_tokens integer, p_total_tokens integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ai_usage_events set
    prompt_tokens = case when p_total_tokens is null then null else greatest(0, p_prompt_tokens) end,
    completion_tokens = case when p_total_tokens is null then null else greatest(0, p_completion_tokens) end,
    total_tokens = case when p_total_tokens is null then reserved_tokens else greatest(0, p_total_tokens) end,
    status = case when p_total_tokens is null then 'unknown' else 'completed' end,
    completed_at = now()
  where id = p_id and status = 'reserved';
end $$;

revoke all on function public.reserve_ai_usage(uuid,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.finish_ai_usage(uuid,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid,text,text,text,integer,integer) to service_role;
grant execute on function public.finish_ai_usage(uuid,integer,integer,integer) to service_role;
