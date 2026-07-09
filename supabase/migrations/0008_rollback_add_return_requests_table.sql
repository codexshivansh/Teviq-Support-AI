-- Rollback for 0008_add_return_requests_table.sql
-- Safe any time before app code depends on this table.

drop index if exists public.return_requests_order_id_idx;
drop index if exists public.return_requests_brand_id_idx;
drop table if exists public.return_requests;
