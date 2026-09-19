import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Eye, EyeOff, Globe2, LockKeyhole, Mail, ShieldCheck, UserRound, X } from 'lucide-react'
import { FaFacebookF, FaGithub } from 'react-icons/fa'
import { FcGoogle } from 'react-icons/fc'
import { ensureUserAccount, getCurrentUser, loadUserAccount, resendVerification, sendPasswordReset, sendSocialAuth, signIn, signUp, updatePassword, verifyOtp } from '../../services/auth/auth'
import { getAdminAccess } from '../../services/admin/admin'
import { supabase } from '../../services/supabase/client'
import './AuthPages.css'

const ease = [0.22, 1, 0.36, 1]
const loginSchema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(6, 'Password must be at least 6 characters') })
const registerSchema = z.object({ fullName: z.string().min(2, 'Enter your full name'), username: z.string().min(3, 'Choose a username'), email: z.string().email('Enter a valid email address'), phone: z.string().optional(), password: z.string().min(8, 'Use at least 8 characters'), confirmPassword: z.string(), referralCode: z.string().optional(), terms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }) }).refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })
const emailSchema = z.object({ email: z.string().email('Enter a valid email address') })
const passwordSchema = z.object({ password: z.string().min(8, 'Use at least 8 characters'), confirmPassword: z.string() }).refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })

function Brand() {
  return <Link to="/" className="auth-brand"><span className="auth-logo">B</span><span><strong>Binova</strong><small>Invest Today&nbsp; Build A Brighter Tomorrow</small></span></Link>
}

function AuthTop({ back = true }) {
  return <div className="auth-top">{back ? <Link to="/" className="auth-back" aria-label="Back to home"><ArrowLeft size={17} /></Link> : <span />}{!back && <Brand />}<button className="auth-language" type="button"><Globe2 size={14} /> English <ChevronDown size={12} /></button></div>
}

function AuthIllustration({ type = 'globe', asset }) {
  return <div className={`auth-illustration illustration-${type}`} aria-hidden="true"><img src={asset} alt="" className="auth-asset" /><div className="illustration-overlay" /></div>
}

function Field({ label, icon: Icon, error, type = 'text', ...props }) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  return <label className="auth-field"><span>{label}</span><div className="field-control"><Icon size={17} /><input type={isPassword && visible ? 'text' : type} {...props} />{isPassword && <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>}</div>{error && <em>{error.message}</em>}</label>
}

function SocialButtons() {
  const [error, setError] = useState('')
  const social = [{ id: 'google', label: 'Continue with Google', icon: FcGoogle }, { id: 'github', label: 'Continue with GitHub', icon: FaGithub }, { id: 'facebook', label: 'Continue with Facebook', icon: FaFacebookF }]
  return <div className="social-area"><div className="or-divider"><span>or continue with</span></div>{social.map((item) => { const Icon = item.icon; return <button className="social-button" type="button" key={item.id} onClick={async () => { setError(''); try { const { error: authError } = await sendSocialAuth(item.id); if (authError) setError(authError.message) } catch (caught) { setError(caught.message) } }}><Icon className={`social-mark ${item.id}`} aria-hidden="true" />{item.label}</button> })}{error && <p className="auth-error">{error}</p>}</div>
}

function AuthButton({ children, loading }) {
  return <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait...' : <>{children} <ArrowRight size={17} /></>}</button>
}

function AuthMessage({ type = 'success', children }) {
  return <div className={`auth-message ${type}`} role="status">{type === 'success' ? <Check size={16} /> : <X size={16} />}{children}</div>
}

function AuthFooter() {
  return <div className="auth-footer"><span><ShieldCheck size={14} /> Secure</span><span><ArrowRight size={14} /> Fast</span><span><UserRound size={14} /> Trusted</span></div>
}

