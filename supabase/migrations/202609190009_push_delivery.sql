-- Queue push delivery after notification rows are created.
-- Configure Vault secrets before enabling delivery:
--   SUPABASE_FUNCTIONS_URL = https://<project-ref>.supabase.co/functions/v1
--   SUPABASE_ANON_KEY = the project publishable/anon key
-- Configure Edge Function secrets separately:
--   WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT, PUSH_PROVIDER=web-push

create extension if not exists pg_net;

create or replace function public.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  functions_url text;
  anon_key text;
begin
  begin
    select decrypted_secret into functions_url
    from vault.decrypted_secrets
    where name = 'SUPABASE_FUNCTIONS_URL'
    limit 1;
    select decrypted_secret into anon_key
    from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
    limit 1;
  exception when undefined_table then
    return new;
  end;

  if nullif(trim(functions_url), '') is null or nullif(trim(anon_key), '') is null then
    raise warning 'Push delivery is not configured: add SUPABASE_FUNCTIONS_URL and SUPABASE_ANON_KEY to Vault';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(functions_url, '/') || '/send-notification-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  raise warning 'Push delivery queue failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_push_delivery on public.notifications;
create trigger notifications_push_delivery
after insert on public.notifications
for each row execute function public.queue_notification_push();

create or replace function public.notify_deposit_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    new.user_id,
    'deposit',
    'Deposit submitted',
    format('%s %s is pending review.', new.amount, new.currency),
    '/deposit'
  );
  return new;
end;
$$;

drop trigger if exists deposit_submitted_notification on public.deposits;
create trigger deposit_submitted_notification
after insert on public.deposits
for each row execute function public.notify_deposit_submitted();

create or replace function public.notify_deposit_rejected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'rejected' and old.status is distinct from new.status then
    perform public.create_notification(
      new.user_id,
      'deposit',
      'Deposit rejected',
      coalesce(new.admin_note, 'Your deposit was rejected during review.'),
      '/deposit'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists deposit_rejected_notification on public.deposits;
create trigger deposit_rejected_notification
after update of status on public.deposits
for each row execute function public.notify_deposit_rejected();

create or replace function public.notify_daily_profit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added numeric;
begin
  added := new.pending_profit - old.pending_profit;
  if added > 0 then
    perform public.create_notification(
      new.user_id,
      'investment',
      'Daily profit added',
      format('%s USDT profit was added to your investment.', round(added, 8)),
      '/investment'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists investment_profit_notification on public.user_investments;
create trigger investment_profit_notification
after update of pending_profit on public.user_investments
for each row execute function public.notify_daily_profit();
