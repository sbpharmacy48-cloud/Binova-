-- Automatic investment profit settlement.
-- Profit is credited by the database scheduler in complete 24-hour periods.

create extension if not exists pg_cron;

alter table public.wallet_history
  add column if not exists investment_id uuid references public.user_investments(id) on delete set null;

create table if not exists public.investment_profit_credits (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.user_investments(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount numeric(28, 8) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint investment_profit_credit_period check (period_end > period_start),
  constraint investment_profit_credit_once unique (investment_id, period_start)
);

create index if not exists idx_investment_profit_credits_user_created
  on public.investment_profit_credits(user_id, created_at desc);

create unique index if not exists idx_profit_transaction_reference_once
  on public.transactions(reference_id)
  where type = 'profit' and reference_id is not null;

create unique index if not exists idx_investment_maturity_history_once
  on public.wallet_history(investment_id)
  where type = 'adjustment' and description = 'Investment principal returned';

alter table public.investment_profit_credits enable row level security;
drop policy if exists investment_profit_credits_select_own on public.investment_profit_credits;
create policy investment_profit_credits_select_own
  on public.investment_profit_credits
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.investment_profit_credits to authenticated;

create or replace function public.process_investment_profit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_investment_id uuid;
  investment_row record;
  wallet_row public.wallets%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_credit_amount numeric;
  v_credit_id uuid;
  v_processed_count integer := 0;
  v_transaction_id uuid;
begin
  for v_investment_id in
    select ui.id
    from public.user_investments as ui
    where ui.status = 'active'
    order by ui.end_date nulls last, ui.id
  loop
    select ui.id, ui.user_id, ui.amount, ui.current_profit, ui.last_profit_at,
           ui.end_date, ip.daily_profit_percentage
    into investment_row
    from public.user_investments as ui
    join public.investment_plans as ip on ip.id = ui.plan_id
    where ui.id = v_investment_id and ui.status = 'active'
    for update of ui;

    if not found then continue; end if;

    v_period_start := investment_row.last_profit_at;
    while v_period_start + interval '24 hours' <= least(now(), investment_row.end_date) loop
      v_period_end := v_period_start + interval '24 hours';
      v_credit_amount := round(investment_row.amount * investment_row.daily_profit_percentage / 100, 8);

      if v_credit_amount > 0 then
        select * into wallet_row
        from public.wallets as w
        where w.user_id = investment_row.user_id
        for update;

        if not found then
          raise exception 'Wallet not found for investment %', investment_row.id;
        end if;

        insert into public.investment_profit_credits (
          investment_id, user_id, wallet_id, period_start, period_end, amount
        ) values (
          investment_row.id, investment_row.user_id, wallet_row.id,
          v_period_start, v_period_end, v_credit_amount
        )
        on conflict on constraint investment_profit_credit_once do nothing
        returning id into v_credit_id;

        if v_credit_id is not null then
            update public.wallets as w
            set main_balance = w.main_balance + v_credit_amount,
              total_profit = w.total_profit + v_credit_amount,
              updated_at = now()
            where w.id = wallet_row.id;

          insert into public.transactions (
            user_id, type, amount, currency, reference_id,
            balance_before, balance_after, description, metadata
          ) values (
            investment_row.user_id, 'profit', v_credit_amount, 'USDT', v_credit_id,
            wallet_row.main_balance, wallet_row.main_balance + v_credit_amount,
            'Daily investment profit',
            jsonb_build_object(
              'investment_id', investment_row.id,
              'period_start', v_period_start,
              'period_end', v_period_end
            )
          ) returning id into v_transaction_id;

          insert into public.wallet_history (
            user_id, wallet_id, investment_id, type, amount,
            balance_before, balance_after, description
          ) values (
            investment_row.user_id, wallet_row.id, investment_row.id, 'profit',
            v_credit_amount, wallet_row.main_balance,
            wallet_row.main_balance + v_credit_amount,
            'Daily investment profit'
          );

          perform public.create_notification(
            investment_row.user_id,
            'investment',
            'Daily profit credited',
            format('%s USDT profit was credited to your wallet.', round(v_credit_amount, 8)),
            '/wallet'
          );

          perform public.log_activity(
            investment_row.user_id,
            'investment',
            'Daily profit credited',
            'user_investment',
            investment_row.id,
            jsonb_build_object('transaction_id', v_transaction_id, 'credit_id', v_credit_id)
          );

          v_processed_count := v_processed_count + 1;
        end if;
      end if;

      v_period_start := v_period_end;
    end loop;

    update public.user_investments as ui
    set last_profit_at = v_period_start,
        current_profit = ui.current_profit + coalesce(
          (select sum(ipc.amount) from public.investment_profit_credits as ipc
           where ipc.investment_id = investment_row.id
             and ipc.period_start >= investment_row.last_profit_at), 0
        ),
        updated_at = now()
    where ui.id = investment_row.id
      and ui.last_profit_at < v_period_start;

    if investment_row.end_date <= now() then
      if not exists (
        select 1
        from public.wallet_history as wh
        where wh.investment_id = investment_row.id
          and wh.type = 'adjustment'
          and wh.description = 'Investment principal returned'
      ) then
        select * into wallet_row
        from public.wallets as w
        where w.user_id = investment_row.user_id
        for update;

        if not found then
          raise exception 'Wallet not found for investment %', investment_row.id;
        end if;

        update public.wallets as w
        set main_balance = w.main_balance + investment_row.amount,
          locked_balance = greatest(0, w.locked_balance - investment_row.amount),
          active_investment = greatest(0, w.active_investment - investment_row.amount),
            updated_at = now()
        where w.id = wallet_row.id;

        insert into public.transactions (
          user_id, type, amount, currency, reference_id,
          balance_before, balance_after, description, metadata
        ) values (
          investment_row.user_id, 'adjustment', investment_row.amount, 'USDT', investment_row.id,
          wallet_row.main_balance, wallet_row.main_balance + investment_row.amount,
          'Investment principal returned',
          jsonb_build_object('investment_id', investment_row.id, 'event', 'maturity')
        );

        insert into public.wallet_history (
          user_id, wallet_id, investment_id, type, amount,
          balance_before, balance_after, description
        ) values (
          investment_row.user_id, wallet_row.id, investment_row.id, 'adjustment',
          investment_row.amount, wallet_row.main_balance,
          wallet_row.main_balance + investment_row.amount,
          'Investment principal returned'
        );
      end if;

      update public.user_investments as ui
      set status = 'completed', updated_at = now()
      where ui.id = investment_row.id and ui.status = 'active';
    end if;
  end loop;

  return v_processed_count;
end;
$$;

revoke all on function public.process_investment_profit() from public, anon, authenticated;
revoke execute on function public.accrue_investment_profit(uuid) from public, anon, authenticated;
revoke execute on function public.claim_profit() from public, anon, authenticated;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'binova-investment-profit'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  perform cron.schedule(
    'binova-investment-profit',
    '*/15 * * * *',
    'select public.process_investment_profit();'
  );
exception when undefined_table then
  raise exception 'pg_cron must be enabled before installing the investment profit scheduler';
end;
$$;
