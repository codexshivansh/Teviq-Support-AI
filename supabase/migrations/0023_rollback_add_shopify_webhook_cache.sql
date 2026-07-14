drop table if exists public.shopify_webhook_events;
drop table if exists public.shopify_orders;
drop table if exists public.shopify_products;

alter table public.shopify_connections
  drop column if exists webhooks_last_error,
  drop column if exists webhooks_last_registered_at,
  drop column if exists webhooks_status;
