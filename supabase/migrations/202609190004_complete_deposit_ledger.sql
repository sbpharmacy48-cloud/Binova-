-- Credit a deposit exactly once when its status enters completed.

create unique index if not exists idx_wallet_history_deposit_once
  on public.wallet_history(deposit_id)
  where deposit_id is not null;

create unique index if not exists idx_deposit_transaction_once
  on public.transactions(reference_id)
  where type = 'deposit' and reference_id is not null;

create or replace function public.apply_completed_deposit(p_deposit_id uuid)
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
  select * into deposit_row
  from public.deposits
  where id = p_deposit_id
  for update;

  if not found then raise exception 'Deposit not found'; end if;
  if deposit_row.status <> 'completed' then return null; end if;

  select * into wallet_row
  from public.wallets
  where user_id = deposit_row.user_id
  for update;

  if not found then raise exception 'Wallet not found for deposit user'; end if;

  select id into transaction_id
  from public.transactions
  where reference_id = deposit_row.id and type = 'deposit';

  if transaction_id is not null then
    insert into public.wallet_history (
      user_id, wallet_id, deposit_id, type, amount, balance_before,
      balance_after, description
    )
    select deposit_row.user_id, wallet_row.id, deposit_row.id, 'deposit',
      t.amount, t.balance_before, t.balance_after, 'Deposit completed'
    from public.transactions t
    where t.id = transaction_id
    on conflict (deposit_id) do nothing;
    return transaction_id;
  end if;

  update public.wallets
  set main_balance = main_balance + deposit_row.amount,
      pending_deposit = greatest(0, pending_deposit - deposit_row.amount),
      total_deposit = total_deposit + deposit_row.amount,
      updated_at = now()
  where id = wallet_row.id;

  insert into public.transactions (
    user_id, type, amount, currency, reference_id, transaction_hash,
    balance_before, balance_after, description
  ) values (
    deposit_row.user_id, 'deposit', deposit_row.amount, deposit_row.currency,
    deposit_row.id, deposit_row.transaction_hash, wallet_row.main_balance,
    wallet_row.main_balance + deposit_row.amount, 'Deposit completed'
  ) returning id into transaction_id;

  insert into public.wallet_history (
    user_id, wallet_id, deposit_id, type, amount, balance_before,
    balance_after, description
  ) values (
    deposit_row.user_id, wallet_row.id, deposit_row.id, 'deposit',
    deposit_row.amount, wallet_row.main_balance,
    wallet_row.main_balance + deposit_row.amount, 'Deposit completed'
  );

  return transaction_id;
end;
$$;

revoke all on function public.apply_completed_deposit(uuid) from public, anon, authenticated;

create or replace function public.on_deposit_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    perform public.apply_completed_deposit(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists deposit_completed_ledger on public.deposits;
create trigger deposit_completed_ledger
after update of status on public.deposits
for each row
execute function public.on_deposit_completed();

create or replace function public.approve_deposit(p_deposit_id uuid, p_admin_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deposit_row public.deposits%rowtype;
  transaction_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into deposit_row
  from public.deposits
  where id = p_deposit_id
  for update;

  if not found then raise exception 'Deposit not found'; end if;
  if deposit_row.status not in ('pending', 'processing') then
    raise exception 'Deposit is already processed';
  end if;

  update public.deposits
  set status = 'completed',
      admin_note = p_admin_note,
      processed_by = auth.uid(),
      processed_at = now(),
      updated_at = now()
  where id = p_deposit_id;

  select id into transaction_id
  from public.transactions
  where reference_id = p_deposit_id and type = 'deposit';

  return transaction_id;
end;
$$;

grant execute on function public.approve_deposit(uuid, text) to authenticated;

-- Repair completed deposits created before this ledger trigger existed.
do $$
declare
  deposit_id uuid;
begin
  for deposit_id in
    select d.id
    from public.deposits d
    where d.status = 'completed'
      and not exists (
        select 1 from public.transactions t
        where t.reference_id = d.id and t.type = 'deposit'
      )
  loop
    perform public.apply_completed_deposit(deposit_id);
  end loop;
end $$;