function AuthFrame({ children, illustration = 'globe', asset = '/login.png', title, subtitle, compact = false }) {
  return <motion.div className={`auth-page ${compact ? 'compact' : ''}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, ease }}><AuthTop /><Brand /><AuthIllustration type={illustration} asset={asset} /><div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}</motion.div>
}

export function LoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', rememberMe: true } })
  const submit = async (values) => { setLoading(true); setError(''); try { const { error: authError } = await signIn(values); if (authError) setError(authError.message); else { console.log('[Auth] Session after login', await supabase?.auth.getSession()); await ensureUserAccount(); await loadUserAccount(); const { isAdmin } = await getAdminAccess(); toast.success('Welcome back to Binova'); navigate(isAdmin ? '/admin' : '/dashboard') } } catch (caught) { setError(caught.message); toast.error(caught.message || 'Unable to sign in') } finally { setLoading(false) } }
  return <AuthFrame title={<>Welcome <strong>Back</strong></>} subtitle="Log in to your account and continue your investment journey."><form className="auth-form" onSubmit={handleSubmit(submit)}><Field label="Email Address" icon={Mail} placeholder="Enter your email" autoComplete="email" error={errors.email} {...register('email')} /><Field label="Password" icon={LockKeyhole} type="password" placeholder="Enter your password" autoComplete="current-password" error={errors.password} {...register('password')} /><div className="form-options"><label className="check-label"><input type="checkbox" {...register('rememberMe')} /> <span>Remember me</span></label><Link to="/forgot-password">Forgot password?</Link></div>{error && <AuthMessage type="error">{error}</AuthMessage>}<AuthButton loading={loading}>Sign in</AuthButton></form><SocialButtons /><p className="auth-switch">Don&apos;t have an account? <Link to="/register">Sign up</Link></p><AuthFooter /></AuthFrame>
}

export function RegisterPage() {
  const navigate = useNavigate(); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const [referralCode] = useState(() => { const params = new URLSearchParams(window.location.search); const fromUrl = params.get('ref')?.trim().toUpperCase(); if (fromUrl) { window.localStorage.setItem('binova.referral_code', fromUrl); return fromUrl } return window.localStorage.getItem('binova.referral_code') || '' })
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(registerSchema), defaultValues: { referralCode } })
  const submit = async (values) => { setLoading(true); setError(''); try { const { data, error: authError } = await signUp(values); if (authError) setError(authError.message); else { window.localStorage.removeItem('binova.referral_code'); toast.success('Account created. Check your email to verify it.'); navigate(data.session ? '/dashboard' : `/verify-email?email=${encodeURIComponent(values.email)}`) } } catch (caught) { setError(caught.message); toast.error(caught.message || 'Unable to create account') } finally { setLoading(false) } }
  return <AuthFrame asset="/signin.png" title={<>Create <strong>Account</strong></>} subtitle="Join thousands of investors and start your journey today."><form className="auth-form register-form" onSubmit={handleSubmit(submit)}><div className="field-grid"><Field label="Full Name" icon={UserRound} placeholder="Enter your full name" error={errors.fullName} {...register('fullName')} /><Field label="Username" icon={UserRound} placeholder="Choose a username" error={errors.username} {...register('username')} /></div><Field label="Email Address" icon={Mail} placeholder="Enter your email" error={errors.email} {...register('email')} /><Field label="Phone Number (optional)" icon={Globe2} placeholder="Enter phone number" error={errors.phone} {...register('phone')} /><div className="field-grid"><Field label="Password" icon={LockKeyhole} type="password" placeholder="Create a password" error={errors.password} {...register('password')} /><Field label="Confirm Password" icon={LockKeyhole} type="password" placeholder="Confirm password" error={errors.confirmPassword} {...register('confirmPassword')} /></div><Field label="Referral Code (optional)" icon={ArrowRight} placeholder="Enter referral code" error={errors.referralCode} {...register('referralCode')} /><label className="check-label terms"><input type="checkbox" {...register('terms')} /> <span>I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a></span></label>{errors.terms && <em className="form-error">{errors.terms.message}</em>}{error && <AuthMessage type="error">{error}</AuthMessage>}<AuthButton loading={loading}>Create account</AuthButton></form><SocialButtons /><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></AuthFrame>
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(emailSchema) })
  const submit = async ({ email }) => { setLoading(true); setError(''); try { const { error: authError } = await sendPasswordReset(email); if (authError) setError(authError.message); else { setSent(true); toast.success('Password reset email sent') } } catch (caught) { setError(caught.message); toast.error(caught.message || 'Unable to send reset email') } finally { setLoading(false) } }
  return <AuthFrame illustration="lock" asset="/forget.png" title={<>Forgot <strong>Password?</strong></>} subtitle="No worries! Enter your email address and we&apos;ll send you a reset link."><form className="auth-form" onSubmit={handleSubmit(submit)}><Field label="Email Address" icon={Mail} placeholder="Enter your email" error={errors.email} {...register('email')} />{sent && <AuthMessage>Check your email for a secure reset link.</AuthMessage>}{error && <AuthMessage type="error">{error}</AuthMessage>}<AuthButton loading={loading}>Send reset link</AuthButton></form><Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link><div className="security-note"><ShieldCheck size={22} /><span><strong>Your security matters</strong><small>We use industry-standard encryption to keep you protected.</small></span></div></AuthFrame>
}

export function ResetPasswordPage() {
  const navigate = useNavigate(); const [saved, setSaved] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(passwordSchema) })
  const submit = async ({ password }) => { setLoading(true); try { const { error: authError } = await updatePassword(password); if (authError) setError(authError.message); else { setSaved(true); toast.success('Password updated successfully'); window.setTimeout(() => navigate('/login'), 900) } } catch (caught) { setError(caught.message); toast.error(caught.message || 'Unable to update password') } finally { setLoading(false) } }
  return <AuthFrame illustration="lock" asset="/signin.png" title={<>Set a new <strong>Password</strong></>} subtitle="Choose a strong password to keep your Binova account secure."><form className="auth-form" onSubmit={handleSubmit(submit)}><Field label="New Password" icon={LockKeyhole} type="password" placeholder="Enter new password" error={errors.password} {...register('password')} /><Field label="Confirm Password" icon={LockKeyhole} type="password" placeholder="Confirm new password" error={errors.confirmPassword} {...register('confirmPassword')} />{saved && <AuthMessage>Password updated successfully.</AuthMessage>}{error && <AuthMessage type="error">{error}</AuthMessage>}<AuthButton loading={loading}>Save password</AuthButton></form><button className="back-link back-button" type="button" onClick={() => navigate('/login')}><ArrowLeft size={15} /> Back to sign in</button></AuthFrame>
}

export function VerifyEmailPage() {
  const params = new URLSearchParams(window.location.search); const email = params.get('email') || ''
  const [seconds, setSeconds] = useState(45); const [sent, setSent] = useState(false); const [verified, setVerified] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (seconds <= 0) return undefined; const timer = window.setInterval(() => setSeconds((current) => current - 1), 1000); return () => window.clearInterval(timer) }, [seconds])
  useEffect(() => { const checkVerification = async () => { try { const user = await getCurrentUser(); if (user?.email_confirmed_at) { setVerified(true); toast.success('Email verified') } } catch { /* A confirmation session may not exist until the email link is opened. */ } }; checkVerification(); const timer = window.setInterval(checkVerification, 5000); return () => window.clearInterval(timer) }, [])
  const resend = async () => { setError(''); try { const { error: authError } = await resendVerification(email); if (authError) setError(authError.message); else { setSent(true); setSeconds(45); toast.success('Verification email sent again') } } catch (caught) { setError(caught.message); toast.error(caught.message || 'Unable to resend verification email') } }
  return <AuthFrame illustration="mail" title={<>Check your <strong>email</strong></>} subtitle={<>We sent a verification link to<br /><b>{email || 'your email address'}</b></>}><div className="verification-panel">{verified && <AuthMessage>Email verified successfully.</AuthMessage>}{sent && !verified && <AuthMessage>Verification email sent again.</AuthMessage>}<button className="auth-submit" type="button" onClick={resend} disabled={seconds > 0 || verified}>{seconds > 0 ? `Resend in 00:${String(seconds).padStart(2, '0')}` : verified ? 'Email verified' : 'Resend email'} <ArrowRight size={17} /></button>{error && <p className="auth-error">{error}</p>}</div><Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link></AuthFrame>
}

export function VerifyOtpPage() {
  const params = new URLSearchParams(window.location.search); const email = params.get('email') || ''
  const [otp, setOtp] = useState(['', '', '', '', '', '']); const [seconds, setSeconds] = useState(60); const [error, setError] = useState(''); const navigate = useNavigate()
  useEffect(() => { if (seconds <= 0) return undefined; const timer = window.setInterval(() => setSeconds((current) => current - 1), 1000); return () => window.clearInterval(timer) }, [seconds])
  const updateOtp = (index, value) => { const digits = value.replace(/\D/g, '').slice(-1); const next = [...otp]; next[index] = digits; setOtp(next); if (digits && index < 5) document.querySelector(`[data-otp="${index + 1}"]`)?.focus() }
  const submit = async (event) => { event.preventDefault(); setError(''); try { const { error: authError } = await verifyOtp(email, otp.join('')); if (authError) setError(authError.message); else { toast.success('Verification complete'); navigate('/dashboard') } } catch (caught) { setError(caught.message); toast.error(caught.message || 'Unable to verify code') } }
  return <AuthFrame illustration="mail" title={<>Enter <strong>verification code</strong></>} subtitle={<>We sent a 6-digit code to<br /><b>{email || 'your email address'}</b></>}><form className="otp-form" onSubmit={submit}><div className="otp-inputs">{otp.map((digit, index) => <input key={index} data-otp={index} value={digit} onChange={(event) => updateOtp(index, event.target.value)} onPaste={(event) => { event.preventDefault(); const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split(''); setOtp([...pasted, ...Array(6 - pasted.length).fill('')]); }} inputMode="numeric" maxLength="1" aria-label={`Digit ${index + 1}`} autoFocus={index === 0} />)}</div><span className="otp-countdown">Code expires in 00:{String(seconds).padStart(2, '0')}</span>{error && <AuthMessage type="error">{error}</AuthMessage>}<AuthButton>Verify code</AuthButton></form><button className="back-link back-button" type="button" onClick={() => setSeconds(60)} disabled={seconds > 0}><ArrowRight size={15} /> Resend code</button><Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link></AuthFrame>
}
