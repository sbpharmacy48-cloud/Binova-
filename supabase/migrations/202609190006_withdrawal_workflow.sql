-- Atomic withdrawal lifecycle: reserve on request, finalize or refund once.

alter table public.wallet_history add column if not exists withdrawal_id uuid references public.withdrawals(id) on delete set null;
create unique index if not exists idx_withdrawal_request_transaction on public.transactions(reference_id) where type = 'withdrawal' and reference_id is not null;
create unique index if not exists idx_withdrawal_refund_transaction on public.transactions(reference_id) where type = 'adjustment' and reference_id is not null;

create or replace function public.request_withdrawal(
  p_amount numeric,
  p_wallet_address text,
  p_network text default 'BEP20',
  p_currency text default 'USDT'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.wallets%rowtype;
  withdrawal_id uuid;
  duplicate_request uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if upper(trim(p_network)) <> 'BEP20' or upper(trim(p_currency)) <> 'USDT' then raise exception 'Only USDT BEP20 withdrawals are supported'; end if;
  if p_amount <= 0 then raise exception 'Withdrawal amount must be positive'; end if;
  if length(trim(coalesce(p_wallet_address, ''))) < 20 then raise exception 'Enter a valid destination wallet address'; end if;

  select id into duplicate_request
  from public.withdrawals
  where user_id = auth.uid()
    and amount = p_amount
    and lower(wallet_address) = lower(trim(p_wallet_address))
    and status in ('pending', 'processing')
    and created_at > now() - interval '5 minutes'
  limit 1;
  if duplicate_request is not null then raise exception 'A matching withdrawal is already pending'; end if;

  select * into wallet_row from public.wallets where user_id = auth.uid() for update;
  if not found then raise exception 'Wallet not found'; end if;
  if wallet_row.main_balance < p_amount then raise exception 'Insufficient Balance'; end if;

  update public.wallets
  set main_balance = main_balance - p_amount,
      pending_withdrawal = pending_withdrawal + p_amount,
      updated_at = now()
  where id = wallet_row.id;

  insert into public.withdrawals (user_id, amount, currency, wallet_address, network, status)
  values (auth.uid(), p_amount, 'USDT', trim(p_wallet_address), 'BEP20', 'pending')
  returning id into withdrawal_id;

  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description, metadata)
  values (auth.uid(), 'withdrawal', p_amount, 'USDT', withdrawal_id, wallet_row.main_balance, wallet_row.main_balance - p_amount, 'Withdrawal requested', jsonb_build_object('status', 'pending'));

  insert into public.wallet_history (user_id, wallet_id, withdrawal_id, type, amount, balance_before, balance_after, description)
  values (auth.uid(), wallet_row.id, withdrawal_id, 'withdrawal', p_amount, wallet_row.main_balance, wallet_row.main_balance - p_amount, 'Withdrawal requested');

  perform public.create_notification(auth.uid(), 'withdrawal', 'Withdrawal requested', format('%s USDT withdrawal is pending review.', p_amount), '/withdraw');
  return withdrawal_id;
end;
$$;

grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

