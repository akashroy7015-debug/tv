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


-- =====================================================================
-- Usage metering: tamper-proof monthly conversion counting (server-authoritative).
-- =====================================================================
create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period  text not null,            -- 'YYYY-MM' (UTC)
  used    integer not null default 0,
  primary key (user_id, period)
);

alter table public.usage enable row level security;

drop policy if exists "read own usage" on public.usage;
create policy "read own usage"
  on public.usage for select
  using (auth.uid() = user_id);

-- Atomically count up to n conversions for the CURRENT user: monthly quota first
-- (free=5, Pro=300, Team=unlimited), then pay-as-you-go credits. Returns how many
-- were granted. Because it runs server-side as the caller (auth.uid()), clearing
-- localStorage / editing the page can't grant extra conversions.
create or replace function public.consume_conversions(n integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  st text; pl text; lim int;
  per text := to_char(now() at time zone 'utc', 'YYYY-MM');
  cur int; take_q int; granted int := 0;
  bal_before int; bal_after int;
begin
  if uid is null then return jsonb_build_object('allowed', 0, 'reason', 'login'); end if;
  if n is null or n < 1 then n := 1; end if;

  select status, plan into st, pl from public.subscriptions where user_id = uid;

  -- Team / unlimited: record usage, always allow.
  if st in ('active','on_trial') and coalesce(pl,'') = 'Team' then
    insert into public.usage(user_id, period, used) values (uid, per, n)
      on conflict (user_id, period) do update set used = public.usage.used + n;
    return jsonb_build_object('allowed', n, 'reason', 'unlimited', 'limit', -1);
  end if;

  if st in ('active','on_trial') and coalesce(pl,'') = 'Pro' then lim := 300; else lim := 5; end if;

  -- Monthly quota first.
  select used into cur from public.usage where user_id = uid and period = per;
  cur := coalesce(cur, 0);
  take_q := greatest(0, least(n, lim - cur));
  if take_q > 0 then
    insert into public.usage(user_id, period, used) values (uid, per, take_q)
      on conflict (user_id, period) do update set used = public.usage.used + take_q;
    granted := take_q;
  end if;

  -- Remainder from credits (atomic delta = before - after).
  if granted < n then
    update public.wallets w
       set credits = greatest(0, w.credits - (n - granted)), updated_at = now()
      from (select credits from public.wallets where user_id = uid) old
     where w.user_id = uid
   returning old.credits, w.credits into bal_before, bal_after;
    if bal_before is not null then granted := granted + (bal_before - bal_after); end if;
  end if;

  return jsonb_build_object(
    'allowed', granted,
    'reason', case when granted >= n then 'ok' when granted > 0 then 'partial' else 'limit' end,
    'used', cur + take_q,
    'limit', lim,
    'credits', coalesce(bal_after, (select credits from public.wallets where user_id = uid), 0)
  );
end;
$$;

revoke all on function public.consume_conversions(integer) from public, anon;
grant execute on function public.consume_conversions(integer) to authenticated;
