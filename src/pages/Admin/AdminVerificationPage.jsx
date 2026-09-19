import { useEffect, useState } from 'react'
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../services/auth/auth'
import { getAdminVerificationStatus, verifyAdminAccessPassword } from '../../services/admin/admin'
import './AdminVerificationPage.css'

function formatLockout(lockedUntil) {
  const remainingSeconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = String(remainingSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function AdminVerificationPage({ access, onVerified }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(() => getAdminVerificationStatus())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!status.lockedUntil) return undefined
    const timer = window.setInterval(() => setStatus(getAdminVerificationStatus()), 1000)
    return () => window.clearInterval(timer)
  }, [status.lockedUntil])

  const locked = Boolean(status.lockedUntil)

  const submit = async (event) => {
    event.preventDefault()
    if (loading || locked || !password) return
    setLoading(true)
    setError('')
    try {
      const result = await verifyAdminAccessPassword({ userId: access.user.id, password })
      setPassword('')
      setStatus(getAdminVerificationStatus())
      if (result.success) onVerified()
      else if (result.lockedUntil) setError('Too many failed attempts. Access is temporarily locked.')
      else setError('That password is incorrect.')
    } catch (caught) {
      setError(caught.message || 'Verification could not be completed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return <main className="admin-verification-page">
    <section className="admin-verification-card" aria-labelledby="admin-verification-title">
      <div className="admin-verification-mark"><ShieldCheck size={27} /></div>
      <p className="admin-verification-eyebrow">BINOVA ADMIN CONTROL</p>
      <h1 id="admin-verification-title">Admin Verification</h1>
      <p className="admin-verification-copy">Confirm your admin access password before entering the control center.</p>
      <div className="admin-verification-identity"><span>{access.profile?.full_name || access.user.email}</span><strong>{access.profile?.role || 'admin'}</strong></div>
      <form onSubmit={submit} className="admin-verification-form">
        <label htmlFor="admin-access-password">Admin Access Password</label>
        <div className="admin-verification-input-wrap"><LockKeyhole size={17} /><input id="admin-access-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" autoFocus disabled={loading || locked} placeholder="Enter access password" /></div>
        {error && <p className="admin-verification-error" role="alert">{error}</p>}
        {locked && <p className="admin-verification-lockout" role="status">Try again in {formatLockout(status.lockedUntil)}</p>}
        <button className="admin-verification-submit" type="submit" disabled={loading || locked || !password}>{loading ? 'Verifying...' : locked ? 'Access temporarily locked' : 'Verify and continue'}</button>
      </form>
      <button className="admin-verification-logout" type="button" onClick={logout}><LogOut size={15} /> Sign out</button>
      <small className="admin-verification-note">This verification expires with your session or browser window.</small>
    </section>
  </main>
}
