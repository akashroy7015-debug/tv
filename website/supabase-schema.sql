-- FileMorph: subscriptions table + row-level security.
-- Run this in Supabase → SQL Editor → New query → Run.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'Pro',
  status text not null default 'inactive',          -- 'active' | 'canceled' | 'inactive'
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Logged-in users can read ONLY their own subscription row.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for normal users:
-- the Stripe webhook writes using the service-role key, which bypasses RLS.
