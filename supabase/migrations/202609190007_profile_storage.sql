-- Profile avatar storage and explicit self-service profile/settings policies.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
for select to public
using (bucket_id = 'avatars');

alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

grant select, update on public.profiles to authenticated;

alter table public.user_settings enable row level security;
drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own on public.user_settings
for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own on public.user_settings
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
grant select, update on public.user_settings to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
