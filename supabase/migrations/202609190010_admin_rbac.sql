-- BINOVA admin RBAC and management RPC boundary.
-- Bootstrap the first admin by setting auth.users.app_metadata.role to admin or super_admin.

do $$ begin
  alter table public.profiles add column role text not null default 'user';
exception when duplicate_column then null;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'super_admin', 'moderator', 'support', 'read_only'));

create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    auth.jwt() -> 'app_metadata' ->> 'role',
    'user'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role() in ('admin', 'super_admin')
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'super_admin');
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_verify_access_password(p_password text, p_metadata jsonb default '{}'::jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare password_matches boolean;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  -- Keep this comparison behind the RPC boundary so the password is not shipped in the browser bundle.
  password_matches := p_password = 'Sultan@00';
  insert into public.activity_logs(user_id, action, entity_type, description, metadata)
  values (
    auth.uid(),
    'security_event',
    'admin_verification',
    case when password_matches then 'Admin verification succeeded' else 'Admin verification failed' end,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('success', password_matches)
  );
  return password_matches;
end;
$$;

grant execute on function public.admin_verify_access_password(text, jsonb) to authenticated;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.account_status := old.account_status;
    new.email_verified := old.email_verified;
    new.referral_code := old.referral_code;
    new.referred_by := old.referred_by;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields
before update on public.profiles
for each row execute function public.protect_profile_security_fields();

create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'verified_users', (select count(*) from public.profiles where email_verified),
    'active_users', (select count(*) from public.profiles where account_status = 'active'),
    'today_registrations', (select count(*) from public.profiles where created_at >= current_date),
    'today_deposits', coalesce((select sum(amount) from public.deposits where status = 'completed' and processed_at >= current_date), 0),
    'today_withdrawals', coalesce((select sum(amount) from public.withdrawals where status = 'completed' and processed_at >= current_date), 0),
    'today_profit', coalesce((select sum(amount) from public.transactions where type = 'profit' and created_at >= current_date), 0),
    'today_referral_bonus', coalesce((select sum(amount) from public.transactions where type = 'referral' and created_at >= current_date), 0),
    'pending_deposits', (select count(*) from public.deposits where status in ('pending', 'processing')),
    'pending_withdrawals', (select count(*) from public.withdrawals where status in ('pending', 'processing')),
    'total_investments', coalesce((select sum(amount) from public.user_investments where status in ('active', 'processing')), 0),
    'pending_support_tickets', (select count(*) from public.support_tickets where status not in ('completed', 'cancelled', 'inactive')),
    'total_revenue', coalesce((select sum(amount) from public.transactions where type in ('profit', 'bonus')), 0)
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_dashboard_overview() to authenticated;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, email citext, username citext, full_name text, role text, account_status public.account_status, email_verified boolean, created_at timestamptz, main_balance numeric, active_investment numeric)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
  select p.id, p.email, p.username, p.full_name, p.role, p.account_status, p.email_verified, p.created_at,
    coalesce(w.main_balance, 0), coalesce(w.active_investment, 0)
  from public.profiles p left join public.wallets w on w.user_id = p.id
  where nullif(trim(p_search), '') is null
    or p.email::text ilike '%' || trim(p_search) || '%'
    or p.username::text ilike '%' || trim(p_search) || '%'
    or coalesce(p.full_name, '') ilike '%' || trim(p_search) || '%'
  order by p.created_at desc limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
end;
$$;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.account_status)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own account status'; end if;
  update public.profiles set account_status = p_status where id = p_user_id;
  insert into public.activity_logs(user_id, action, entity_type, entity_id, description, metadata)
  values (auth.uid(), 'security_event', 'profile', p_user_id, 'Admin changed account status', jsonb_build_object('status', p_status));
  return found;
end;
$$;
grant execute on function public.admin_set_user_status(uuid, public.account_status) to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'super_admin' then raise exception 'Super admin access required'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role not in ('user', 'admin', 'super_admin', 'moderator', 'support', 'read_only') then raise exception 'Invalid role'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.activity_logs(user_id, action, entity_type, entity_id, description, metadata)
  values (auth.uid(), 'security_event', 'profile', p_user_id, 'Super admin changed role', jsonb_build_object('role', p_role));
  return found;
end;
$$;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

create or replace function public.admin_list_operations(p_status text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'deposits', (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb) from (select d.id, d.user_id, d.amount, d.currency, d.network, d.transaction_hash, d.screenshot_url, d.status, d.admin_note, d.created_at, p.email from public.deposits d join public.profiles p on p.id = d.user_id where p_status is null or d.status::text = p_status limit 100) d),
    'withdrawals', (select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb) from (select w.id, w.user_id, w.amount, w.currency, w.network, w.wallet_address, w.transaction_hash, w.status, w.admin_note, w.created_at, p.email from public.withdrawals w join public.profiles p on p.id = w.user_id where p_status is null or w.status::text = p_status limit 100) w),
    'plans', (select coalesce(jsonb_agg(to_jsonb(ip) order by ip.display_order), '[]'::jsonb) from public.investment_plans ip),
    'wallet_addresses', (select coalesce(jsonb_agg(to_jsonb(wa) order by wa.updated_at desc), '[]'::jsonb) from public.wallet_addresses wa),
    'referrals', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) from public.referrals r limit 100),
    'audit_logs', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) from public.activity_logs a limit 100)
  );
end;
$$;
grant execute on function public.admin_list_operations(text) to authenticated;

create or replace function public.admin_send_notification(p_user_id uuid, p_title text, p_message text, p_type public.notification_type default 'admin', p_action_url text default '/notifications')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare notification_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  insert into public.notifications(user_id, type, title, message, action_url) values (p_user_id, p_type, left(p_title, 160), left(p_message, 2000), p_action_url) returning id into notification_id;
  insert into public.activity_logs(user_id, action, entity_type, entity_id, description) values (auth.uid(), 'support', 'notification', notification_id, 'Admin sent notification');
  return notification_id;
end;
$$;
grant execute on function public.admin_send_notification(uuid, text, text, public.notification_type, text) to authenticated;

-- Only admins can mutate operational tables through the admin RPC boundary.
revoke insert, update, delete on public.investment_plans, public.wallet_addresses, public.market_assets from authenticated;
revoke insert, delete on public.profiles from authenticated;
