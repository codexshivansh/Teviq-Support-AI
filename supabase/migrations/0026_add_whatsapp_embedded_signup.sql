-- WhatsApp Cloud API connection records used by the Meta Embedded Signup flow.
-- Existing manually provisioned whatsapp_connections rows are preserved; the
-- legacy plaintext token column remains readable for backwards compatibility.
create table if not exists public.whatsapp_connections (
  phone_number_id text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  waba_id text,
  display_phone_number text,
  verified_name text,
  business_mode text not null default 'd2c',
  access_token text,
  access_token_encrypted text,
  is_active boolean not null default true,
  installed_by_clerk_user_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_connections
  add column if not exists waba_id text,
  add column if not exists display_phone_number text,
  add column if not exists verified_name text,
  add column if not exists access_token_encrypted text,
  add column if not exists installed_by_clerk_user_id text,
  add column if not exists connected_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- New connections store only an encrypted token. Old manual connections may
-- still use access_token until the workspace reconnects through Meta.
alter table public.whatsapp_connections alter column access_token drop not null;

create index if not exists whatsapp_connections_brand_active_idx
  on public.whatsapp_connections (brand_id, is_active);

alter table public.whatsapp_connections enable row level security;
