import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

const transactionSelect = 'id, user_id, type, amount, currency, reference_id, transaction_hash, balance_before, balance_after, description, metadata, created_at, updated_at'
const historySelect = 'id, user_id, wallet_id, deposit_id, withdrawal_id, referral_id, type, amount, balance_before, balance_after, description, created_at'

function makeKey(type, id) {
  return id ? `${type}:${id}` : null
}

function normalizeStatus(status) {
  const value = String(status || 'completed').toLowerCase()
  return value === 'active' ? 'processing' : value
}

function typeLabel(type) {
  return { deposit: 'Deposit', withdrawal: 'Withdrawal', investment: 'Investment', profit: 'Daily Profit', referral: 'Referral Bonus', bonus: 'Bonus', adjustment: 'Wallet Adjustment' }[type] || 'Wallet Activity'
}

function categoryFor(type) {
  if (type === 'deposit') return 'deposits'
  if (type === 'withdrawal') return 'withdrawals'
  if (type === 'investment') return 'investments'
  if (type === 'profit') return 'profits'
  if (type === 'referral') return 'referral'
  return 'all'
}

function buildItem(transaction, sources) {
  const source = sources.get(transaction.reference_id) || null
  const status = normalizeStatus(transaction.metadata?.status || source?.status)
  return {
    id: transaction.id,
    key: makeKey('transaction', transaction.id),
    source: 'transactions',
    type: transaction.type,
    category: categoryFor(transaction.type),
    label: typeLabel(transaction.type),
    amount: Number(transaction.amount || 0),
    currency: transaction.currency || 'USD',
    status,
    createdAt: transaction.created_at,
    completedAt: source?.processed_at || (status === 'completed' ? transaction.updated_at : null),
    transactionHash: transaction.transaction_hash || source?.transaction_hash || null,
    referenceId: transaction.reference_id,
    description: transaction.description || typeLabel(transaction.type),
    metadata: transaction.metadata || {},
    balanceBefore: transaction.balance_before,
    balanceAfter: transaction.balance_after,
    sourceDetails: source,
  }
}

function buildSourceItem(type, source) {
  const status = normalizeStatus(source.status)
  const transactionHash = source.transaction_hash || null
  return {
    id: source.id,
    key: makeKey(type, source.id),
    source: type,
    type,
    category: categoryFor(type),
    label: typeLabel(type),
    amount: Number(source.amount || source.reward_amount || 0),
    currency: source.currency || (type === 'referral' ? 'USD' : 'USDT'),
    status,
    createdAt: source.created_at || source.start_date,
    completedAt: source.processed_at || source.rewarded_at || (status === 'completed' ? source.updated_at : null),
    transactionHash,
    referenceId: source.id,
    description: source.description || `${typeLabel(type)} ${status}`,
    metadata: {},
    balanceBefore: null,
    balanceAfter: null,
    sourceDetails: source,
  }
}

function addIfMissing(items, seen, item) {
  if (!item?.key || seen.has(item.key)) return
  seen.add(item.key)
  items.push(item)
}

export async function fetchHistory() {
  const client = requireClient()
  const [{ data: transactions, error: transactionError }, { data: deposits, error: depositError }, { data: withdrawals, error: withdrawalError }, { data: investments, error: investmentError }, { data: referrals, error: referralError }, { data: walletHistory, error: historyError }] = await Promise.all([
    client.from('transactions').select(transactionSelect).order('created_at', { ascending: false }).limit(200),
    client.from('deposits').select('id, amount, currency, network, wallet_address, transaction_hash, screenshot_url, status, admin_note, created_at, updated_at, processed_at').order('created_at', { ascending: false }).limit(200),
    client.from('withdrawals').select('id, amount, currency, network, wallet_address, transaction_hash, status, admin_note, created_at, updated_at, processed_at').order('created_at', { ascending: false }).limit(200),
    client.from('user_investments').select('id, plan_id, amount, expected_return, current_profit, pending_profit, status, start_date, end_date, created_at, updated_at, investment_plans(name)').order('created_at', { ascending: false }).limit(200),
    client.from('referrals').select('id, parent_user_id, child_user_id, reward_amount, commission, status, rewarded_at, first_deposit_id, created_at, updated_at').order('created_at', { ascending: false }).limit(200),
    client.from('wallet_history').select(historySelect).order('created_at', { ascending: false }).limit(200),
  ])
  const error = [transactionError, depositError, withdrawalError, investmentError, referralError, historyError].find(Boolean)
  if (error) throw error

  const sourceMap = new Map()
  ;(deposits || []).forEach((item) => sourceMap.set(item.id, item))
  ;(withdrawals || []).forEach((item) => sourceMap.set(item.id, item))
  ;(investments || []).forEach((item) => sourceMap.set(item.id, item))
  ;(referrals || []).forEach((item) => sourceMap.set(item.id, item))

  const items = []
  const seen = new Set()
  ;(transactions || []).forEach((transaction) => addIfMissing(items, seen, buildItem(transaction, sourceMap)))
  ;(deposits || []).forEach((item) => { if (!transactions?.some((transaction) => transaction.reference_id === item.id && transaction.type === 'deposit')) addIfMissing(items, seen, buildSourceItem('deposit', item)) })
  ;(withdrawals || []).forEach((item) => { if (!transactions?.some((transaction) => transaction.reference_id === item.id && transaction.type === 'withdrawal')) addIfMissing(items, seen, buildSourceItem('withdrawal', item)) })
  ;(investments || []).forEach((item) => { if (!transactions?.some((transaction) => transaction.reference_id === item.id && transaction.type === 'investment')) addIfMissing(items, seen, buildSourceItem('investment', item)) })
  ;(walletHistory || []).forEach((entry) => {
    const linkedId = entry.deposit_id || entry.withdrawal_id || entry.referral_id
    const linkedType = entry.type === 'profit' ? 'profit' : entry.type === 'referral' ? 'referral' : entry.type === 'deposit' ? 'deposit' : entry.type === 'withdrawal' ? 'withdrawal' : entry.type
    const hasCanonical = (transactions || []).some((transaction) => transaction.reference_id === linkedId && transaction.type === linkedType) || (linkedId && seen.has(makeKey(linkedType, linkedId)))
    if (!hasCanonical) addIfMissing(items, seen, { ...buildSourceItem(linkedType, entry), key: makeKey('wallet-history', entry.id), id: entry.id, source: 'wallet_history', referenceId: linkedId || entry.id, description: entry.description || typeLabel(linkedType), balanceBefore: entry.balance_before, balanceAfter: entry.balance_after })
  })

  return items.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
}

export function subscribeHistory(onChange) {
  const client = requireClient()
  const channel = client.channel('history-live')
  const tables = ['transactions', 'wallet_history', 'deposits', 'withdrawals', 'user_investments', 'referrals', 'notifications']
  tables.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange))
  channel.subscribe()
  return () => client.removeChannel(channel)
}

export { categoryFor, normalizeStatus, typeLabel }
