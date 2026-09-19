-- Secure one-time referral rewards for a user's first completed deposit.

create type public.referral_status as enum ('pending', 'qualified', 'rewarded', 'cancelled');

alter table public.referrals
  alter column status drop default;

alter table public.referrals
  alter column status type public.referral_status
  using (
    case
      when status::text = 'active' then 'pending'::public.referral_status
      when status::text = 'completed' then 'rewarded'::public.referral_status
      else status::text::public.referral_status
    end
  );

alter table public.referrals
  alter column status set default 'pending'::public.referral_status;

alter table public.referrals add column if not exists reward_amount numeric(28, 8) not null default 0 check (reward_amount >= 0);
alter table public.referrals add column if not exists rewarded_at timestamptz;
alter table public.referrals add column if not exists qualified_at timestamptz;
alter table public.referrals add column if not exists first_deposit_id uuid references public.deposits(id) on delete set null;

create unique index if not exists idx_referrals_one_child on public.referrals(child_user_id);
create unique index if not exists idx_referrals_first_deposit on public.referrals(first_deposit_id) where first_deposit_id is not null;
create unique index if not exists idx_referral_reward_transaction on public.transactions(reference_id) where type = 'referral' and reference_id is not null;

alter table public.wallet_history add column if not exists referral_id uuid references public.referrals(id) on delete set null;
create unique index if not exists idx_referral_reward_history on public.wallet_history(referral_id) where referral_id is not null;

create or replace function public.reward_referral_for_deposit(p_deposit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deposit_row public.deposits%rowtype;
  referral_row public.referrals%rowtype;
  referrer_wallet public.wallets%rowtype;
  referred_name text;
  transaction_id uuid;
  reward numeric(28, 8) := 1.00;
begin
  select * into deposit_row
  from public.deposits
  where id = p_deposit_id and status = 'completed'
  for update;
  if not found then return null; end if;

  select * into referral_row
  from public.referrals
  where child_user_id = deposit_row.user_id
    and status in ('pending', 'qualified')
  for update;
  if not found then return null; end if;
  if referral_row.parent_user_id = referral_row.child_user_id then raise exception 'Self referral is not allowed'; end if;

  if exists (
    select 1 from public.deposits previous_deposit
    where previous_deposit.user_id = deposit_row.user_id
      and previous_deposit.status = 'completed'
      and previous_deposit.id <> deposit_row.id
      and (previous_deposit.created_at < deposit_row.created_at
        or (previous_deposit.created_at = deposit_row.created_at and previous_deposit.id < deposit_row.id))
  ) then
    return null;
  end if;

  select id into transaction_id
  from public.transactions
  where reference_id = referral_row.id and type = 'referral';
  if transaction_id is not null then return transaction_id; end if;

  select * into referrer_wallet
  from public.wallets
  where user_id = referral_row.parent_user_id
  for update;
  if not found then raise exception 'Referrer wallet not found'; end if;

  update public.wallets
  set main_balance = main_balance + reward,
      referral_balance = referral_balance + reward,
      updated_at = now()
  where id = referrer_wallet.id;

  insert into public.transactions (
    user_id, type, amount, currency, reference_id,
    balance_before, balance_after, description, metadata
  ) values (
    referral_row.parent_user_id, 'referral', reward, 'USD', referral_row.id,
    referrer_wallet.main_balance, referrer_wallet.main_balance + reward,
    'Referral bonus', jsonb_build_object('source', 'first_completed_deposit', 'deposit_id', deposit_row.id, 'referred_user_id', deposit_row.user_id)
  ) returning id into transaction_id;

  insert into public.wallet_history (
    user_id, wallet_id, referral_id, type, amount,
    balance_before, balance_after, description
  ) values (
    referral_row.parent_user_id, referrer_wallet.id, referral_row.id, 'referral', reward,
    referrer_wallet.main_balance, referrer_wallet.main_balance + reward, 'Referral bonus'
  );

  update public.referrals
  set status = 'rewarded', reward_amount = reward, commission = commission + reward,
      rewarded_at = now(), qualified_at = coalesce(qualified_at, now()),
      first_deposit_id = deposit_row.id, updated_at = now()
  where id = referral_row.id;

  select coalesce(nullif(trim(full_name), ''), username::text, email::text)
    into referred_name
  from public.profiles
  where id = deposit_row.user_id;

  perform public.create_notification(
    referral_row.parent_user_id,
    'referral',
    'Referral Bonus',
    format('You earned $1 from %s''s first completed deposit.', coalesce(referred_name, 'your referral')),
    '/referral'
  );

  return transaction_id;
end;
$$;

revoke all on function public.reward_referral_for_deposit(uuid) from public, anon, authenticated;

create or replace function public.on_deposit_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    perform public.reward_referral_for_deposit(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.on_deposit_referral_reward() from public, anon, authenticated;
drop trigger if exists deposit_referral_reward on public.deposits;
create trigger deposit_referral_reward
after update of status on public.deposits
for each row
execute function public.on_deposit_referral_reward();

alter table public.referrals enable row level security;
create or replace function public.protect_referral_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referred_by is distinct from old.referred_by then
    raise exception 'Referral attribution cannot be changed after signup';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_referral_attribution() from public, anon, authenticated;
drop trigger if exists protect_referral_attribution on public.profiles;
create trigger protect_referral_attribution
before update of referred_by on public.profiles
for each row
execute function public.protect_referral_attribution();

drop policy if exists referral_select_own on public.referrals;
create policy referral_select_own on public.referrals
for select to authenticated
using (parent_user_id = auth.uid() or child_user_id = auth.uid() or public.is_admin());

grant select on public.referrals to authenticated;
grant select on public.wallet_history to authenticated;

create or replace function public.get_referral_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', p.referral_code,
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'username', coalesce(nullif(trim(child.full_name), ''), child.username::text, 'Member'),
        'email', child.email,
        'avatar_url', child.avatar_url,
        'joined_at', r.created_at,
        'first_deposit_amount', first_deposit.amount,
        'bonus_amount', r.reward_amount,
        'status', r.status,
        'rewarded_at', r.rewarded_at
      ) order by r.created_at desc)
      from public.referrals r
      join public.profiles child on child.id = r.child_user_id
      left join lateral (
        select d.amount
        from public.deposits d
        where d.user_id = r.child_user_id and d.status = 'completed'
        order by d.created_at asc, d.id asc
        limit 1
      ) first_deposit on true
      where r.parent_user_id = auth.uid()
    ), '[]'::jsonb),
    'total_earnings', coalesce((select sum(r.reward_amount) from public.referrals r where r.parent_user_id = auth.uid()), 0),
    'total_referred', (select count(*) from public.referrals r where r.parent_user_id = auth.uid()),
    'pending_rewards', (select count(*) from public.referrals r where r.parent_user_id = auth.uid() and r.status in ('pending', 'qualified')),
    'rewarded_users', (select count(*) from public.referrals r where r.parent_user_id = auth.uid() and r.status = 'rewarded')
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.get_referral_overview() to authenticated;

