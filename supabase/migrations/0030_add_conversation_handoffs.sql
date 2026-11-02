create table if not exists public.conversation_handoffs (
  brand_id text not null references public.brands(id) on delete cascade,
  channel text not null check (channel in ('widget','whatsapp','instagram')),
  customer_id text not null,
  paused boolean not null default false,
  owner_id text,
  updated_at timestamptz not null default now(),
  primary key (brand_id,channel,customer_id)
);
create table if not exists public.conversation_handoff_actions (
  id bigint generated always as identity primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  channel text not null,
  customer_id text not null,
  actor_id text not null,
  paused boolean not null,
  created_at timestamptz not null default now()
);
alter table public.conversation_handoffs enable row level security;
alter table public.conversation_handoff_actions enable row level security;
revoke all on public.conversation_handoffs, public.conversation_handoff_actions from public, anon, authenticated;
grant select on public.conversation_handoffs, public.conversation_handoff_actions to service_role;

create or replace function public.set_conversation_handoff(
  p_brand_id text,p_channel text,p_customer_id text,p_actor_id text,p_paused boolean
) returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(p_channel,'') not in ('widget','whatsapp','instagram') or p_paused is null
    or length(trim(coalesce(p_customer_id,'')))=0 or length(trim(coalesce(p_actor_id,'')))=0 then
    raise exception 'invalid handoff';
  end if;
  insert into public.conversation_handoffs(brand_id,channel,customer_id,paused,owner_id)
    values(p_brand_id,p_channel,p_customer_id,p_paused,case when p_paused then p_actor_id else null end)
    on conflict (brand_id,channel,customer_id) do update set
      paused=excluded.paused,owner_id=excluded.owner_id,updated_at=now();
  insert into public.conversation_handoff_actions(brand_id,channel,customer_id,actor_id,paused)
    values(p_brand_id,p_channel,p_customer_id,p_actor_id,p_paused);
end $$;
revoke all on function public.set_conversation_handoff(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_conversation_handoff(text,text,text,text,boolean) to service_role;
