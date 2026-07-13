create table if not exists public.shopify_connections (
  brand_id text primary key references public.brands(id) on delete cascade,
  shop_domain text not null unique,
  shop_name text,
  primary_domain_url text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'disconnected', 'error')),
  installed_by_clerk_user_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  product_count integer not null default 0,
  order_count integer not null default 0,
  categories jsonb not null default '[]'::jsonb
);

create index if not exists shopify_connections_status_idx
  on public.shopify_connections(status);

alter table public.shopify_connections enable row level security;

create table if not exists public.shopify_oauth_states (
  state_hash text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  clerk_user_id text not null,
  shop_domain text not null,
  return_path text not null default '/shopify',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shopify_oauth_states_expires_at_idx
  on public.shopify_oauth_states(expires_at);

alter table public.shopify_oauth_states enable row level security;

-- Preserve any Admin API credentials saved by the previous onboarding flow.
-- New installations use OAuth and write directly to shopify_connections.
insert into public.shopify_connections (
  brand_id,
  shop_domain,
  shop_name,
  access_token_encrypted,
  status,
  connected_at,
  updated_at
)
select
  id,
  lower(trim(shopify_store_url)),
  lower(trim(shopify_store_url)),
  shopify_token_encrypted,
  'active',
  coalesce(created_at, now()),
  now()
from public.brands
where shopify_store_url is not null
  and shopify_token_encrypted is not null
  and lower(trim(shopify_store_url)) ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
on conflict do nothing;
