-- BINOVA enterprise wallet system extensions.
-- All balance changes are performed by security-definer RPCs.

alter table public.wallets add column if not exists total_invested numeric(28, 8) not null default 0 check (total_invested >= 0);
alter table public.wallets add column if not exists active_investment numeric(28, 8) not null default 0 check (active_investment >= 0);
alter table public.wallets add column if not exists pending_profit numeric(28, 8) not null default 0 check (pending_profit >= 0);
alter table public.wallets add column if not exists wallet_status text not null default 'active' check (wallet_status in ('active', 'frozen', 'closed'));
alter table public.user_investments add column if not exists pending_profit numeric(28, 8) not null default 0 check (pending_profit >= 0);
alter table public.user_investments add column if not exists last_profit_at timestamptz not null default now();
alter table public.withdrawals add column if not exists transaction_hash text;

create unique index if not exists idx_withdrawals_user_reference on public.withdrawals(user_id, id);

create or replace function public.accrue_investment_profit(p_user_id uuid default auth.uid())
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  investment_row record;
  elapsed_days numeric;
  accrued numeric;
  total_accrued numeric := 0;
begin
  if p_user_id is null or (p_user_id <> auth.uid() and not public.is_admin()) then raise exception 'Unauthorized'; end if;
  for investment_row in
    select ui.id, ui.amount, ui.pending_profit, ui.last_profit_at, ui.end_date, ip.daily_profit_percentage
    from public.user_investments ui
    join public.investment_plans ip on ip.id = ui.plan_id
    where ui.user_id = p_user_id and ui.status = 'active'
    for update of ui
  loop
    elapsed_days := greatest(0, extract(epoch from (least(now(), investment_row.end_date) - investment_row.last_profit_at)) / 86400);
    accrued := investment_row.amount * investment_row.daily_profit_percentage / 100 * elapsed_days;
    if accrued > 0 then
      update public.user_investments
      set pending_profit = pending_profit + accrued, last_profit_at = least(now(), end_date), current_profit = current_profit + accrued, updated_at = now()
      where id = investment_row.id;
      total_accrued := total_accrued + accrued;
    end if;
  end loop;
  if total_accrued > 0 then
    update public.wallets set pending_profit = pending_profit + total_accrued, updated_at = now() where user_id = p_user_id;
  end if;
  return total_accrued;
end;
$$;

grant execute on function public.accrue_investment_profit(uuid) to authenticated;

create or replace function public.claim_profit()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.wallets%rowtype;
  claimed numeric;
  transaction_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.accrue_investment_profit(auth.uid());
  select * into wallet_row from public.wallets where user_id = auth.uid() for update;
  claimed := wallet_row.pending_profit;
  if claimed <= 0 then raise exception 'No pending profit available'; end if;
  update public.wallets set main_balance = main_balance + claimed, pending_profit = 0, total_profit = total_profit + claimed, updated_at = now() where id = wallet_row.id;
  update public.user_investments set pending_profit = 0 where user_id = auth.uid() and status = 'active';
  insert into public.transactions (user_id, type, amount, currency, balance_before, balance_after, description)
  values (auth.uid(), 'profit', claimed, 'USDT', wallet_row.main_balance, wallet_row.main_balance + claimed, 'Profit claimed') returning id into transaction_id;
  insert into public.wallet_history (user_id, wallet_id, type, amount, balance_before, balance_after, description)
  values (auth.uid(), wallet_row.id, 'profit', claimed, wallet_row.main_balance, wallet_row.main_balance + claimed, 'Profit claimed');
  perform public.create_notification(auth.uid(), 'investment', 'Profit claimed', format('%s USDT profit is now available.', round(claimed, 8)), '/wallet');
  perform public.log_activity(auth.uid(), 'investment', 'Profit claimed', 'wallet', wallet_row.id, jsonb_build_object('transaction_id', transaction_id));
  return claimed;
end;
$$;

grant execute on function public.claim_profit() to authenticated;

create or replace function public.request_withdrawal(p_amount numeric, p_wallet_address text, p_network text default 'BEP20', p_currency text default 'USDT')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.wallets%rowtype;
  withdrawal_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount <= 0 then raise exception 'Withdrawal amount must be positive'; end if;
  select * into wallet_row from public.wallets where user_id = auth.uid() for update;
  if wallet_row.main_balance < p_amount then raise exception 'Insufficient available balance'; end if;
  update public.wallets set pending_withdrawal = pending_withdrawal + p_amount, updated_at = now() where id = wallet_row.id;
  insert into public.withdrawals (user_id, amount, currency, wallet_address, network, status) values (auth.uid(), p_amount, p_currency, trim(p_wallet_address), p_network, 'pending') returning id into withdrawal_id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description) values (auth.uid(), 'withdrawal', p_amount, p_currency, withdrawal_id, wallet_row.main_balance, wallet_row.main_balance, 'Withdrawal requested');
  insert into public.wallet_history (user_id, wallet_id, type, amount, balance_before, balance_after, description) values (auth.uid(), wallet_row.id, 'withdrawal', p_amount, wallet_row.main_balance, wallet_row.main_balance, 'Withdrawal requested');
  perform public.create_notification(auth.uid(), 'withdrawal', 'Withdrawal submitted', format('%s %s withdrawal is pending review.', p_amount, p_currency), '/wallet');
  return withdrawal_id;
end;
$$;

grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

create or replace function public.approve_withdrawal(p_withdrawal_id uuid, p_transaction_hash text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  withdrawal_row public.withdrawals%rowtype;
  wallet_row public.wallets%rowtype;
  transaction_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id for update;
  if not found or withdrawal_row.status <> 'pending' then raise exception 'Withdrawal is unavailable'; end if;
  select * into wallet_row from public.wallets where user_id = withdrawal_row.user_id for update;
  if wallet_row.main_balance < withdrawal_row.amount then raise exception 'Insufficient balance'; end if;
  update public.wallets set main_balance = main_balance - withdrawal_row.amount, pending_withdrawal = greatest(0, pending_withdrawal - withdrawal_row.amount), total_withdrawal = total_withdrawal + withdrawal_row.amount, updated_at = now() where id = wallet_row.id;
  update public.withdrawals set status = 'completed', transaction_hash = p_transaction_hash, processed_by = auth.uid(), processed_at = now(), updated_at = now() where id = p_withdrawal_id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, transaction_hash, balance_before, balance_after, description) values (withdrawal_row.user_id, 'withdrawal', withdrawal_row.amount, withdrawal_row.currency, p_withdrawal_id, p_transaction_hash, wallet_row.main_balance, wallet_row.main_balance - withdrawal_row.amount, 'Withdrawal approved') returning id into transaction_id;
  insert into public.wallet_history (user_id, wallet_id, type, amount, balance_before, balance_after, description) values (withdrawal_row.user_id, wallet_row.id, 'withdrawal', withdrawal_row.amount, wallet_row.main_balance, wallet_row.main_balance - withdrawal_row.amount, 'Withdrawal approved');
  perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal approved', format('%s %s withdrawal was approved.', withdrawal_row.amount, withdrawal_row.currency), '/wallet');
  return transaction_id;
end;
$$;

grant execute on function public.approve_withdrawal(uuid, text) to authenticated;

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

alter table public.wallets enable row level security;
revoke insert, update on public.wallets from authenticated;
grant select on public.wallets to authenticated;
grant select on public.wallet_history to authenticated;

-- Keep wallet events available to the realtime client. Duplicate additions are ignored.
do $$
begin
  alter publication supabase_realtime add table public.wallets;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wallet_history;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.withdrawals;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.user_investments;
exception when duplicate_object then null;
end $$;
