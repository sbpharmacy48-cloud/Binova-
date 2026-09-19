import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

const pageQueries = {
  wallet: (client) => client.from('wallets').select('main_balance, profit_balance, bonus_balance, referral_balance, locked_balance, pending_deposit, pending_withdrawal, total_deposit, total_withdrawal, total_profit').maybeSingle(),
  transactions: (client) => client.from('transactions').select('id, type, amount, currency, description, transaction_hash, created_at').order('created_at', { ascending: false }).limit(50),
  referral: (client) => Promise.all([client.from('profiles').select('referral_code').maybeSingle(), client.from('referrals').select('child_user_id, commission, status, created_at').order('created_at', { ascending: false })]),
  profile: (client) => client.from('profiles').select('full_name, email, phone, country, referral_code, avatar_url, account_status').maybeSingle(),
  settings: (client) => client.from('user_settings').select('language, currency, theme, email_notifications, push_notifications, marketing_notifications').maybeSingle(),
  rewards: (client) => client.from('wallets').select('profit_balance, bonus_balance, referral_balance, total_profit').maybeSingle(),
  withdraw: (client) => client.from('withdrawals').select('id, amount, currency, network, wallet_address, status, created_at').order('created_at', { ascending: false }).limit(25),
  notifications: (client) => client.from('notifications').select('id, type, title, message, is_read, created_at').order('created_at', { ascending: false }).limit(50),
  help: (client) => client.from('support_tickets').select('id, subject, category, priority, status, created_at').order('created_at', { ascending: false }).limit(25),
}

export async function fetchPageData(page) {
  const query = pageQueries[page]
  if (!query) return { page, data: null }
  const result = await query(requireClient())
  if (Array.isArray(result)) {
    const error = result.find((item) => item.error)?.error
    if (error) throw error
    return { page, data: result.map((item) => item.data) }
  }
  if (result.error) throw result.error
  return { page, data: result.data }
}

export function subscribePage(page, onChange) {
  const client = requireClient()
  const table = page === 'wallet' || page === 'rewards' ? 'wallets' : page === 'transactions' ? 'transactions' : page === 'notifications' ? 'notifications' : page === 'profile' ? 'profiles' : page === 'settings' ? 'user_settings' : page === 'referral' ? 'referrals' : page === 'withdraw' ? 'withdrawals' : page === 'help' ? 'support_tickets' : null
  if (!table) return () => {}
  const channel = client.channel(`page-${page}-live`).on('postgres_changes', { event: '*', schema: 'public', table }, onChange).subscribe()
  return () => client.removeChannel(channel)
}