import { supabase } from '../supabase/client'
import { getDepositSession } from './deposit'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchWithdrawData() {
  await getDepositSession()
  const client = requireClient()
  const [{ data: wallet, error: walletError }, { data: withdrawals, error: withdrawalsError }] = await Promise.all([
    client.from('wallets').select('main_balance, pending_withdrawal, total_withdrawal').maybeSingle(),
    client.from('withdrawals').select('id, amount, currency, network, wallet_address, status, transaction_hash, admin_note, created_at, processed_at').order('created_at', { ascending: false }).limit(30),
  ])
  if (walletError) throw walletError
  if (withdrawalsError) throw withdrawalsError
  return { wallet, withdrawals: withdrawals ?? [] }
}

export async function requestWithdrawal({ amount, walletAddress }) {
  await getDepositSession()
  const { data, error } = await requireClient().rpc('request_withdrawal', {
    p_amount: amount,
    p_wallet_address: walletAddress,
    p_network: 'BEP20',
    p_currency: 'USDT',
  })
  if (error) throw error
  return data
}

export function subscribeWithdraw(onChange) {
  const client = requireClient()
  const channel = client.channel('withdraw-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_history' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}
