create table if not exists public.leads (
  id text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  customer_id text not null,
  channel text not null default 'widget',
  intent text not null check (intent in ('human_support', 'business_enquiry')),
  name_encrypted jsonb,
  contact_type text not null check (contact_type in ('email', 'phone', 'email_and_phone')),
  contact_encrypted jsonb not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_brand_created_at_idx
  on public.leads (brand_id, created_at desc);

create index if not exists leads_brand_status_idx
  on public.leads (brand_id, status);

alter table public.leads enable row level security;

revoke all on table public.leads from anon, authenticated;
grant select, insert, update, delete on table public.leads to service_role;

comment on table public.leads is
  'Server-owned, brand-scoped support and business enquiry leads. Contact fields are application encrypted.';
