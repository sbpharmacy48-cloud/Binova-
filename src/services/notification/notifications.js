import { supabase } from '../supabase/client'
import { env } from '../../config/env'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchNotifications({ unreadOnly = false } = {}) {
  let query = requireClient().from('notifications').select('id, type, title, message, action_url, is_read, read_at, metadata, created_at').order('created_at', { ascending: false }).limit(100)
  if (unreadOnly) query = query.eq('is_read', false)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function markNotificationRead(id) {
  const { error } = await requireClient().from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead() {
  const { error } = await requireClient().from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('is_read', false)
  if (error) throw error
}

export async function deleteNotification(id) {
  const { error } = await requireClient().from('notifications').delete().eq('id', id)
  if (error) throw error
}

export async function fetchUnreadNotificationCount() {
  const { count, error } = await requireClient().from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

function decodeBase64(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

const publicKey = env.webPushPublicKey

export function getPushSupport() {
  return Boolean(publicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
}

export function getPushPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

async function getRegistration() {
  if (!getPushSupport()) throw new Error('Web Push is not configured for this browser')
  return navigator.serviceWorker.register('/sw.js')
}

async function saveSubscription(subscription) {
  const { data: userData, error: userError } = await requireClient().auth.getUser()
  if (userError) throw userError
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Browser returned an incomplete push subscription')
  const { error } = await requireClient().from('push_subscriptions').upsert({ user_id: userData.user.id, provider: 'web-push', endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_label: navigator.userAgent.slice(0, 120) }, { onConflict: 'provider,endpoint' })
  if (error) throw error
  return subscription
}

export async function syncWebPushSubscription() {
  if (!getPushSupport() || getPushPermission() !== 'granted') return null
  const registration = await getRegistration()
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  await saveSubscription(subscription)
  return subscription
}

export async function enableWebPush() {
  if (!getPushSupport()) throw new Error(publicKey ? 'Push notifications are not supported in this browser' : 'Web Push public key is not configured')
  const permission = getPushPermission() === 'default' ? await Notification.requestPermission() : getPushPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked. Enable them in your browser settings.' : 'Notification permission was not granted')
  const registration = await getRegistration()
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64(publicKey) })
  await saveSubscription(subscription)
  return subscription
}

export function subscribeNotifications(onChange) {
  const channel = requireClient().channel('notifications-live').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange).subscribe()
  return () => requireClient().removeChannel(channel)
}
