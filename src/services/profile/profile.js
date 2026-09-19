import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchProfileData() {
  const client = requireClient()
  const [{ data: profile, error: profileError }, { data: settings, error: settingsError }, { data: user, error: userError }] = await Promise.all([
    client.from('profiles').select('id, full_name, username, email, phone, country, avatar_url, email_verified, account_status, created_at').maybeSingle(),
    client.from('user_settings').select('language, theme, email_notifications, push_notifications, marketing_notifications').maybeSingle(),
    client.auth.getUser(),
  ])
  if (profileError) throw profileError
  if (settingsError) throw settingsError
  if (userError) throw userError
  return { profile, settings, user: user?.user ?? null }
}

export async function updateProfile(fields) {
  const { data, error } = await requireClient().from('profiles').update(fields).select('id, full_name, username, email, phone, country, avatar_url, email_verified, account_status, created_at').single()
  if (error) throw error
  return data
}

export async function updateProfileSettings(fields) {
  const client = requireClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  const { data, error } = await client.from('user_settings').upsert({ user_id: userData.user.id, ...fields }, { onConflict: 'user_id' }).select('language, theme, email_notifications, push_notifications, marketing_notifications').single()
  if (error) throw error
  return data
}

export async function uploadAvatar(file, userId) {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`
  const client = requireClient()
  const { error: uploadError } = await client.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  const { data } = client.storage.from('avatars').getPublicUrl(path)
  const profile = await updateProfile({ avatar_url: data.publicUrl })
  return profile
}

export async function removeAvatar() {
  const client = requireClient()
  const { data: profile, error: profileError } = await client.from('profiles').select('avatar_url').maybeSingle()
  if (profileError) throw profileError
  const marker = '/storage/v1/object/public/avatars/'
  const path = profile?.avatar_url?.includes(marker) ? profile.avatar_url.split(marker)[1] : null
  if (path) {
    const { error: removeError } = await client.storage.from('avatars').remove([path])
    if (removeError) throw removeError
  }
  return updateProfile({ avatar_url: null })
}

export function subscribeProfile(onChange) {
  const client = requireClient()
  const channel = client.channel('profile-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}
