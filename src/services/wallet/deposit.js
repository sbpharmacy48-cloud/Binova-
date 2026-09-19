import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function getDepositSession() {
  const client = requireClient()
  const { data, error } = await client.auth.getSession()
  if (error) {
    console.error('[Deposit] Supabase auth.getSession failed.', error)
    throw error
  }
  let session = data.session
  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0
  const refreshRequired = !session || !expiresAt || expiresAt <= Date.now() + 60_000
  console.debug('[Deposit] Current session', {
    userId: session?.user?.id ?? null,
    accessTokenPresent: Boolean(session?.access_token),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    refreshRequired,
  })

  if (refreshRequired) {
    console.debug('[Deposit] Attempting Supabase session refresh', { reason: session ? 'expired_or_expiring' : 'missing_session' })
    const { data: refreshed, error: refreshError } = await client.auth.refreshSession()
    console.debug('[Deposit] Supabase session refresh result', { hasSession: Boolean(refreshed.session), error: refreshError?.message ?? null })
    if (refreshError || !refreshed.session) {
      console.error('[Deposit] Supabase session refresh failed.', refreshError)
      throw refreshError ?? new Error('SESSION_EXPIRED')
    }
    session = refreshed.session
    console.debug('[Deposit] Supabase session refreshed', { userId: session.user.id, accessTokenPresent: Boolean(session.access_token) })
  }

  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) {
    console.error('[Deposit] Supabase auth.getUser failed.', userError)
    throw userError ?? new Error('SESSION_EXPIRED')
  }
  console.debug('[Deposit] Current user', { id: userData.user.id, email: userData.user.email ?? null })
  return session
}

export async function fetchDepositWallet() {
  const { data, error } = await requireClient()
    .from('wallet_addresses')
    .select('*')
    .eq('network', 'BEP20')
    .eq('is_active', true)
    .single()

  if (error) throw error
  return data
}

export async function fetchDepositHistory() {
  await getDepositSession()
  const { data, error } = await requireClient()
    .from('deposits')
    .select('id, amount, currency, network, transaction_hash, status, created_at, wallet_address')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) throw error
  return data ?? []
}

export async function uploadDepositProof(file) {
  const session = await getDepositSession()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`
  const client = requireClient()
  console.debug('[Deposit] Uploading proof image', { path, contentType: file.type, size: file.size })
  const { error: uploadError } = await client.storage.from('deposit-proofs').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error('[Deposit] Deposit proof upload failed.', uploadError)
    throw uploadError
  }
  console.debug('[Deposit] Deposit proof upload completed', { path })
  return path
}

export async function submitDeposit({ amount, transactionHash, walletAddress, screenshotUrl }) {
  const session = await getDepositSession()
  console.debug('[Deposit] Submitting deposit RPC', { userId: session.user.id, amount, walletAddress, hasScreenshot: Boolean(screenshotUrl) })
  const { data, error } = await requireClient().rpc('submit_deposit', {
    p_amount: amount,
    p_transaction_hash: transactionHash,
    p_wallet_address: walletAddress,
    p_screenshot_url: screenshotUrl || null,
    p_network: 'BEP20',
    p_currency: 'USDT',
  })

  if (error) {
    console.error('[Deposit] submit_deposit RPC failed.', error)
    throw error
  }
  console.debug('[Deposit] submit_deposit RPC completed', { depositId: data })
  return data
}

export async function fetchDepositNotificationCount() {
  await getDepositSession()
  const { count, error } = await requireClient().from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

export function subscribeDeposit(onChange) {
  const client = requireClient()
  let channel
  let cancelled = false
  getDepositSession().then(() => {
    if (cancelled) return
    channel = client.channel('deposit-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_addresses' }, onChange)
      .subscribe()
  }).catch(() => {})
  return () => { cancelled = true; if (channel) client.removeChannel(channel) }
}
