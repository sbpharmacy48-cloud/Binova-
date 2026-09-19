import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Bell, Check, ChevronDown, Globe2, HelpCircle, ImagePlus, KeyRound, LogOut, Mail, Moon, Pencil, Phone, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import { signOut, updatePassword } from '../../services/auth/auth'
import { fetchProfileData, removeAvatar, subscribeProfile, updateProfile, updateProfileSettings, uploadAvatar } from '../../services/profile/profile'
import './ProfilePage.css'

const version = '1.0.0'

function formatDate(value) { return value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'Not available' }
function displayName(profile) { return profile?.full_name || profile?.username || 'Your profile' }

function ProfilePage() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [data, setData] = useState({ profile: null, settings: null, user: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', country: '' })
  const [password, setPassword] = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const next = await fetchProfileData()
      setData(next)
      setForm({ full_name: next.profile?.full_name || '', phone: next.profile?.phone || '', country: next.profile?.country || '' })
      setError('')
    } catch (caught) { setError(caught.message || 'Unable to load profile') } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    let unsubscribe
    try { unsubscribe = subscribeProfile(load) } catch { unsubscribe = undefined }
    return () => { window.clearTimeout(timer); unsubscribe?.() }
  }, [])

  const saveProfile = async (event) => {
    event.preventDefault(); setSaving(true)
    try { const profile = await updateProfile(form); setData((current) => ({ ...current, profile })); setEditing(false); toast.success('Profile updated') } catch (caught) { toast.error(caught.message || 'Unable to update profile') } finally { setSaving(false) }
  }

  const saveSetting = async (fields) => {
    try { const settings = await updateProfileSettings(fields); setData((current) => ({ ...current, settings })) } catch (caught) { toast.error(caught.message || 'Unable to save setting') }
  }

  const handleAvatar = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use PNG, JPG, or WebP')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be smaller than 5MB')
    try { const profile = await uploadAvatar(file, data.user.id); setData((current) => ({ ...current, profile })); toast.success('Profile photo updated') } catch (caught) { toast.error(caught.message || 'Unable to upload photo') }
    event.target.value = ''
  }

  const clearAvatar = async () => { try { const profile = await removeAvatar(); setData((current) => ({ ...current, profile })); toast.success('Profile photo removed') } catch (caught) { toast.error(caught.message || 'Unable to remove photo') } }
  const changePassword = async (event) => { event.preventDefault(); if (password.length < 8 || password !== confirmPassword) return toast.error('Passwords must match and be at least 8 characters'); try { await updatePassword(password); setPassword(''); setConfirmPassword(''); toast.success('Password updated') } catch (caught) { toast.error(caught.message || 'Unable to update password') } }
  const [confirmPassword, setConfirmPassword] = useState('')
  const logout = async () => { await signOut(); navigate('/login', { replace: true }) }
  const profile = data.profile
  const settings = data.settings || {}

  return <main className="profile-shell">
    <header className="profile-header"><Link to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={19} /></Link><div><strong>Profile</strong><small>Account center</small></div><button onClick={() => navigate('/notifications')} aria-label="Notifications"><Bell size={19} /></button></header>
    {error && <div className="profile-error">{error}<button onClick={load}>Retry</button></div>}
    <section className="profile-hero"><div className="profile-avatar-wrap"><div className="profile-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Profile" /> : <span>{displayName(profile).slice(0, 1).toUpperCase()}</span>}</div><button onClick={() => fileRef.current?.click()} aria-label="Change profile photo"><ImagePlus size={15} /></button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} /></div><div className="profile-hero-copy"><h1>{displayName(profile)}</h1><p>@{profile?.username || 'username'}</p><span className="verified-pill">{profile?.email_verified ? <Check size={12} /> : <ShieldCheck size={12} />} {profile?.email_verified ? 'Verified email' : 'Email not verified'}</span><small>Member since {formatDate(profile?.created_at)}</small></div><button className="edit-profile" onClick={() => setEditing(!editing)}><Pencil size={15} /> Edit</button></section>
    {!loading && profile?.avatar_url && <button className="remove-avatar" onClick={clearAvatar}><Trash2 size={14} /> Remove profile photo</button>}
    {editing ? <form className="profile-card profile-form" onSubmit={saveProfile}><div className="card-heading"><div><p>PERSONAL INFORMATION</p><h2>Edit profile</h2></div><UserRound size={18} /></div><label>Full name<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label><label>Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Country<input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="Optional" /></label><button className="gold-button" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></form> : <section className="profile-card"><div className="card-heading"><div><p>PERSONAL INFORMATION</p><h2>Account details</h2></div><UserRound size={18} /></div><div className="detail-row"><span><UserRound size={15} /> Full name</span><b>{profile?.full_name || 'Not set'}</b></div><div className="detail-row"><span><UserRound size={15} /> Username</span><b>@{profile?.username || 'Not set'}</b></div><div className="detail-row"><span><Mail size={15} /> Email</span><b>{profile?.email || data.user?.email || 'Not available'}</b></div><div className="detail-row"><span><Phone size={15} /> Phone</span><b>{profile?.phone || 'Not set'}</b></div><div className="detail-row"><span><Globe2 size={15} /> Country</span><b>{profile?.country || 'Not set'}</b></div></section>}
    <section className="profile-card"><div className="card-heading"><div><p>SECURITY</p><h2>Keep your account safe</h2></div><ShieldCheck size={18} /></div><div className="security-row"><span><ShieldCheck size={16} /> Email verification</span><b className={profile?.email_verified ? 'good' : 'warning'}>{profile?.email_verified ? 'Verified' : 'Pending'}</b></div><div className="security-row"><span><KeyRound size={16} /> Google account</span><b>{data.user?.identities?.some((identity) => identity.provider === 'google') ? 'Connected' : 'Not connected'}</b></div><form className="password-form" onSubmit={changePassword}><label>Change password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" minLength="8" /></label><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" minLength="8" /><button className="outline-button" disabled={!password}>Update password</button></form></section>
    <section className="profile-card"><div className="card-heading"><div><p>APP SETTINGS</p><h2>Your preferences</h2></div><Moon size={18} /></div><div className="setting-row"><span><Moon size={16} /> Dark mode</span><input type="checkbox" checked={settings.theme !== 'light'} onChange={(event) => saveSetting({ theme: event.target.checked ? 'dark' : 'light' })} /></div><div className="setting-row"><span><Bell size={16} /> Notifications</span><input type="checkbox" checked={settings.push_notifications !== false} onChange={(event) => saveSetting({ push_notifications: event.target.checked, email_notifications: event.target.checked })} /></div><label className="language-row"><span><Globe2 size={16} /> Language</span><select value={settings.language || 'en'} onChange={(event) => saveSetting({ language: event.target.value })}><option value="en">English</option><option value="ur">Urdu</option></select><ChevronDown size={15} /></label></section>
    <section className="profile-card support-card"><div className="card-heading"><div><p>SUPPORT</p><h2>Need a hand?</h2></div><HelpCircle size={18} /></div>{['Help Center', 'Contact Support', 'Terms & Conditions', 'Privacy Policy'].map((item) => <button className="support-row" key={item}><span>{item}</span><ChevronDown size={15} /></button>)}<small className="app-version">Binova v{version}</small></section>
    <button className="logout-button" onClick={() => setConfirmLogout(true)}><LogOut size={17} /> Log out</button>
    {confirmLogout && <div className="profile-dialog-backdrop"><div className="profile-dialog"><button className="dialog-close" onClick={() => setConfirmLogout(false)} aria-label="Close"><X size={17} /></button><span className="dialog-icon"><LogOut size={20} /></span><h2>Log out of Binova?</h2><p>Your current session will be closed on this device.</p><div><button className="outline-button" onClick={() => setConfirmLogout(false)}>Cancel</button><button className="logout-button" onClick={logout}>Log out</button></div></div></div>}
  </main>
}

export { ProfilePage }
