create table public.billing_subscriptions (
 id uuid primary key, brand_id text unique not null references public.brands(id),
 owner_user_id text unique not null, plan_version text not null,
 provider_plan_id text not null, provider_subscription_id text unique,
 amount_paise integer not null check(amount_paise>0), currency text not null check(currency='INR'),
 features jsonb not null check(jsonb_typeof(features)='array'),
 max_calls_per_day integer not null check(max_calls_per_day between 1 and 1000),
 max_tokens_per_day integer not null check(max_tokens_per_day between 1 and 100000),
 trial_started_at timestamptz not null default date_trunc('second',now()),
 trial_ends_at timestamptz not null default date_trunc('second',now())+interval '72 hours',
 consent_version text not null, consent_at timestamptz not null default now(),
 provider_status text not null default 'creating', cancel_requested_at timestamptz,
 cancelled_at timestamptz, review_required boolean not null default false, paid_until timestamptz, last_checked_at timestamptz,
 check(trial_ends_at=trial_started_at+interval '72 hours'), check(brand_id<>'teviq')
);
create table public.billing_subscription_payments (
 payment_id text primary key, invoice_id text unique not null,
 subscription_id uuid not null references public.billing_subscriptions(id),
 period_start timestamptz not null, period_end timestamptz not null,
 amount_paise integer not null, created_at timestamptz not null default now(),
 check(period_end>period_start)
);
alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscription_payments enable row level security;
revoke all on public.billing_subscriptions,public.billing_subscription_payments from public,anon,authenticated;
grant select,insert,update on public.billing_subscriptions to service_role;
grant select on public.billing_subscription_payments to service_role;

create function public.start_subscription_trial(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare s public.billing_subscriptions%rowtype; begin
 select * into strict s from public.billing_subscriptions where id=p_id for update;
 perform 1 from public.brands where id=s.brand_id for update;
 if exists(select 1 from public.ai_trial_limits where brand_id=s.brand_id and access_mode='internal') then raise exception 'Existing internal access'; end if;
 if s.paid_until is not null then return; end if;
 if exists(select 1 from public.ai_trial_limits where brand_id=s.brand_id and access_mode='paid' and ends_at>now()) then raise exception 'Existing paid access'; end if;
 insert into public.ai_trial_limits(brand_id,enabled,access_mode,no_cap,starts_at,ends_at,max_calls_per_day,max_tokens_per_day)
 values(s.brand_id,true,'trial',false,s.trial_started_at,s.trial_ends_at,s.max_calls_per_day,s.max_tokens_per_day)
 on conflict(brand_id) do update set enabled=true,access_mode='trial',no_cap=false,starts_at=excluded.starts_at,ends_at=excluded.ends_at,max_calls_per_day=excluded.max_calls_per_day,max_tokens_per_day=excluded.max_tokens_per_day;
end $$;

-- Called only with independently verified captured payment and matching paid invoice.
create function public.apply_subscription_payment(p_id uuid,p_payment text,p_invoice text,p_amount integer,p_currency text,p_start timestamptz,p_end timestamptz)
returns text language plpgsql security definer set search_path=public as $$
declare s public.billing_subscriptions%rowtype; previous public.billing_subscription_payments%rowtype; begin
 select * into strict s from public.billing_subscriptions where id=p_id for update;
 if s.review_required then raise exception 'Billing review required'; end if;
 if p_amount is distinct from s.amount_paise or p_currency is distinct from s.currency or p_start is null or p_end is null or p_start<s.trial_ends_at or p_end<=p_start or coalesce(p_payment,'')='' or coalesce(p_invoice,'')='' then raise exception 'Invalid invoice'; end if;
 select * into previous from public.billing_subscription_payments where payment_id=p_payment;
 if found then
 if previous.subscription_id<>p_id or previous.invoice_id<>p_invoice then raise exception 'Payment reused'; end if;
 return 'already_applied'; end if;
 insert into public.billing_subscription_payments(payment_id,invoice_id,subscription_id,period_start,period_end,amount_paise) values(p_payment,p_invoice,p_id,p_start,p_end,p_amount);
 update public.billing_subscriptions set paid_until=greatest(paid_until,p_end) where id=p_id;
 -- An old event must not shorten a newer paid period or reactivate expired access.
 insert into public.ai_trial_limits(brand_id,enabled,access_mode,no_cap,starts_at,ends_at,max_calls_per_day,max_tokens_per_day)
 values(s.brand_id,true,'paid',false,p_start,p_end,s.max_calls_per_day,s.max_tokens_per_day)
 on conflict(brand_id) do update set enabled=true,access_mode='paid',no_cap=false,starts_at=least(ai_trial_limits.starts_at,excluded.starts_at),ends_at=greatest(ai_trial_limits.ends_at,excluded.ends_at),max_calls_per_day=excluded.max_calls_per_day,max_tokens_per_day=excluded.max_tokens_per_day;
 return 'paid';
end $$;
revoke all on function public.start_subscription_trial(uuid), public.apply_subscription_payment(uuid,text,text,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.start_subscription_trial(uuid), public.apply_subscription_payment(uuid,text,text,integer,text,timestamptz,timestamptz) to service_role;

create function public.billing_channel_allowed(p_brand text,p_channel text) returns boolean language plpgsql security definer set search_path=public as $$
declare f jsonb; begin
 if exists(select 1 from public.billing_subscriptions where brand_id=p_brand and review_required) then return false; end if;
 select features into f from public.billing_subscriptions where brand_id=p_brand;
 if found then return (f ? p_channel) and exists(select 1 from public.ai_trial_limits where brand_id=p_brand and enabled and access_mode in ('trial','paid') and starts_at<=now() and ends_at>now()); end if;
 select features into f from public.billing_orders where brand_id=p_brand and status='activated' order by activated_at desc,id desc limit 1;
 if found then return f ? p_channel; end if;
 return true; -- Preserve existing manual/trial access.
end $$;
revoke all on function public.billing_channel_allowed(text,text) from public,anon,authenticated;
grant execute on function public.billing_channel_allowed(text,text) to service_role;
create or replace function public.reserve_ai_usage(p_id uuid,p_brand_id text,p_channel text,p_model text,p_reserved_tokens integer,p_global_max_tokens integer)
returns text language plpgsql security definer set search_path=public as $$ begin
 if not public.billing_channel_allowed(p_brand_id,p_channel) then return 'channel_not_in_plan'; end if;
 return public.reserve_ai_usage_before_billing(p_id,p_brand_id,p_channel,p_model,p_reserved_tokens,p_global_max_tokens);
end $$;
