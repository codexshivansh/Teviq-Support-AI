-- Migration 0011: Add 'checking_cancellation' to conversation_states.state
-- (F2 Phase 1)
--
-- CHECK constraints can't be altered in place to add an allowed value —
-- Postgres requires dropping and recreating it. The constraint name below
-- follows Postgres's default auto-naming for an inline column CHECK
-- (<table>_<column>_check), which is what migration 0009's `create table`
-- would have produced since no explicit constraint name was given there.
--
-- Rollback: see 0011_rollback_add_cancellation_state.sql (only safe if no
-- rows currently have state = 'checking_cancellation').

alter table public.conversation_states
  drop constraint if exists conversation_states_state_check;

alter table public.conversation_states
  add constraint conversation_states_state_check
  check (state in ('idle', 'collecting_order_id', 'order_found', 'checking_return', 'checking_cancellation', 'collecting_contact', 'escalated', 'resolved'));
