-- Glint Pro groundwork: who has a plan, and how much hosted AI each account
-- has used this month. Run this once in the Supabase SQL Editor (it is safe to
-- run again). The browser can only read a person's own rows; every write goes
-- through the server with the service role key.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'pro',
  status text not null default 'active',          -- active | trialing | past_due | canceled
  current_period_end timestamptz,                  -- paid through this date
  provider text,                                   -- filled in by the billing webhook later
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,                             -- first day of the month, UTC
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.ai_usage enable row level security;
drop policy if exists "read own ai usage" on public.ai_usage;
create policy "read own ai usage" on public.ai_usage
  for select using (auth.uid() = user_id);

-- One atomic step: work out the plan, then spend (cost > 0), refund (cost < 0)
-- or just read (cost = 0) this month's credits. A spend that would pass the
-- limit changes nothing and comes back with allowed = false.
create or replace function public.glint_use_credits(
  p_user uuid, p_cost integer, p_free_limit integer, p_pro_limit integer
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', timezone('utc', now()))::date;
  v_plan text := 'free';
  v_limit integer;
  v_used integer;
  v_allowed boolean := true;
begin
  if exists (
    select 1 from subscriptions s
    where s.user_id = p_user and s.plan = 'pro'
      and (s.status in ('active', 'trialing')
           or (s.current_period_end is not null and s.current_period_end > now()))
  ) then
    v_plan := 'pro';
  end if;
  v_limit := case when v_plan = 'pro' then p_pro_limit else p_free_limit end;

  insert into ai_usage (user_id, month) values (p_user, v_month)
    on conflict (user_id, month) do nothing;

  if p_cost > 0 then
    update ai_usage set used = used + p_cost, updated_at = now()
      where user_id = p_user and month = v_month and used + p_cost <= v_limit
      returning used into v_used;
    if not found then
      v_allowed := false;
      select used into v_used from ai_usage where user_id = p_user and month = v_month;
    end if;
  elsif p_cost < 0 then
    update ai_usage set used = greatest(0, used + p_cost), updated_at = now()
      where user_id = p_user and month = v_month
      returning used into v_used;
  else
    select used into v_used from ai_usage where user_id = p_user and month = v_month;
  end if;

  return json_build_object('allowed', v_allowed, 'used', v_used, 'limit', v_limit, 'plan', v_plan);
end;
$$;

revoke all on function public.glint_use_credits(uuid, integer, integer, integer) from public;
revoke all on function public.glint_use_credits(uuid, integer, integer, integer) from anon, authenticated;
grant execute on function public.glint_use_credits(uuid, integer, integer, integer) to service_role;
