import { supabase } from '../supabase/client'
import { getDepositSession } from './deposit'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchWalletSystem() {
  const client = requireClient()
  await getDepositSession()
  const [{ data: wallet, error: walletError }, { data: history, error: historyError }, { data: transactions, error: transactionsError }, { data: withdrawals, error: withdrawalsError }, { data: investments, error: investmentsError }, { data: plans, error: plansError }] = await Promise.all([
    client.from('wallets').select('main_balance, profit_balance, bonus_balance, referral_balance, locked_balance, pending_deposit, pending_withdrawal, total_deposit, total_withdrawal, total_profit, total_invested, active_investment, pending_profit, wallet_status').maybeSingle(),
    client.from('wallet_history').select('id, type, amount, balance_before, balance_after, description, created_at').order('created_at', { ascending: false }).limit(30),
    client.from('transactions').select('id, type, amount, currency, reference_id, description, created_at').order('created_at', { ascending: false }).limit(30),
    client.from('withdrawals').select('id, amount, currency, network, wallet_address, status, created_at').order('created_at', { ascending: false }).limit(10),
    client.from('user_investments').select('id, plan_id, amount, expected_return, current_profit, pending_profit, start_date, end_date, status').order('created_at', { ascending: false }),
    client.from('investment_plans').select('id, name, daily_profit_percentage, duration_days').eq('status', 'active'),
  ])
  const error = [walletError, historyError, transactionsError, withdrawalsError, investmentsError, plansError].find(Boolean)
  if (error) throw error
  return { wallet, history: history ?? [], transactions: transactions ?? [], withdrawals: withdrawals ?? [], investments: investments ?? [], plans: plans ?? [] }
}

export async function claimWalletProfit() {
  await getDepositSession()
  const { data, error } = await requireClient().rpc('claim_profit')
  if (error) throw error
  return data
}

export async function requestWalletWithdrawal({ amount, walletAddress, network = 'BEP20', currency = 'USDT' }) {
  await getDepositSession()
  const { data, error } = await requireClient().rpc('request_withdrawal', { p_amount: amount, p_wallet_address: walletAddress, p_network: network, p_currency: currency })
  if (error) throw error
  return data
}

export function subscribeWallet(onChange) {
  const client = requireClient()
  const channel = client.channel('wallet-system-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_history' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_investments' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}