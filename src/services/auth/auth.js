import { setRememberMe, supabase } from '../supabase/client'
import { claimSession, releaseSession } from './session'
import { clearAdminVerification } from '../admin/admin'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function signIn({ email, password, rememberMe = true }) {
  setRememberMe(rememberMe)
  const result = await requireClient().auth.signInWithPassword({ email, password })
  if (!result.error && result.data.session) await claimSession()
  return result
}

export async function signUp({ email, password, fullName, username, phone, referralCode }) {
  const result = await requireClient().auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, username, phone: phone || null, referral_code: referralCode || null },
    },
  })
  if (!result.error && result.data.session) await claimSession()
  return result
}

export async function sendPasswordReset(email) {
  return requireClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
}

export async function updatePassword(password) {
  return requireClient().auth.updateUser({ password })
}

export async function ensureUserAccount() {
  const { error } = await requireClient().rpc('ensure_user_account')
  if (error) throw error
}

export async function loadUserAccount() {
  const client = requireClient()
  const [{ data: profile, error: profileError }, { data: wallet, error: walletError }] = await Promise.all([
    client.from('profiles').select('*').maybeSingle(),
    client.from('wallets').select('*').maybeSingle(),
  ])
  if (profileError) throw profileError
  if (walletError) throw walletError
  return { profile, wallet }
}

export async function getCurrentUser() {
  const { data, error } = await requireClient().auth.getUser()
  if (error) throw error
  return data.user
}

export async function sendSocialAuth(provider) {
  return requireClient().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback` } })
}

export async function signOut() {
  clearAdminVerification()
  if (!supabase) return { error: new Error('Supabase is not configured yet.') }
  await releaseSession()
  return supabase.auth.signOut()
}

export async function verifyOtp(email, token) {
  const result = await requireClient().auth.verifyOtp({ email, token, type: 'email' })
  if (!result.error && result.data.session) await claimSession()
  return result
}

export async function resendVerification(email) {
  return requireClient().auth.resend({ type: 'signup', email })
}
