-- Binova complete database schema for a brand-new Supabase project.
-- Run this single file in the Supabase SQL Editor from top to bottom.
-- Supabase Auth owns credentials. Public tables reference auth.users(id).
-- Admin access is granted to users whose JWT app_metadata.role is "admin" or "super_admin".

create extension if not exists pgcrypto;
create extension if not exists citext;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

do $$ begin
  create type public.account_status as enum ('active', 'pending', 'suspended', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.record_status as enum ('pending', 'processing', 'active', 'completed', 'rejected', 'cancelled', 'inactive');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_type as enum ('system', 'deposit', 'withdrawal', 'investment', 'security', 'referral', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_action as enum ('login', 'logout', 'register', 'deposit', 'withdrawal', 'investment', 'password_change', 'profile_update', 'security_event', 'support');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.transaction_type as enum ('deposit', 'withdrawal', 'investment', 'profit', 'referral', 'bonus', 'adjustment');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username citext not null unique,
  email citext not null unique,
  phone text,
  avatar_url text,
  country text,
  referral_code citext not null unique,
  referred_by uuid references public.profiles(id) on delete set null,
  email_verified boolean not null default false,
  account_status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (length(username) between 3 and 32),
  constraint profiles_referral_code_format check (referral_code ~ '^[A-Z0-9-]{6,32}$')
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  main_balance numeric(28, 8) not null default 0 check (main_balance >= 0),
  profit_balance numeric(28, 8) not null default 0 check (profit_balance >= 0),
  bonus_balance numeric(28, 8) not null default 0 check (bonus_balance >= 0),
  referral_balance numeric(28, 8) not null default 0 check (referral_balance >= 0),
  locked_balance numeric(28, 8) not null default 0 check (locked_balance >= 0),
  pending_deposit numeric(28, 8) not null default 0 check (pending_deposit >= 0),
  pending_withdrawal numeric(28, 8) not null default 0 check (pending_withdrawal >= 0),
  total_deposit numeric(28, 8) not null default 0 check (total_deposit >= 0),
  total_withdrawal numeric(28, 8) not null default 0 check (total_withdrawal >= 0),
  total_profit numeric(28, 8) not null default 0 check (total_profit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  language text not null default 'en',
  currency text not null default 'USD',
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  email_notifications boolean not null default true,
  push_notifications boolean not null default true,
  marketing_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_session_id text unique,
  auth_session_id uuid,
  device_id text,
  ip_address inet,
  user_agent text,
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text not null,
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action public.activity_action not null,
  entity_type text,
  entity_id uuid,
  description text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code citext not null references public.profiles(referral_code) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_user_id uuid not null unique references auth.users(id) on delete restrict,
  commission numeric(28, 8) not null default 0 check (commission >= 0),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (parent_user_id <> child_user_id)
);

create table if not exists public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  minimum_deposit numeric(28, 8) not null check (minimum_deposit > 0),
  maximum_deposit numeric(28, 8) not null check (maximum_deposit >= minimum_deposit),
  duration_days integer not null check (duration_days > 0),
  daily_profit_percentage numeric(8, 5) not null check (daily_profit_percentage >= 0),
  estimated_return numeric(12, 4),
  return_label text,
  risk_level text not null,
  color text,
  badge text,
  status public.record_status not null default 'active',
  display_order integer not null default 0,
  icon text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_plans_return_source check (estimated_return is not null or return_label is not null)
);

create table if not exists public.user_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  plan_id uuid not null references public.investment_plans(id) on delete restrict,
  amount numeric(28, 8) not null check (amount > 0),
  expected_return numeric(28, 8) check (expected_return is null or expected_return >= 0),
  current_profit numeric(28, 8) not null default 0 check (current_profit >= 0),
  start_date timestamptz not null default now(),
  end_date timestamptz,
  status public.record_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_investments_dates check (end_date is null or end_date > start_date)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  type public.transaction_type not null,
  amount numeric(28, 8) not null check (amount > 0),
  currency text not null default 'USD',
  reference_id uuid,
  transaction_hash text,
  balance_before numeric(28, 8),
  balance_after numeric(28, 8),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(28, 8) not null check (amount > 0),
  currency text not null default 'USD',
  network text,
  wallet_address text,
  transaction_hash text unique,
  screenshot_url text,
  status public.record_status not null default 'pending',
  admin_note text,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(28, 8) not null check (amount > 0),
  currency text not null default 'USD',
  wallet_address text not null,
  network text not null,
  status public.record_status not null default 'pending',
  admin_note text,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  category text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status public.record_status not null default 'pending',
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  message text not null,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key citext not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_referral_code on public.profiles(referral_code);
create index if not exists idx_profiles_status on public.profiles(account_status);
create index if not exists idx_profiles_referred_by on public.profiles(referred_by);
create index if not exists idx_wallets_user_id on public.wallets(user_id);
create index if not exists idx_user_settings_user_id on public.user_settings(user_id);
create index if not exists idx_sessions_user_active on public.sessions(user_id, is_active, last_seen_at desc);
create unique index if not exists idx_sessions_client_session_id on public.sessions(client_session_id) where client_session_id is not null;
create index if not exists idx_notifications_user_read on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_activity_logs_user_created on public.activity_logs(user_id, created_at desc);
create index if not exists idx_referrals_parent_user on public.referrals(parent_user_id);
create index if not exists idx_referrals_child_user on public.referrals(child_user_id);
create index if not exists idx_referrals_code on public.referrals(referral_code);
create index if not exists idx_plans_status_order on public.investment_plans(status, display_order);
create index if not exists idx_investments_user_status on public.user_investments(user_id, status);
create index if not exists idx_investments_plan on public.user_investments(plan_id);
create index if not exists idx_transactions_user_created on public.transactions(user_id, created_at desc);
create index if not exists idx_transactions_status_type on public.transactions(type, created_at desc);
create index if not exists idx_transactions_hash on public.transactions(transaction_hash);
create index if not exists idx_deposits_user_status on public.deposits(user_id, status);
create index if not exists idx_deposits_hash on public.deposits(transaction_hash);
create index if not exists idx_withdrawals_user_status on public.withdrawals(user_id, status);
create index if not exists idx_support_tickets_user_status on public.support_tickets(user_id, status);
create index if not exists idx_ticket_messages_ticket_created on public.ticket_messages(ticket_id, created_at);
create index if not exists idx_app_settings_key on public.app_settings(setting_key);

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'super_admin');
$$;

