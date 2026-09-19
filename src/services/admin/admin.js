import { supabase } from '../supabase/client'

const ADMIN_VERIFICATION_KEY = 'binova_admin_verification'
const ADMIN_VERIFICATION_WINDOW_MS = 15 * 60 * 1000
let verifiedAdminUserId = null

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

function getVerificationState() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(ADMIN_VERIFICATION_KEY) || '{}')
    return {
      failedAttempts: Number(stored.failedAttempts) || 0,
      lockedUntil: Number(stored.lockedUntil) || 0,
    }
  } catch {
    return { failedAttempts: 0, lockedUntil: 0 }
  }
}

function setVerificationState(state) {
  window.sessionStorage.setItem(ADMIN_VERIFICATION_KEY, JSON.stringify(state))
}

function clearVerificationState() {
  verifiedAdminUserId = null
  window.sessionStorage.removeItem(ADMIN_VERIFICATION_KEY)
}

export function isAdminVerified(userId) {
  return Boolean(userId && verifiedAdminUserId === userId)
}

export function clearAdminVerification() {
  clearVerificationState()
}

export function getAdminVerificationStatus() {
  const state = getVerificationState()
  const lockedUntil = state.lockedUntil > Date.now() ? state.lockedUntil : 0
  if (!lockedUntil && state.lockedUntil) setVerificationState({ failedAttempts: 0, lockedUntil: 0 })
  return { failedAttempts: lockedUntil ? 5 : state.failedAttempts, lockedUntil }
}

async function verifyPasswordWithServer(password) {
  const { data, error } = await requireClient().rpc('admin_verify_access_password', {
    p_password: password,
  })
  if (error) throw error
  return data === true
}

export async function verifyAdminAccessPassword({ userId, password }) {
  const state = getAdminVerificationStatus()
  if (state.lockedUntil) return { success: false, lockedUntil: state.lockedUntil }

  const passwordMatches = await verifyPasswordWithServer(password)
  if (passwordMatches) {
    verifiedAdminUserId = userId
    setVerificationState({ failedAttempts: 0, lockedUntil: 0 })
    return { success: true, lockedUntil: 0 }
  }

  const failedAttempts = state.failedAttempts + 1
  const lockedUntil = failedAttempts >= 5 ? Date.now() + ADMIN_VERIFICATION_WINDOW_MS : 0
  setVerificationState({ failedAttempts, lockedUntil })
  return { success: false, failedAttempts, lockedUntil }
}

export async function getAdminAccess() {
  const client = requireClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  const [{ data: roleProfile, error: roleProfileError }, { data: admin }] = await Promise.all([
    client.from('profiles').select('id, full_name, email, role, avatar_url').maybeSingle(),
    client.rpc('is_admin'),
  ])
  const { data: profile } = roleProfileError
    ? await client.from('profiles').select('id, full_name, email, avatar_url').maybeSingle()
    : { data: roleProfile }
  const jwtRole = userData.user?.app_metadata?.role
  const profileRole = roleProfile?.role
  return { user: userData.user, profile: { ...profile, role: profileRole || jwtRole || 'user' }, isAdmin: admin === true || ['admin', 'super_admin'].includes(profileRole) || ['admin', 'super_admin'].includes(jwtRole) }
}

export async function fetchAdminOverview() {
  const { data, error } = await requireClient().rpc('admin_dashboard_overview')
  if (error) throw error
  return data ?? {}
}

export async function fetchAdminOperations(status = null) {
  const { data, error } = await requireClient().rpc('admin_list_operations', { p_status: status })
  if (error) throw error
  return data ?? { deposits: [], withdrawals: [], plans: [], wallet_addresses: [], referrals: [], audit_logs: [] }
}

export async function fetchAdminUsers({ search = '', limit = 50, offset = 0 } = {}) {
  const { data, error } = await requireClient().rpc('admin_list_users', { p_search: search || null, p_limit: limit, p_offset: offset })
  if (error) throw error
  return data ?? []
}

export async function setAdminUserStatus(userId, status) {
  const { error } = await requireClient().rpc('admin_set_user_status', { p_user_id: userId, p_status: status })
  if (error) throw error
}

export async function approveDeposit(id, note = null) {
  const { error } = await requireClient().rpc('approve_deposit', { p_deposit_id: id, p_admin_note: note })
  if (error) throw error
}

export async function processWithdrawal(id, status, transactionHash = null, note = null) {
  const { error } = await requireClient().rpc('process_withdrawal', { p_withdrawal_id: id, p_status: status, p_transaction_hash: transactionHash, p_admin_note: note })
  if (error) throw error
}

export function subscribeAdmin(onChange) {
  const client = requireClient()
  const channel = client.channel('admin-live')
  ;['profiles', 'wallets', 'deposits', 'withdrawals', 'user_investments', 'investment_plans', 'wallet_addresses', 'referrals', 'notifications', 'activity_logs', 'support_tickets'].forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange))
  channel.subscribe()
  return () => client.removeChannel(channel)
}
