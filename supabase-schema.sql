-- FileMorph: subscriptions table + row-level security.
-- Run this in Supabase → SQL Editor → New query → Run.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'Pro',
  status text not null default 'inactive',          -- 'active' | 'canceled' | 'inactive'
  provider text not null default 'lemonsqueezy',
  subscription_id text,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Logged-in users can read ONLY their own subscription row.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for normal users:
-- the Lemon Squeezy webhook writes using the service-role key, which bypasses RLS.


-- =====================================================================
-- Wallets: pay-as-you-go credit balances.
-- =====================================================================
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

-- Logged-in users can read ONLY their own wallet row.
drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet"
  on public.wallets for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for normal users. Balances change ONLY via
-- the SECURITY DEFINER functions below (spend_credit) and the webhook (service role).

-- Atomically spend ONE credit for the CURRENT logged-in user.
-- Returns the new balance, or -1 if they have none. Runs as definer so it can
-- write past RLS, but it ONLY ever touches the caller's own row (auth.uid()).
create or replace function public.spend_credit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bal integer;
begin
  if uid is null then
    return -1;
  end if;
  update public.wallets
     set credits = credits - 1, updated_at = now()
   where user_id = uid and credits > 0
   returning credits into bal;
  if bal is null then
    return -1;  -- no wallet row, or zero credits
  end if;
  return bal;
end;
$$;

revoke all on function public.spend_credit() from public, anon;
grant execute on function public.spend_credit() to authenticated;

-- Grant credits to a user. Called ONLY by the Lemon Squeezy webhook using the
-- service-role key. MUST NOT be callable by normal users, or they could grant
-- themselves free credits — so execute is revoked from anon/authenticated.
create or replace function public.add_credits(uid uuid, n integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  bal integer;
begin
  if n is null or n <= 0 then
    return -1;
  end if;
  insert into public.wallets (user_id, credits)
       values (uid, n)
  on conflict (user_id)
  do update set credits = public.wallets.credits + excluded.credits, updated_at = now()
  returning credits into bal;
  return bal;
end;
$$;

-- Lock add_credits down: only the service role (webhook) may call it.
revoke all on function public.add_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_credits(uuid, integer) to service_role;
