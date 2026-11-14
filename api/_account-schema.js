// Glint Pro groundwork: the Postgres schema for plans and hosted AI credits.
// The server installs it by itself the first time it finds the database empty
// (api/_account.js), so there is no SQL to run by hand. Every statement is safe
// to run again. Nothing in the browser talks to this database.
//
// user_id is the sign-in provider's user id (Clerk: "user_...").

export const SCHEMA = [
  `create table if not exists subscriptions (
    user_id text primary key,
    plan text not null default 'pro',
    status text not null default 'active',
    current_period_end timestamptz,
    provider text,
    provider_customer_id text,
    provider_subscription_id text,
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists ai_usage (
    user_id text not null,
    month date not null,
    used integer not null default 0 check (used >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, month)
  )`,
  // One atomic step: work out the plan, then spend (cost > 0), refund
  // (cost < 0) or just read (cost = 0) this month's credits. A spend that
  // would pass the limit changes nothing and comes back with allowed = false.
  // status: active | trialing | past_due | canceled; a canceled plan still
  // counts until current_period_end (what was paid for).
  `create or replace function glint_use_credits(
    p_user text, p_cost integer, p_free_limit integer, p_pro_limit integer
  ) returns json
  language plpgsql
  as $fn$
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
  $fn$`,
];

export const USE_CREDITS = 'select glint_use_credits($1::text, $2::int, $3::int, $4::int) as r';
