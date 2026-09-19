-- Deposit wallet management and secure user submission flow.
create table if not exists public.wallet_addresses (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  symbol text not null,
  address text not null,
  minimum_deposit numeric(28, 8) not null default 10 check (minimum_deposit > 0),
  confirmation_time text not null default 'Up to 30 minutes',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_addresses_network_symbol_address_unique unique (network, symbol, address)
);

create index if not exists idx_wallet_addresses_active on public.wallet_addresses(symbol, network, is_active, updated_at desc);

alter table public.wallet_addresses enable row level security;
drop policy if exists wallet_addresses_public_active_read on public.wallet_addresses;
create policy wallet_addresses_public_active_read on public.wallet_addresses for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists wallet_addresses_admin_write on public.wallet_addresses;
create policy wallet_addresses_admin_write on public.wallet_addresses for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.wallet_addresses to anon, authenticated;
grant insert, update, delete on public.wallet_addresses to authenticated;

alter table public.deposits add column if not exists wallet_address text;
alter table public.deposits add column if not exists screenshot_url text;
create unique index if not exists idx_deposits_user_hash on public.deposits(user_id, lower(transaction_hash)) where transaction_hash is not null;

create table if not exists public.wallet_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  deposit_id uuid references public.deposits(id) on delete set null,
  type public.transaction_type not null,
  amount numeric(28, 8) not null check (amount > 0),
  balance_before numeric(28, 8) not null,
  balance_after numeric(28, 8) not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_history_user_created on public.wallet_history(user_id, created_at desc);
alter table public.wallet_history enable row level security;
drop policy if exists wallet_history_select_own on public.wallet_history;
create policy wallet_history_select_own on public.wallet_history for select to authenticated using (user_id = auth.uid() or public.is_admin());
grant select on public.wallet_history to authenticated;

insert into storage.buckets (id, name, public)
values ('deposit-proofs', 'deposit-proofs', false)
on conflict (id) do nothing;

drop policy if exists deposit_proofs_insert_own on storage.objects;
create policy deposit_proofs_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'deposit-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists deposit_proofs_select_own on storage.objects;
create policy deposit_proofs_select_own on storage.objects for select to authenticated
using (bucket_id = 'deposit-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create or replace function public.submit_deposit(
  p_amount numeric,
  p_transaction_hash text,
  p_wallet_address text,
  p_screenshot_url text default null,
  p_network text default 'BEP20',
  p_currency text default 'USDT'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  minimum_amount numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select minimum_deposit into minimum_amount
  from public.wallet_addresses
  where address = p_wallet_address and network = p_network and symbol = p_currency and is_active = true
  order by updated_at desc limit 1;
  if minimum_amount is null then raise exception 'Deposit wallet is not active'; end if;
  if p_amount < minimum_amount then raise exception 'Minimum deposit is % %', minimum_amount, p_currency; end if;
  if exists (select 1 from public.deposits where lower(transaction_hash) = lower(trim(p_transaction_hash))) then raise exception 'Transaction hash already submitted'; end if;
  insert into public.deposits (user_id, amount, currency, network, wallet_address, transaction_hash, screenshot_url, status)
  values (auth.uid(), p_amount, p_currency, p_network, p_wallet_address, trim(p_transaction_hash), p_screenshot_url, 'pending')
  returning id into new_id;
  update public.wallets
  set pending_deposit = pending_deposit + p_amount, updated_at = now()
  where user_id = auth.uid();
  return new_id;
end;
$$;

grant execute on function public.submit_deposit(numeric, text, text, text, text, text) to authenticated;

drop policy if exists user_insert_own on public.deposits;
drop policy if exists user_update_own on public.deposits;
drop policy if exists user_update_own on public.wallets;
drop policy if exists user_insert_own on public.transactions;
drop policy if exists user_update_own on public.transactions;
revoke insert, update on public.wallets, public.transactions, public.deposits from authenticated;

create or replace function public.approve_deposit(p_deposit_id uuid, p_admin_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deposit_row public.deposits%rowtype;
  wallet_row public.wallets%rowtype;
  transaction_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into deposit_row from public.deposits where id = p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if deposit_row.status not in ('pending', 'processing') then raise exception 'Deposit is already processed'; end if;
  select * into wallet_row from public.wallets where user_id = deposit_row.user_id for update;
  update public.wallets
  set main_balance = main_balance + deposit_row.amount,
      pending_deposit = greatest(0, pending_deposit - deposit_row.amount),
      total_deposit = total_deposit + deposit_row.amount,
      updated_at = now()
  where id = wallet_row.id;
  update public.deposits
  set status = 'active', admin_note = p_admin_note, processed_by = auth.uid(), processed_at = now(), updated_at = now()
  where id = p_deposit_id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, transaction_hash, balance_before, balance_after, description)
  values (deposit_row.user_id, 'deposit', deposit_row.amount, deposit_row.currency, p_deposit_id, deposit_row.transaction_hash, wallet_row.main_balance, wallet_row.main_balance + deposit_row.amount, 'Deposit approved')
  returning id into transaction_id;
  insert into public.wallet_history (user_id, wallet_id, deposit_id, type, amount, balance_before, balance_after, description)
  values (deposit_row.user_id, wallet_row.id, p_deposit_id, 'deposit', deposit_row.amount, wallet_row.main_balance, wallet_row.main_balance + deposit_row.amount, 'Deposit approved');
  perform public.create_notification(deposit_row.user_id, 'deposit', 'Deposit approved', format('%s %s has been added to your wallet.', deposit_row.amount, deposit_row.currency), '/wallet');
  perform public.log_activity(deposit_row.user_id, 'deposit', 'Deposit approved', 'deposit', p_deposit_id, jsonb_build_object('transaction_id', transaction_id));
  return transaction_id;
end;
$$;

grant execute on function public.approve_deposit(uuid, text) to authenticated;

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
  update public.wallets set main_balance = main_balance - p_amount, locked_balance = locked_balance + p_amount, updated_at = now() where id = wallet_row.id;
  insert into public.user_investments (user_id, plan_id, amount, expected_return, start_date, end_date, status)
  values (auth.uid(), p_plan_id, p_amount, expected, now(), now() + make_interval(days => plan_row.duration_days), 'active')
  returning id into investment_id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description)
  values (auth.uid(), 'investment', p_amount, 'USD', investment_id, wallet_row.main_balance, wallet_row.main_balance - p_amount, 'Investment activated');
  perform public.create_notification(auth.uid(), 'investment', 'Investment activated', format('%s investment plan is now active.', plan_row.name), '/investment');
  perform public.log_activity(auth.uid(), 'investment', 'Investment activated', 'user_investment', investment_id);
  return investment_id;
end;
$$;

grant execute on function public.activate_investment(uuid, numeric) to authenticated;