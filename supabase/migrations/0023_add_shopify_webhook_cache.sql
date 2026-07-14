alter table public.shopify_connections
  add column if not exists webhooks_status text not null default 'not_registered'
    check (webhooks_status in ('not_registered', 'ready', 'partial', 'error')),
  add column if not exists webhooks_last_registered_at timestamptz,
  add column if not exists webhooks_last_error text;

create table if not exists public.shopify_products (
  brand_id text not null references public.brands(id) on delete cascade,
  shopify_product_id text not null,
  legacy_resource_id text,
  shop_domain text not null,
  title text not null default '',
  handle text not null default '',
  category text not null default 'Uncategorized',
  tags jsonb not null default '[]'::jsonb,
  status text,
  price text not null default '0.00',
  currency text not null default 'INR',
  available boolean not null default false,
  image_url text,
  image_alt text,
  shopify_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (brand_id, shopify_product_id)
);

create index if not exists shopify_products_brand_updated_idx
  on public.shopify_products(brand_id, shopify_updated_at desc);

create index if not exists shopify_products_brand_legacy_idx
  on public.shopify_products(brand_id, legacy_resource_id);

alter table public.shopify_products enable row level security;

create table if not exists public.shopify_orders (
  brand_id text not null references public.brands(id) on delete cascade,
  shopify_order_id text not null,
  legacy_resource_id text,
  shop_domain text not null,
  order_name text not null default '',
  fulfillment_status text,
  financial_status text,
  cancelled_at timestamptz,
  processed_at timestamptz,
  shopify_updated_at timestamptz,
  line_items jsonb not null default '[]'::jsonb,
  fulfillments jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (brand_id, shopify_order_id)
);

create index if not exists shopify_orders_brand_name_idx
  on public.shopify_orders(brand_id, order_name);

create index if not exists shopify_orders_brand_legacy_idx
  on public.shopify_orders(brand_id, legacy_resource_id);

create index if not exists shopify_orders_brand_updated_idx
  on public.shopify_orders(brand_id, shopify_updated_at desc);

alter table public.shopify_orders enable row level security;

create table if not exists public.shopify_webhook_events (
  webhook_id text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  shop_domain text not null,
  topic text not null,
  api_version text,
  triggered_at timestamptz,
  resource_id text,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists shopify_webhook_events_brand_received_idx
  on public.shopify_webhook_events(brand_id, received_at desc);

create index if not exists shopify_webhook_events_status_idx
  on public.shopify_webhook_events(status, received_at);

alter table public.shopify_webhook_events enable row level security;

revoke all on public.shopify_products from anon, authenticated;
revoke all on public.shopify_orders from anon, authenticated;
revoke all on public.shopify_webhook_events from anon, authenticated;

grant select, insert, update, delete on public.shopify_products to service_role;
grant select, insert, update, delete on public.shopify_orders to service_role;
grant select, insert, update, delete on public.shopify_webhook_events to service_role;
