create table if not exists public.brands (
  id text primary key,
  brand_name text not null,
  brand_category text not null,
  support_language text not null,
  escalation_whatsapp text,
  shopify_store_url text,
  shopify_token_encrypted text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists brands_is_active_idx on public.brands (is_active);