create or replace function public.generate_referral_code()
returns citext
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'BIN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = candidate::citext);
  end loop;
  return candidate::citext;
end;
$$;

create or replace function public.generate_username(preferred_username text default null, source_email text default null)
returns citext
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  suffix integer := 0;
begin
  base_name := lower(regexp_replace(coalesce(preferred_username, ''), '[^a-z0-9_]', '', 'g'));
  if length(base_name) < 3 then
    base_name := lower(regexp_replace(split_part(coalesce(source_email, 'binova_user'), '@', 1), '[^a-z0-9_]', '', 'g'));
  end if;
  if length(base_name) < 3 then base_name := 'binova_user'; end if;
  base_name := left(base_name, 24);
  candidate := base_name;
  while exists (select 1 from public.profiles where username = candidate::citext) loop
    suffix := suffix + 1;
    candidate := left(base_name, greatest(3, 24 - length(suffix::text) - 1)) || '_' || suffix::text;
  end loop;
  return candidate::citext;
end;
$$;

create or replace function public.create_profile_for_user(target_user_id uuid, profile_email citext, profile_metadata jsonb default '{}'::jsonb, verified boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_username citext;
  generated_code citext;
  parent_id uuid;
begin
  selected_username := public.generate_username(profile_metadata ->> 'username', profile_email::text);
  generated_code := public.generate_referral_code();

  select id into parent_id
  from public.profiles
  where referral_code = nullif(profile_metadata ->> 'referral_code', '')::citext;

  insert into public.profiles (id, full_name, username, email, phone, avatar_url, country, referral_code, referred_by, email_verified, account_status)
  values (
    target_user_id,
    left(nullif(profile_metadata ->> 'full_name', ''), 160),
    selected_username,
    profile_email,
    nullif(profile_metadata ->> 'phone', ''),
    nullif(profile_metadata ->> 'avatar_url', ''),
    nullif(profile_metadata ->> 'country', ''),
    generated_code,
    parent_id,
    verified,
    'pending'
  )
  on conflict (id) do nothing;

  return target_user_id;
end;
$$;

create or replace function public.create_wallet_for_user(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare wallet_id uuid;
begin
  insert into public.wallets (user_id) values (target_user_id)
  on conflict (user_id) do nothing
  returning id into wallet_id;
  if wallet_id is null then select id into wallet_id from public.wallets where user_id = target_user_id; end if;
  return wallet_id;
end;
$$;

create or replace function public.create_notification(target_user_id uuid, notification_type public.notification_type, notification_title text, notification_message text, notification_url text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare notification_id uuid;
begin
  insert into public.notifications (user_id, type, title, message, action_url)
  values (target_user_id, notification_type, notification_title, notification_message, notification_url)
  returning id into notification_id;
  return notification_id;
end;
$$;

create or replace function public.log_activity(target_user_id uuid, activity_action public.activity_action, activity_description text, activity_entity_type text default null, activity_entity_id uuid default null, activity_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare activity_id uuid;
begin
  insert into public.activity_logs (user_id, action, description, entity_type, entity_id, metadata)
  values (target_user_id, activity_action, activity_description, activity_entity_type, activity_entity_id, activity_metadata)
  returning id into activity_id;
  return activity_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The outer exception boundary guarantees that Supabase Auth signup is never rolled back by this trigger.
  begin
    perform public.create_profile_for_user(new.id, new.email::citext, coalesce(new.raw_user_meta_data, '{}'::jsonb), new.email_confirmed_at is not null);
    perform public.create_wallet_for_user(new.id);
    insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  exception when others then
    raise warning 'Binova account bootstrap failed for %: %', new.id, sqlerrm;
  end;

  begin
    insert into public.referrals (referral_code, parent_user_id, child_user_id)
    select parent.referral_code, parent.id, child.id
    from public.profiles child
    join public.profiles parent on parent.id = child.referred_by
    where child.id = new.id
    on conflict (child_user_id) do nothing;
  exception when others then
    raise warning 'Binova referral creation failed for %: %', new.id, sqlerrm;
  end;

  begin
    perform public.log_activity(new.id, 'register', 'Account created');
  exception when others then
    raise warning 'Binova activity log failed for %: %', new.id, sqlerrm;
  end;

  begin
    perform public.create_notification(new.id, 'system', 'Welcome to Binova', 'Your Binova account is ready to configure.');
  exception when others then
    raise warning 'Binova notification failed for %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'Binova signup trigger completed with warning for %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    update public.profiles
    set email = new.email,
        email_verified = new.email_confirmed_at is not null,
        updated_at = now()
    where id = new.id;
  exception when others then
    raise warning 'Binova profile sync failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.ensure_user_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  auth_email citext;
  confirmed boolean;
  metadata jsonb;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;

  select email::citext, email_confirmed_at is not null, coalesce(raw_user_meta_data, '{}'::jsonb)
  into auth_email, confirmed, metadata
  from auth.users
  where id = current_user_id;

  if auth_email is null then raise exception 'Authenticated user was not found'; end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    perform public.create_profile_for_user(current_user_id, auth_email, metadata, confirmed);
  else
    update public.profiles
    set email = auth_email, email_verified = confirmed, updated_at = now()
    where id = current_user_id;
  end if;

  perform public.create_wallet_for_user(current_user_id);
  insert into public.user_settings (user_id) values (current_user_id) on conflict (user_id) do nothing;
  return jsonb_build_object('profile_exists', true, 'wallet_exists', true);
end;
$$;

create or replace function public.claim_single_session(p_client_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or nullif(trim(p_client_session_id), '') is null then return false; end if;
  update public.sessions
  set is_active = false, ended_at = coalesce(ended_at, now()), updated_at = now()
  where user_id = auth.uid() and is_active = true
    and client_session_id is distinct from p_client_session_id;
  insert into public.sessions (user_id, client_session_id, last_seen_at, is_active)
  values (auth.uid(), p_client_session_id, now(), true)
  on conflict (client_session_id) do update set
    user_id = excluded.user_id, last_seen_at = now(), ended_at = null,
    is_active = true, updated_at = now();
  return true;
end;
$$;

create or replace function public.is_current_session(p_client_session_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.sessions
    where user_id = auth.uid() and client_session_id = nullif(trim(p_client_session_id), '') and is_active = true
  );
$$;

create or replace function public.touch_current_session(p_client_session_id text)
returns boolean
language sql security definer set search_path = public
as $$
  update public.sessions set last_seen_at = now(), updated_at = now()
  where user_id = auth.uid() and client_session_id = nullif(trim(p_client_session_id), '') and is_active = true
  returning true;
$$;

create or replace function public.release_current_session(p_client_session_id text)
returns boolean
language sql security definer set search_path = public
as $$
  update public.sessions set is_active = false, ended_at = now(), updated_at = now()
  where user_id = auth.uid() and client_session_id = nullif(trim(p_client_session_id), '') and is_active = true
  returning true;
$$;

-- -----------------------------------------------------------------------------
-- Auth triggers
-- -----------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, email_confirmed_at on auth.users
for each row execute function public.handle_auth_user_updated();

-- Automatic timestamps.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'wallets', 'user_settings', 'sessions', 'notifications', 'activity_logs',
    'referrals', 'investment_plans', 'user_investments', 'transactions', 'deposits',
    'withdrawals', 'support_tickets', 'ticket_messages', 'app_settings'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Seed investment plans
-- -----------------------------------------------------------------------------

insert into public.investment_plans (slug, name, minimum_deposit, maximum_deposit, duration_days, daily_profit_percentage, estimated_return, return_label, risk_level, color, badge, display_order, icon, description)
values
  ('starter', 'Starter', 10, 100, 50, 0.05000, null, 'Configured by admin', 'low', '#C2CEDD', null, 1, 'circle-dollar-sign', 'A measured entry point for new investors.'),
  ('explorer', 'Explorer', 101, 500, 50, 0.06000, null, 'Configured by admin', 'balanced', '#43D3BB', 'Recommended', 2, 'trending-up', 'A balanced plan for steady participation.'),
  ('growth', 'Growth', 501, 1000, 50, 0.07000, null, 'Configured by admin', 'measured', '#6DA7FF', null, 3, 'bar-chart-3', 'A structured plan for growing allocations.'),
  ('professional', 'Professional', 1001, 2000, 35, 0.08000, null, 'Configured by admin', 'considered', '#B08CFF', null, 4, 'wallet-cards', 'A focused plan for experienced investors.'),
  ('advanced', 'Advanced', 2001, 3000, 35, 0.09000, null, 'Configured by admin', 'considered', '#7C9CFF', null, 5, 'layers-3', 'A broader allocation with a defined horizon.'),
  ('premium', 'Premium', 3001, 4000, 35, 0.10000, null, 'Configured by admin', 'advanced', '#D5A6FF', null, 6, 'gem', 'A premium allocation for longer-term planning.'),
  ('elite', 'Elite', 4001, 4500, 35, 0.11000, null, 'Configured by admin', 'advanced', '#F3BA2F', 'Featured', 7, 'sparkles', 'An elevated plan with enhanced account attention.'),
  ('sovereign', 'Sovereign', 4501, 5000, 35, 0.12000, null, 'Configured by admin', 'advanced', '#F8D979', 'Top allocation', 8, 'crown', 'The highest allocation tier available on Binova.')
on conflict (slug) do update set
  name = excluded.name,
  minimum_deposit = excluded.minimum_deposit,
  maximum_deposit = excluded.maximum_deposit,
  duration_days = excluded.duration_days,
  daily_profit_percentage = excluded.daily_profit_percentage,
  risk_level = excluded.risk_level,
  color = excluded.color,
  badge = excluded.badge,
  display_order = excluded.display_order,
  icon = excluded.icon,
  description = excluded.description,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------

create or replace view public.active_investment_plans
with (security_invoker = true)
as
select id, slug, name, minimum_deposit, maximum_deposit, duration_days,
       daily_profit_percentage, estimated_return, return_label, risk_level,
       color, badge, status, display_order, icon, description
from public.investment_plans
where status = 'active'
order by display_order, minimum_deposit;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.user_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.referrals enable row level security;
alter table public.investment_plans enable row level security;
alter table public.user_investments enable row level security;
alter table public.transactions enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.app_settings enable row level security;

-- User tables: users can access only their own rows; admins can access all rows.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'wallets', 'user_settings', 'sessions', 'notifications', 'activity_logs',
    'user_investments', 'transactions', 'deposits', 'withdrawals', 'support_tickets'
  ] loop
    execute format('drop policy if exists user_select_own on public.%I', table_name);
    execute format('create policy user_select_own on public.%I for select to authenticated using (user_id = auth.uid() or public.is_admin())', table_name);
    execute format('drop policy if exists user_insert_own on public.%I', table_name);
    execute format('create policy user_insert_own on public.%I for insert to authenticated with check (user_id = auth.uid() or public.is_admin())', table_name);
    execute format('drop policy if exists user_update_own on public.%I', table_name);
    execute format('create policy user_update_own on public.%I for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin())', table_name);
  end loop;
end $$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals for select to authenticated using (parent_user_id = auth.uid() or child_user_id = auth.uid() or public.is_admin());
drop policy if exists referrals_insert_own on public.referrals;
create policy referrals_insert_own on public.referrals for insert to authenticated with check (parent_user_id = auth.uid() or child_user_id = auth.uid() or public.is_admin());

drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages for select to authenticated using (sender_id = auth.uid() or public.is_admin() or exists (select 1 from public.support_tickets where id = ticket_id and user_id = auth.uid()));
drop policy if exists ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages for insert to authenticated with check (sender_id = auth.uid() or public.is_admin());
drop policy if exists ticket_messages_update on public.ticket_messages;
create policy ticket_messages_update on public.ticket_messages for update to authenticated using (sender_id = auth.uid() or public.is_admin()) with check (sender_id = auth.uid() or public.is_admin());

-- Public plan read access; admin-only plan writes.
drop policy if exists investment_plans_read on public.investment_plans;
create policy investment_plans_read on public.investment_plans for select to anon, authenticated using (status = 'active' or public.is_admin());
drop policy if exists investment_plans_admin on public.investment_plans;
create policy investment_plans_admin on public.investment_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings for select to anon, authenticated using (is_public = true or public.is_admin());
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grant API roles access; RLS remains the authorization boundary.
grant usage on schema public to anon, authenticated;
grant select on public.investment_plans, public.active_investment_plans to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.generate_referral_code() to authenticated;
grant execute on function public.generate_username(text, text) to authenticated;
grant execute on function public.ensure_user_account() to authenticated;
alter function public.ensure_user_account() security definer;
grant execute on function public.claim_single_session(text) to authenticated;
grant execute on function public.is_current_session(text) to authenticated;
grant execute on function public.touch_current_session(text) to authenticated;
grant execute on function public.release_current_session(text) to authenticated;

-- Keep internal trigger functions unavailable to browser clients.
revoke execute on function public.create_profile_for_user(uuid, citext, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.create_wallet_for_user(uuid) from public, anon, authenticated;
revoke execute on function public.create_notification(uuid, public.notification_type, text, text, text) from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, public.activity_action, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_updated() from public, anon, authenticated;
revoke execute on function public.ensure_user_account() from public, anon;

-- -----------------------------------------------------------------------------
-- Deposit wallet management
-- The Deposit screen reads the active row below and generates its QR dynamically.
-- Admins can add, replace, or deactivate wallet addresses without frontend edits.
-- -----------------------------------------------------------------------------

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

alter table public.deposits add column if not exists wallet_address text;
alter table public.deposits add column if not exists screenshot_url text;
create unique index if not exists idx_deposits_user_hash on public.deposits(user_id, lower(transaction_hash)) where transaction_hash is not null;

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
  update public.wallets set pending_deposit = pending_deposit + p_amount, updated_at = now() where user_id = auth.uid();
  return new_id;
end;
$$;

grant execute on function public.submit_deposit(numeric, text, text, text, text, text) to authenticated;

-- Never allow the browser client to mutate balances or financial ledgers directly.
drop policy if exists user_insert_own on public.deposits;
drop policy if exists user_update_own on public.deposits;
drop policy if exists user_update_own on public.wallets;
drop policy if exists user_insert_own on public.transactions;
drop policy if exists user_update_own on public.transactions;
revoke insert, update on public.wallets, public.transactions, public.deposits from authenticated;

-- Admin approval is the only path that credits wallet balance.
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
  select * into deposit_row from public.deposits where id = p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if deposit_row.status <> 'completed' then return null; end if;
  select * into wallet_row from public.wallets where user_id = deposit_row.user_id for update;
  if not found then raise exception 'Wallet not found for deposit user'; end if;
  select id into transaction_id from public.transactions where reference_id = deposit_row.id and type = 'deposit';
  if transaction_id is not null then
    insert into public.wallet_history (user_id, wallet_id, deposit_id, type, amount, balance_before, balance_after, description)
    select deposit_row.user_id, wallet_row.id, deposit_row.id, 'deposit', t.amount, t.balance_before, t.balance_after, 'Deposit completed'
    from public.transactions t where t.id = transaction_id
    on conflict (deposit_id) do nothing;
    return transaction_id;
  end if;
  update public.wallets set main_balance = main_balance + deposit_row.amount, pending_deposit = greatest(0, pending_deposit - deposit_row.amount), total_deposit = total_deposit + deposit_row.amount, updated_at = now() where id = wallet_row.id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, transaction_hash, balance_before, balance_after, description)
  values (deposit_row.user_id, 'deposit', deposit_row.amount, deposit_row.currency, deposit_row.id, deposit_row.transaction_hash, wallet_row.main_balance, wallet_row.main_balance + deposit_row.amount, 'Deposit completed') returning id into transaction_id;
  insert into public.wallet_history (user_id, wallet_id, deposit_id, type, amount, balance_before, balance_after, description)
  values (deposit_row.user_id, wallet_row.id, deposit_row.id, 'deposit', deposit_row.amount, wallet_row.main_balance, wallet_row.main_balance + deposit_row.amount, 'Deposit completed');
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
  if new.status = 'completed' and old.status <> 'completed' then perform public.apply_completed_deposit(new.id); end if;
  return new;
end;
$$;
drop trigger if exists deposit_completed_ledger on public.deposits;
create trigger deposit_completed_ledger after update of status on public.deposits for each row execute function public.on_deposit_completed();

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
  select * into deposit_row from public.deposits where id = p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if deposit_row.status not in ('pending', 'processing') then raise exception 'Deposit is already processed'; end if;
  update public.deposits
  set status = 'completed', admin_note = p_admin_note, processed_by = auth.uid(), processed_at = now(), updated_at = now()
  where id = p_deposit_id;
  select id into transaction_id from public.transactions where reference_id = p_deposit_id and type = 'deposit';
  return transaction_id;
end;
$$;

grant execute on function public.approve_deposit(uuid, text) to authenticated;

do $$
declare
  deposit_id uuid;
begin
  for deposit_id in
    select d.id from public.deposits d
    where d.status = 'completed'
      and not exists (select 1 from public.transactions t where t.reference_id = d.id and t.type = 'deposit')
  loop
    perform public.apply_completed_deposit(deposit_id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Market data and investment activation
-- -----------------------------------------------------------------------------

create table if not exists public.market_assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  price numeric(28, 8) not null check (price >= 0),
  change_24h numeric(12, 6) not null default 0,
  icon text,
  color text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.market_assets enable row level security;
drop policy if exists market_assets_active_read on public.market_assets;
create policy market_assets_active_read on public.market_assets for select to authenticated using (is_active = true or public.is_admin());
drop policy if exists market_assets_admin_write on public.market_assets;
create policy market_assets_admin_write on public.market_assets for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.market_assets to authenticated;

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

-- -----------------------------------------------------------------------------
-- Referral rewards
-- -----------------------------------------------------------------------------

create type public.referral_status as enum ('pending', 'qualified', 'rewarded', 'cancelled');

alter table public.referrals alter column status drop default;
alter table public.referrals alter column status type public.referral_status using (
  case
    when status::text = 'active' then 'pending'::public.referral_status
    when status::text = 'completed' then 'rewarded'::public.referral_status
    else status::text::public.referral_status
  end
);
alter table public.referrals alter column status set default 'pending'::public.referral_status;
alter table public.referrals add column if not exists reward_amount numeric(28, 8) not null default 0 check (reward_amount >= 0);
alter table public.referrals add column if not exists rewarded_at timestamptz;
alter table public.referrals add column if not exists qualified_at timestamptz;
alter table public.referrals add column if not exists first_deposit_id uuid references public.deposits(id) on delete set null;
alter table public.wallet_history add column if not exists referral_id uuid references public.referrals(id) on delete set null;

create unique index if not exists idx_referrals_one_child on public.referrals(child_user_id);
create unique index if not exists idx_referrals_first_deposit on public.referrals(first_deposit_id) where first_deposit_id is not null;
create unique index if not exists idx_referral_reward_transaction on public.transactions(reference_id) where type = 'referral' and reference_id is not null;
create unique index if not exists idx_referral_reward_history on public.wallet_history(referral_id) where referral_id is not null;

create or replace function public.reward_referral_for_deposit(p_deposit_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  deposit_row public.deposits%rowtype;
  referral_row public.referrals%rowtype;
  referrer_wallet public.wallets%rowtype;
  referred_name text;
  transaction_id uuid;
  reward numeric(28, 8) := 1.00;
begin
  select * into deposit_row from public.deposits where id = p_deposit_id and status = 'completed' for update;
  if not found then return null; end if;
  select * into referral_row from public.referrals where child_user_id = deposit_row.user_id and status in ('pending', 'qualified') for update;
  if not found then return null; end if;
  if referral_row.parent_user_id = referral_row.child_user_id then raise exception 'Self referral is not allowed'; end if;
  if exists (select 1 from public.deposits previous_deposit where previous_deposit.user_id = deposit_row.user_id and previous_deposit.status = 'completed' and previous_deposit.id <> deposit_row.id and (previous_deposit.created_at < deposit_row.created_at or (previous_deposit.created_at = deposit_row.created_at and previous_deposit.id < deposit_row.id))) then return null; end if;
  select id into transaction_id from public.transactions where reference_id = referral_row.id and type = 'referral';
  if transaction_id is not null then return transaction_id; end if;
  select * into referrer_wallet from public.wallets where user_id = referral_row.parent_user_id for update;
  if not found then raise exception 'Referrer wallet not found'; end if;
  update public.wallets set main_balance = main_balance + reward, referral_balance = referral_balance + reward, updated_at = now() where id = referrer_wallet.id;
  insert into public.transactions (user_id, type, amount, currency, reference_id, balance_before, balance_after, description, metadata)
  values (referral_row.parent_user_id, 'referral', reward, 'USD', referral_row.id, referrer_wallet.main_balance, referrer_wallet.main_balance + reward, 'Referral bonus', jsonb_build_object('source', 'first_completed_deposit', 'deposit_id', deposit_row.id, 'referred_user_id', deposit_row.user_id)) returning id into transaction_id;
  insert into public.wallet_history (user_id, wallet_id, referral_id, type, amount, balance_before, balance_after, description)
  values (referral_row.parent_user_id, referrer_wallet.id, referral_row.id, 'referral', reward, referrer_wallet.main_balance, referrer_wallet.main_balance + reward, 'Referral bonus');
  update public.referrals set status = 'rewarded', reward_amount = reward, commission = commission + reward, rewarded_at = now(), qualified_at = coalesce(qualified_at, now()), first_deposit_id = deposit_row.id, updated_at = now() where id = referral_row.id;
  select coalesce(nullif(trim(full_name), ''), username::text, email::text) into referred_name from public.profiles where id = deposit_row.user_id;
  perform public.create_notification(referral_row.parent_user_id, 'referral', 'Referral Bonus', format('You earned $1 from %s''s first completed deposit.', coalesce(referred_name, 'your referral')), '/referral');
  return transaction_id;
end;
$$;
revoke all on function public.reward_referral_for_deposit(uuid) from public, anon, authenticated;

create or replace function public.on_deposit_referral_reward()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then perform public.reward_referral_for_deposit(new.id); end if;
  return new;
end;
$$;
revoke all on function public.on_deposit_referral_reward() from public, anon, authenticated;
drop trigger if exists deposit_referral_reward on public.deposits;
create trigger deposit_referral_reward after update of status on public.deposits for each row execute function public.on_deposit_referral_reward();

alter table public.referrals enable row level security;
create or replace function public.protect_referral_attribution()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.referred_by is distinct from old.referred_by then raise exception 'Referral attribution cannot be changed after signup'; end if;
  return new;
end;
$$;
revoke all on function public.protect_referral_attribution() from public, anon, authenticated;
drop trigger if exists protect_referral_attribution on public.profiles;
create trigger protect_referral_attribution before update of referred_by on public.profiles for each row execute function public.protect_referral_attribution();
drop policy if exists referral_select_own on public.referrals;
create policy referral_select_own on public.referrals for select to authenticated using (parent_user_id = auth.uid() or child_user_id = auth.uid() or public.is_admin());
grant select on public.referrals, public.wallet_history to authenticated;

create or replace function public.get_referral_overview()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'code', p.referral_code,
    'referrals', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'username', coalesce(nullif(trim(child.full_name), ''), child.username::text, 'Member'), 'email', child.email, 'avatar_url', child.avatar_url, 'joined_at', r.created_at, 'first_deposit_amount', first_deposit.amount, 'bonus_amount', r.reward_amount, 'status', r.status, 'rewarded_at', r.rewarded_at) order by r.created_at desc) from public.referrals r join public.profiles child on child.id = r.child_user_id left join lateral (select d.amount from public.deposits d where d.user_id = r.child_user_id and d.status = 'completed' order by d.created_at asc, d.id asc limit 1) first_deposit on true where r.parent_user_id = auth.uid()), '[]'::jsonb),
    'total_earnings', coalesce((select sum(r.reward_amount) from public.referrals r where r.parent_user_id = auth.uid()), 0),
    'total_referred', (select count(*) from public.referrals r where r.parent_user_id = auth.uid()),
    'pending_rewards', (select count(*) from public.referrals r where r.parent_user_id = auth.uid() and r.status in ('pending', 'qualified')),
    'rewarded_users', (select count(*) from public.referrals r where r.parent_user_id = auth.uid() and r.status = 'rewarded')
  ) from public.profiles p where p.id = auth.uid();
$$;
grant execute on function public.get_referral_overview() to authenticated;

create or replace function public.get_referral_admin_overview()
returns jsonb language sql stable security definer set search_path = public
as $$
  select case when public.is_admin() then jsonb_build_object('total_rewards_paid', coalesce((select sum(reward_amount) from public.referrals where status = 'rewarded'), 0), 'pending_rewards', (select count(*) from public.referrals where status in ('pending', 'qualified')), 'total_referred_users', (select count(*) from public.referrals), 'top_referrers', coalesce((select jsonb_agg(jsonb_build_object('user_id', top_referrer.user_id, 'username', top_referrer.username, 'referred_users', top_referrer.referred_users, 'rewards_paid', top_referrer.rewards_paid) order by top_referrer.rewards_paid desc, top_referrer.referred_users desc) from (select r.parent_user_id as user_id, coalesce(nullif(trim(p.full_name), ''), p.username::text, p.email::text) as username, count(*) as referred_users, sum(r.reward_amount) as rewards_paid from public.referrals r join public.profiles p on p.id = r.parent_user_id group by r.parent_user_id, p.full_name, p.username, p.email order by sum(r.reward_amount) desc, count(*) desc limit 20) top_referrer), '[]'::jsonb)) else null end;
$$;
grant execute on function public.get_referral_admin_overview() to authenticated;

do $$ begin alter publication supabase_realtime add table public.referrals; exception when duplicate_object then null; end $$;

do $$
declare completed_deposit_id uuid;
begin
  for completed_deposit_id in select d.id from public.deposits d where d.status = 'completed' loop
    perform public.reward_referral_for_deposit(completed_deposit_id);
  end loop;
end $$;

-- Profile avatar storage and self-service profile/settings policies.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select to public using (bucket_id = 'avatars');

grant select, update on public.profiles to authenticated;
grant select, update on public.user_settings to authenticated;

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid() or public.is_admin());
grant select, update, delete on public.notifications to authenticated;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'web-push',
  endpoint text not null,
  p256dh text,
  auth text,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_provider_check check (provider in ('web-push', 'fcm', 'onesignal')),
  constraint push_subscriptions_endpoint_unique unique (provider, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;
do $$ begin
  create trigger set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
