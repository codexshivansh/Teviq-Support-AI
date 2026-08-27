-- MIGRATION: Run in Supabase SQL Editor before deploying this branch.
--
-- Migration 0016: Add channel to chat_logs (multi-channel Conversations
-- portal — website widget vs WhatsApp vs, later, Instagram).
--
-- Add channel column to chat_logs for multi-channel conversation tracking.
-- Existing rows (all website widget) are backfilled to 'widget'.
ALTER TABLE chat_logs
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'widget';

-- Index for the new filter queries the conversations service will use.
CREATE INDEX IF NOT EXISTS idx_chat_logs_channel
  ON chat_logs (brand_id, channel, created_at DESC);
