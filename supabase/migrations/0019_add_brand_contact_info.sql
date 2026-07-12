-- Migration 0019: Add contact_phone, contact_email, business_hours to brands
--
-- Additive only. The dashboard Settings page ("Support phone" / "Support
-- email" / "Business hours") has never had a real column to save into —
-- today it only edits local React state, so nothing typed there survives
-- a reload and the AI never sees it. These columns give brand.service.js
-- somewhere real to persist those values, and let ai.service.js quote
-- the brand's actual contact details instead of staying silent on them.
--
-- Nullable. Null/empty means "not configured yet" — brand.service.js and
-- ai.service.js should treat that as "no contact details to share",
-- not as licence to invent a phone/email/hours.
--
-- Rollback: see 0019_rollback_add_brand_contact_info.sql

alter table public.brands
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists business_hours text;
