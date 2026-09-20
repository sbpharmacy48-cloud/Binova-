import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase/client'
import { AuthLayout } from '../layouts/AuthLayout/AuthLayout'
import { MobileLayout } from '../layouts/MobileLayout/MobileLayout'
import { LandingPage } from '../pages/Landing/LandingPage'
import { ForgotPasswordPage, LoginPage, OAuthCallbackPage, RegisterPage, ResetPasswordPage, VerifyEmailPage, VerifyOtpPage } from '../pages/Auth/AuthPages'
import { FoundationPage } from '../pages/PageFactory'
import { DashboardPage } from '../pages/Dashboard/DashboardPage'
import { InvestmentPage } from '../pages/Investment/InvestmentPage'
import { DepositPage } from '../pages/Deposit/DepositPage'
import { WalletPage } from '../pages/Wallet/WalletPage'
import { ReferralPage } from '../pages/Referral/ReferralPage'
import { WithdrawPage } from '../pages/Withdraw/WithdrawPage'
import { ProfilePage } from '../pages/Profile/ProfilePage'
import { NotificationsPage } from '../pages/Notifications/NotificationsPage'
import { HistoryPage } from '../pages/History/HistoryPage'
import { AdminPage } from '../pages/Admin/AdminPage'
import { AdminVerificationPage } from '../pages/Admin/AdminVerificationPage'
import { clearAdminVerification, getAdminAccess, isAdminVerified } from '../services/admin/admin'

const pages = {
  dashboard: ['Dashboard', 'Your personal crypto command center is ready for the next layer.'],
  investment: ['Investment', 'Investment plans, performance, and portfolio intelligence will live here.'],
  deposit: ['Deposit', 'Funding flows and deposit methods are reserved for this module.'],
  withdraw: ['Withdraw', 'Secure withdrawal journeys will be built in this module.'],
  rewards: ['Rewards', 'Your loyalty and yield rewards experience will land here.'],
  referral: ['Referral', 'Invite, track, and earn tools will be connected here.'],
  wallet: ['Wallet', 'Assets, balances, and activity will be composed here.'],
  profile: ['Profile', 'Identity, verification, and personal preferences will live here.'],
  settings: ['Settings', 'Security and application settings will be composed here.'],
  notifications: ['Notifications', 'Important account and market updates will arrive here.'],
  help: ['Help Center', 'Guidance and support journeys will be added here.'],
}

function Placeholder({ page }) {
  const [title, description] = pages[page]
  return <FoundationPage page={page} title={title} description={description} />
}

function RequireAuth({ children }) {
  const location = useLocation()
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let active = true
    supabase?.auth.getSession().then(({ data: { session } }) => {
      if (active) setStatus(session ? 'authenticated' : 'anonymous')
    }).catch(() => {
      if (active) setStatus('anonymous')
    })
    return () => { active = false }
  }, [location.pathname])

  if (status === 'checking') return null
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

function RequireAdmin({ children }) {
  const location = useLocation()
  const [status, setStatus] = useState('checking')
  const [access, setAccess] = useState(null)
  useEffect(() => {
    let active = true
    getAdminAccess().then((nextAccess) => {
      if (!active) return
      if (!nextAccess.isAdmin) { setStatus('forbidden'); return }
      setAccess(nextAccess)
      setStatus(isAdminVerified(nextAccess.user?.id) ? 'authorized' : 'verification-required')
    }).catch(() => { if (active) setStatus('forbidden') })
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearAdminVerification()
        if (active) setStatus('forbidden')
      }
    })
    return () => { active = false; subscription?.data?.subscription?.unsubscribe() }
  }, [location.pathname])
  if (status === 'checking') return null
  if (status === 'forbidden') return <Navigate to="/dashboard" replace />
  if (status === 'verification-required') return <AdminVerificationPage access={access} onVerified={() => setStatus('authorized')} />
  return children
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/investment" element={<RequireAuth><InvestmentPage /></RequireAuth>} />
      <Route path="/deposit" element={<RequireAuth><DepositPage /></RequireAuth>} />
      <Route path="/wallet" element={<RequireAuth><WalletPage /></RequireAuth>} />
      <Route path="/referral" element={<RequireAuth><ReferralPage /></RequireAuth>} />
      <Route path="/withdraw" element={<RequireAuth><WithdrawPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route path="/transactions" element={<RequireAuth><HistoryPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminPage /></RequireAdmin></RequireAuth>} />
      <Route element={<AuthLayout />}>
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/signup" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
      </Route>
      <Route element={<MobileLayout />}>
        {Object.keys(pages).filter((page) => page !== 'dashboard' && page !== 'investment' && page !== 'deposit' && page !== 'wallet' && page !== 'referral' && page !== 'withdraw' && page !== 'profile' && page !== 'notifications').map((page) => <Route key={page} path={`/${page}`} element={<RequireAuth><Placeholder page={page} /></RequireAuth>} />)}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
