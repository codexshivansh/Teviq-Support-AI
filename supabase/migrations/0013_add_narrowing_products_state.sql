-- Migration 0013: Add 'narrowing_products' to conversation_states.state
-- (F4 — product-suggestion catalog-search + multi-turn narrowing)
--
-- CHECK constraints can't be altered in place to add an allowed value —
-- Postgres requires dropping and recreating it. The constraint name below
-- follows Postgres's default auto-naming for an inline column CHECK
-- (<table>_<column>_check), same as migrations 0009/0011.
--
-- Rollback: see 0013_rollback_add_narrowing_products_state.sql (only safe
-- if no rows currently have state = 'narrowing_products').

alter table public.conversation_states
  drop constraint if exists conversation_states_state_check;

alter table public.conversation_states
  add constraint conversation_states_state_check
  check (state in ('idle', 'collecting_order_id', 'order_found', 'checking_return', 'checking_cancellation', 'narrowing_products', 'collecting_contact', 'escalated', 'resolved'));
