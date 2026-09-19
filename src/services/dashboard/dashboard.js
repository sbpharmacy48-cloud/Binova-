import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchDashboardData() {
  const client = requireClient()
  const [{ data: profile, error: profileError }, { data: wallet, error: walletError }, { data: investments, error: investmentsError }, { data: plans, error: plansError }, { data: deposits, error: depositsError }, { data: withdrawals, error: withdrawalsError }, { data: transactions, error: transactionsError }, { data: referrals, error: referralsError }, { count: notificationsCount, error: notificationsError }] = await Promise.all([
    client.from('profiles').select('full_name, avatar_url, referral_code').maybeSingle(),
    client.from('wallets').select('main_balance, profit_balance, referral_balance, pending_deposit, total_profit, total_deposit').maybeSingle(),
    client.from('user_investments').select('id, amount, expected_return, current_profit, start_date, end_date, status, plan_id').in('status', ['active', 'processing', 'pending']).order('created_at', { ascending: false }).limit(3),
    client.from('investment_plans').select('id, name, daily_profit_percentage, duration_days, description').eq('status', 'active'),
    client.from('deposits').select('id, amount, currency, network, status, created_at').order('created_at', { ascending: false }).limit(3),
    client.from('withdrawals').select('id, amount, currency, network, status, created_at').order('created_at', { ascending: false }).limit(3),
    client.from('transactions').select('id, type, amount, currency, description, created_at').order('created_at', { ascending: false }).limit(5),
    client.from('referrals').select('id, commission, status').limit(100),
    client.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])

  const firstError = [profileError, walletError, investmentsError, plansError, depositsError, withdrawalsError, transactionsError, referralsError, notificationsError].find(Boolean)
  if (firstError) throw firstError
  return { profile, wallet, investments: investments ?? [], plans: plans ?? [], deposits: deposits ?? [], withdrawals: withdrawals ?? [], transactions: transactions ?? [], referrals: referrals ?? [], unreadNotifications: notificationsCount ?? 0 }
}

export function subscribeDashboard(onChange) {
  const client = requireClient()
  const channel = client.channel('dashboard-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_investments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}