-- Run in Supabase SQL Editor before deploying the Instagram webhook adapter.
-- Access tokens are encrypted by the backend before they are written here.
create table if not exists public.instagram_connections (
  brand_id text primary key references public.brands(id) on delete cascade,
  instagram_user_id text not null unique,
  username text,
  access_token_encrypted text not null,
  token_issued_at timestamptz,
  token_expires_at timestamptz,
  last_token_refresh_at timestamptz,
  last_token_refresh_error text,
  scopes text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'disconnected', 'error')),
  installed_by_clerk_user_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_connections_status_idx
  on public.instagram_connections(status);

alter table public.instagram_connections enable row level security;

-- OAuth state is stored as a hash and consumed once by the callback.
create table if not exists public.instagram_oauth_states (
  state_hash text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  clerk_user_id text not null,
  return_path text not null default '/settings',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists instagram_oauth_states_expires_at_idx
  on public.instagram_oauth_states(expires_at);

alter table public.instagram_oauth_states enable row level security;

-- Meta may retry webhooks. A unique message ID prevents duplicate AI replies.
create table if not exists public.instagram_webhook_events (
  message_id text primary key,
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed')),
  received_at timestamptz not null default now()
);

create index if not exists instagram_webhook_events_received_at_idx
  on public.instagram_webhook_events(received_at);

alter table public.instagram_webhook_events enable row level security;
