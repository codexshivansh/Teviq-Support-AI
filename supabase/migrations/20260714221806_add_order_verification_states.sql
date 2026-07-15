-- Adds server-owned states for checkout-contact verification before any
-- live Shopify order details can be returned to a public widget session.
alter table public.conversation_states
  drop constraint if exists conversation_states_state_check;

alter table public.conversation_states
  add constraint conversation_states_state_check
  check (state in (
    'idle',
    'collecting_order_id',
    'collecting_order_contact',
    'order_found',
    'order_verified',
    'order_verification_locked',
    'checking_return',
    'checking_cancellation',
    'narrowing_products',
    'collecting_contact',
    'escalated',
    'resolved'
  ));