create or replace function public.get_referral_admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then jsonb_build_object(
    'total_rewards_paid', coalesce((select sum(reward_amount) from public.referrals where status = 'rewarded'), 0),
    'pending_rewards', (select count(*) from public.referrals where status in ('pending', 'qualified')),
    'total_referred_users', (select count(*) from public.referrals),
    'top_referrers', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', top_referrer.user_id, 'username', top_referrer.username, 'referred_users', top_referrer.referred_users, 'rewards_paid', top_referrer.rewards_paid) order by top_referrer.rewards_paid desc, top_referrer.referred_users desc)
      from (
        select r.parent_user_id as user_id, coalesce(nullif(trim(p.full_name), ''), p.username::text, p.email::text) as username, count(*) as referred_users, sum(r.reward_amount) as rewards_paid
        from public.referrals r join public.profiles p on p.id = r.parent_user_id
        group by r.parent_user_id, p.full_name, p.username, p.email
        order by sum(r.reward_amount) desc, count(*) desc
        limit 20
      ) top_referrer
      limit 20
    ), '[]'::jsonb)
  ) else null end;
$$;

grant execute on function public.get_referral_admin_overview() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.referrals;
exception when duplicate_object then null;
end $$;

-- Reward referrals for completed deposits that existed before this migration.
do $$
declare
  completed_deposit_id uuid;
begin
  for completed_deposit_id in
    select d.id
    from public.deposits d
    where d.status = 'completed'
  loop
    perform public.reward_referral_for_deposit(completed_deposit_id);
  end loop;
end $$;

-- Keep investment activation, but remove the legacy investment-based referral payout.
create or replace function public.activate_investment(p_plan_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.investment_plans%rowtype;
  wallet_row public.wallets%rowtype;
  investment_id uuid;
  expected numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into plan_row from public.investment_plans where id = p_plan_id and status = 'active';
  if not found then raise exception 'Investment plan is not active'; end if;
  if p_amount < plan_row.minimum_deposit or p_amount > plan_row.maximum_deposit then raise exception 'Amount is outside the plan range'; end if;
  select * into wallet_row from public.wallets where user_id = auth.uid() for update;
  if wallet_row.main_balance < p_amount then raise exception 'Insufficient available balance'; end if;
  expected := case when plan_row.estimated_return is not null then p_amount * plan_row.estimated_return / 100 else p_amount * plan_row.daily_profit_percentage * plan_row.duration_days / 100 end;
  update public.wallets set main_balance = main_balance - p_amount, locked_balance = locked_balance + p_amount, total_invested = total_invested + p_amount, active_investment = active_investment + p_amount, updated_at = now() where id = wallet_row.id;
  insert into public.user_investments (user_id, plan_id, amount, expected_return, start_date, end_date, status)
  values (auth.uid(), p_plan_id, p_amount, expected, now(), now() + make_interval(days => plan_row.duration_days), 'active')
  returning id into investment_id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description)
  values (auth.uid(), 'investment', p_amount, 'USDT', investment_id, wallet_row.main_balance, wallet_row.main_balance - p_amount, 'Investment activated');
  insert into public.wallet_history (user_id, wallet_id, type, amount, balance_before, balance_after, description)
  values (auth.uid(), wallet_row.id, 'investment', p_amount, wallet_row.main_balance, wallet_row.main_balance - p_amount, 'Investment activated');
  perform public.create_notification(auth.uid(), 'investment', 'Investment activated', format('%s investment plan is now active.', plan_row.name), '/investment');
  perform public.log_activity(auth.uid(), 'investment', 'Investment activated', 'user_investment', investment_id);
  return investment_id;
end;
$$;

grant execute on function public.activate_investment(uuid, numeric) to authenticated;
