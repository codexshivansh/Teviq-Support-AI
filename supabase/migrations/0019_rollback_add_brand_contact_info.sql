-- Rollback for 0019_add_brand_contact_info.sql

alter table public.brands
  drop column if exists contact_phone,
  drop column if exists contact_email,
  drop column if exists business_hours;
