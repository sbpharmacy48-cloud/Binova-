import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchReferralOverview() {
  const { data, error } = await requireClient().rpc('get_referral_overview')
  if (error) throw error
  return data ?? { code: '', referrals: [], total_earnings: 0, total_referred: 0, pending_rewards: 0, rewarded_users: 0 }
}

export function subscribeReferral(onChange) {
  const client = requireClient()
  const channel = client.channel('referral-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_history' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}
