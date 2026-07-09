-- Rollback for 0011_add_cancellation_state.sql
-- Only safe if no rows currently have state = 'checking_cancellation'.

alter table public.conversation_states
  drop constraint if exists conversation_states_state_check;

alter table public.conversation_states
  add constraint conversation_states_state_check
  check (state in ('idle', 'collecting_order_id', 'order_found', 'checking_return', 'collecting_contact', 'escalated', 'resolved'));
