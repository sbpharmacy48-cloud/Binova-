import { supabase } from '../supabase/client'
import { getDepositSession } from './deposit'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchCurrentWallet() {
  await getDepositSession()
  const { data, error } = await requireClient().from('wallets').select('main_balance, profit_balance, bonus_balance, referral_balance, pending_deposit, total_deposit').maybeSingle()
  if (error) throw error
  return data
}

export async function fetchUnreadNotificationCount() {
  await getDepositSession()
  const { count, error } = await requireClient().from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  if (error) throw error
  return count ?? 0
}