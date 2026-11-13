-- Server-only purchase snapshots. No live products seeded before commercial approval.
create table public.billing_orders (
 id uuid primary key,
 brand_id text not null references public.brands(id),
 owner_user_id text not null check(length(owner_user_id)>0),
 provider_order_id text unique not null,
 plan_version text not null,
 amount_paise integer not null check(amount_paise>0),
 currency text not null check(currency='INR'),
 duration_days integer not null check(duration_days between 1 and 366),
 max_calls_per_day integer not null check(max_calls_per_day between 1 and 1000),
 max_tokens_per_day integer not null check(max_tokens_per_day between 1 and 100000),
 features jsonb not null check(jsonb_typeof(features)='array'),
 status text not null default 'pending' check(status in ('pending','activated','cancelled')),
 provider_payment_id text unique,
 activated_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.billing_orders enable row level security;
revoke all on public.billing_orders from anon,authenticated;
grant select,insert,update on public.billing_orders to service_role;

-- Caller MUST fetch and verify captured payment with provider before invoking.
create function public.activate_billing_order(p_order_id uuid,p_payment_id text,p_amount integer,p_currency text)
returns text language plpgsql security definer set search_path=public as $$
declare o public.billing_orders%rowtype; current_access public.ai_trial_limits%rowtype; begin
 if p_payment_id is null or length(p_payment_id)=0 then raise exception 'Invalid payment'; end if;
 select * into o from public.billing_orders where id=p_order_id for update;
 if not found then raise exception 'Unknown order'; end if;
 if p_amount is distinct from o.amount_paise or p_currency is distinct from o.currency then raise exception 'Payment mismatch'; end if;
 if o.status='activated' then
   if o.provider_payment_id=p_payment_id then return 'already_activated'; end if;
   raise exception 'Order already paid';
 end if;
 if o.status<>'pending' then raise exception 'Order unavailable'; end if;
 -- Serialize all purchases for the workspace, including first activation.
 perform 1 from public.brands where id=o.brand_id for update;
 select * into current_access from public.ai_trial_limits where brand_id=o.brand_id for update;
 if o.brand_id='teviq' or current_access.access_mode='internal' then raise exception 'Internal workspace'; end if;
 -- Upgrades/early renewals need an explicit commercial policy; preserve paid access.
 if current_access.access_mode='paid' and current_access.ends_at>now() then raise exception 'Paid period still active'; end if;
 insert into public.ai_trial_limits(brand_id,enabled,access_mode,no_cap,starts_at,ends_at,max_calls_per_day,max_tokens_per_day)
 values(o.brand_id,true,'paid',false,now(),now()+make_interval(days=>o.duration_days),o.max_calls_per_day,o.max_tokens_per_day)
 on conflict(brand_id) do update set enabled=true,access_mode='paid',no_cap=false,starts_at=excluded.starts_at,ends_at=excluded.ends_at,max_calls_per_day=excluded.max_calls_per_day,max_tokens_per_day=excluded.max_tokens_per_day,updated_at=now();
 update public.billing_orders set status='activated',provider_payment_id=p_payment_id,activated_at=now() where id=o.id;
 return 'activated';
end $$;
revoke all on function public.activate_billing_order(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.activate_billing_order(uuid,text,integer,text) to service_role;

create unique index billing_one_pending_order_per_brand on public.billing_orders(brand_id) where status='pending';
