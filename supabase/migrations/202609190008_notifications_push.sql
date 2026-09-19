-- Notification self-service actions and provider-neutral web push subscriptions.

alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
for delete to authenticated
using (user_id = auth.uid() or public.is_admin());
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
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

do $$ begin
  create trigger set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