create or replace function public.process_withdrawal(
  p_withdrawal_id uuid,
  p_status public.record_status,
  p_transaction_hash text default null,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  withdrawal_row public.withdrawals%rowtype;
  wallet_row public.wallets%rowtype;
  transaction_id uuid;
  refund_transaction_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('processing', 'completed', 'rejected') then raise exception 'Invalid withdrawal transition'; end if;

  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if withdrawal_row.status in ('completed', 'rejected') then raise exception 'Withdrawal is already finalized'; end if;
  if p_status = 'completed' and withdrawal_row.status not in ('pending', 'processing') then raise exception 'Withdrawal is not ready for completion'; end if;

  select * into wallet_row from public.wallets where user_id = withdrawal_row.user_id for update;
  if not found then raise exception 'Wallet not found'; end if;

  if p_status = 'processing' then
    update public.withdrawals set status = 'processing', admin_note = p_admin_note, processed_by = auth.uid(), updated_at = now() where id = p_withdrawal_id;
    update public.transactions set description = 'Withdrawal processing', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', 'processing') where reference_id = p_withdrawal_id and type = 'withdrawal';
    perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal processing', 'Your withdrawal is being processed.', '/withdraw');
    select id into transaction_id from public.transactions where reference_id = p_withdrawal_id and type = 'withdrawal';
    return transaction_id;
  end if;

  if p_status = 'completed' then
    update public.wallets set pending_withdrawal = greatest(0, pending_withdrawal - withdrawal_row.amount), total_withdrawal = total_withdrawal + withdrawal_row.amount, updated_at = now() where id = wallet_row.id;
    update public.withdrawals set status = 'completed', transaction_hash = nullif(trim(p_transaction_hash), ''), admin_note = p_admin_note, processed_by = auth.uid(), processed_at = now(), updated_at = now() where id = p_withdrawal_id;
    update public.transactions set description = 'Withdrawal completed', transaction_hash = nullif(trim(p_transaction_hash), ''), metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', 'completed') where reference_id = p_withdrawal_id and type = 'withdrawal' returning id into transaction_id;
    insert into public.wallet_history (user_id, wallet_id, withdrawal_id, type, amount, balance_before, balance_after, description)
    values (withdrawal_row.user_id, wallet_row.id, p_withdrawal_id, 'withdrawal', withdrawal_row.amount, wallet_row.main_balance, wallet_row.main_balance, 'Withdrawal completed');
    perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal completed', format('%s USDT withdrawal was completed.', withdrawal_row.amount), '/wallet');
    return transaction_id;
  end if;

  update public.wallets set main_balance = main_balance + withdrawal_row.amount, pending_withdrawal = greatest(0, pending_withdrawal - withdrawal_row.amount), updated_at = now() where id = wallet_row.id;
  update public.withdrawals set status = 'rejected', admin_note = p_admin_note, processed_by = auth.uid(), processed_at = now(), updated_at = now() where id = p_withdrawal_id;
  update public.transactions set description = 'Withdrawal rejected and refunded', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', 'rejected') where reference_id = p_withdrawal_id and type = 'withdrawal' returning id into transaction_id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description, metadata)
  values (withdrawal_row.user_id, 'adjustment', withdrawal_row.amount, 'USDT', p_withdrawal_id, wallet_row.main_balance, wallet_row.main_balance + withdrawal_row.amount, 'Withdrawal refund', jsonb_build_object('source', 'withdrawal_rejection'))
  returning id into refund_transaction_id;
  insert into public.wallet_history (user_id, wallet_id, withdrawal_id, type, amount, balance_before, balance_after, description)
  values (withdrawal_row.user_id, wallet_row.id, p_withdrawal_id, 'adjustment', withdrawal_row.amount, wallet_row.main_balance, wallet_row.main_balance + withdrawal_row.amount, 'Withdrawal refund');
  perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal rejected', 'Your withdrawal was rejected and the full amount was refunded.', '/wallet');
  return refund_transaction_id;
end;
$$;

grant execute on function public.process_withdrawal(uuid, public.record_status, text, text) to authenticated;

-- Preserve existing admin callers while routing approval through the guarded state machine.
create or replace function public.approve_withdrawal(p_withdrawal_id uuid, p_transaction_hash text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.process_withdrawal(p_withdrawal_id, 'completed', p_transaction_hash, null);
end;
$$;

grant execute on function public.approve_withdrawal(uuid, text) to authenticated;

-- Direct admin status updates must use the same ledger path as the RPC.
create unique index if not exists idx_withdrawal_ledger_event
  on public.wallet_history(withdrawal_id, description)
  where withdrawal_id is not null;

create or replace function public.apply_withdrawal_completion(p_withdrawal_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  withdrawal_row public.withdrawals%rowtype;
  wallet_row public.wallets%rowtype;
  transaction_id uuid;
begin
  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id and status = 'completed' for update;
  if not found or exists (select 1 from public.wallet_history where withdrawal_id = p_withdrawal_id and description = 'Withdrawal completed') then return; end if;
  select * into wallet_row from public.wallets where user_id = withdrawal_row.user_id for update;
  if not found then raise exception 'Wallet not found'; end if;
  update public.wallets set pending_withdrawal = greatest(0, pending_withdrawal - withdrawal_row.amount), total_withdrawal = total_withdrawal + withdrawal_row.amount, updated_at = now() where id = wallet_row.id;
  update public.transactions set description = 'Withdrawal completed', transaction_hash = withdrawal_row.transaction_hash, metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', 'completed') where reference_id = p_withdrawal_id and type = 'withdrawal' returning id into transaction_id;
  if transaction_id is null then raise exception 'Withdrawal transaction not found'; end if;
  insert into public.wallet_history (user_id, wallet_id, withdrawal_id, type, amount, balance_before, balance_after, description)
  values (withdrawal_row.user_id, wallet_row.id, p_withdrawal_id, 'withdrawal', withdrawal_row.amount, wallet_row.main_balance, wallet_row.main_balance, 'Withdrawal completed');
  perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal completed', 'Your withdrawal has been completed.', '/wallet');
end;
$$;

create or replace function public.apply_withdrawal_rejection(p_withdrawal_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  withdrawal_row public.withdrawals%rowtype;
  wallet_row public.wallets%rowtype;
begin
  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id and status = 'rejected' for update;
  if not found or exists (select 1 from public.transactions where reference_id = p_withdrawal_id and type = 'adjustment') then return; end if;
  select * into wallet_row from public.wallets where user_id = withdrawal_row.user_id for update;
  if not found then raise exception 'Wallet not found'; end if;
  update public.wallets set main_balance = main_balance + withdrawal_row.amount, pending_withdrawal = greatest(0, pending_withdrawal - withdrawal_row.amount), updated_at = now() where id = wallet_row.id;
  update public.transactions set description = 'Withdrawal rejected', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', 'rejected') where reference_id = p_withdrawal_id and type = 'withdrawal';
  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description, metadata)
  values (withdrawal_row.user_id, 'adjustment', withdrawal_row.amount, 'USDT', p_withdrawal_id, wallet_row.main_balance, wallet_row.main_balance + withdrawal_row.amount, 'Withdrawal rejected', jsonb_build_object('status', 'rejected', 'source', 'withdrawal_rejection'));
  insert into public.wallet_history (user_id, wallet_id, withdrawal_id, type, amount, balance_before, balance_after, description)
  values (withdrawal_row.user_id, wallet_row.id, p_withdrawal_id, 'adjustment', withdrawal_row.amount, wallet_row.main_balance, wallet_row.main_balance + withdrawal_row.amount, 'Withdrawal refunded');
  perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal rejected', 'Your withdrawal was rejected and the full amount was refunded.', '/wallet');
end;
$$;

create or replace function public.on_withdrawal_status_changed()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then perform public.apply_withdrawal_completion(new.id); end if;
  if new.status = 'rejected' and old.status <> 'rejected' then perform public.apply_withdrawal_rejection(new.id); end if;
  return new;
end;
$$;

drop trigger if exists withdrawal_status_ledger on public.withdrawals;
create trigger withdrawal_status_ledger after update of status on public.withdrawals for each row execute function public.on_withdrawal_status_changed();

create or replace function public.process_withdrawal(
  p_withdrawal_id uuid,
  p_status public.record_status,
  p_transaction_hash text default null,
  p_admin_note text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  withdrawal_row public.withdrawals%rowtype;
  transaction_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('processing', 'completed', 'rejected') then raise exception 'Invalid withdrawal transition'; end if;
  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if withdrawal_row.status in ('completed', 'rejected') then raise exception 'Withdrawal is already finalized'; end if;
  update public.withdrawals set status = p_status, transaction_hash = case when p_status = 'completed' then nullif(trim(p_transaction_hash), '') else transaction_hash end, admin_note = p_admin_note, processed_by = auth.uid(), processed_at = case when p_status in ('completed', 'rejected') then now() else processed_at end, updated_at = now() where id = p_withdrawal_id;
  if p_status = 'processing' then
    update public.transactions set description = 'Withdrawal processing', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', 'processing') where reference_id = p_withdrawal_id and type = 'withdrawal';
    perform public.create_notification(withdrawal_row.user_id, 'withdrawal', 'Withdrawal processing', 'Your withdrawal is being processed.', '/withdraw');
  end if;
  select id into transaction_id from public.transactions where reference_id = p_withdrawal_id and type = case when p_status = 'rejected' then 'adjustment' else 'withdrawal' end;
  return transaction_id;
end;
$$;

grant execute on function public.process_withdrawal(uuid, public.record_status, text, text) to authenticated;

revoke insert, update on public.withdrawals from authenticated;
revoke insert, update on public.wallets, public.transactions, public.wallet_history from authenticated;

do $$ begin alter publication supabase_realtime add table public.withdrawals; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.wallet_history; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end $$;
