-- FileMorph: credit wallet for pay-as-you-go. Run in Supabase → SQL Editor.

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;

drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets for select using (auth.uid() = user_id);

-- Atomically spend 1 credit for the logged-in user. Returns the new balance, or -1 if none left.
create or replace function public.spend_credit()
returns integer language plpgsql security definer set search_path = public as $$
declare bal integer;
begin
  update public.wallets set credits = credits - 1, updated_at = now()
    where user_id = auth.uid() and credits > 0
    returning credits into bal;
  if bal is null then return -1; end if;
  return bal;
end; $$;
grant execute on function public.spend_credit() to authenticated;

-- Add credits to a user (called by the payment webhook via the service role).
create or replace function public.add_credits(uid uuid, n integer)
returns integer language plpgsql security definer set search_path = public as $$
declare bal integer;
begin
  insert into public.wallets(user_id, credits) values (uid, n)
    on conflict (user_id) do update set credits = public.wallets.credits + n, updated_at = now()
    returning credits into bal;
  return bal;
end; $$;
grant execute on function public.add_credits(uuid, integer) to service_role;
