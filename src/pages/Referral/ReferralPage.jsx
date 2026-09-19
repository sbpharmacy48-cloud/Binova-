import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Check, Copy, Gift, Search, Share2, UsersRound } from 'lucide-react'
import { fetchReferralOverview, subscribeReferral } from '../../services/referral/referrals'
import './ReferralPage.css'

const filters = ['all', 'pending', 'qualified', 'rewarded']

function maskEmail(email = '') {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}${name.length > 2 ? '***' : '*'}@${domain}`
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'Awaiting deposit'
}

function ReferralPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [qrCode, setQrCode] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try { setData(await fetchReferralOverview()) } catch (caught) { setError(caught.message || 'Unable to load referrals') } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    const unsubscribe = subscribeReferral(load)
    return () => { window.clearTimeout(timer); unsubscribe() }
  }, [])

  const referralLink = data?.code ? `${window.location.origin}/signup?ref=${encodeURIComponent(data.code)}` : ''
  useEffect(() => {
    if (!referralLink) return undefined
    let active = true
    QRCode.toDataURL(referralLink, { width: 160, margin: 1, color: { dark: '#101318', light: '#f5c542' } }).then((value) => { if (active) setQrCode(value) }).catch(() => setQrCode(''))
    return () => { active = false }
  }, [referralLink])

  const referrals = useMemo(() => (data?.referrals || []).filter((item) => {
    const matchesFilter = filter === 'all' || item.status === filter
    const query = search.trim().toLowerCase()
    return matchesFilter && (!query || item.username.toLowerCase().includes(query) || item.email.toLowerCase().includes(query) || data?.code?.toLowerCase().includes(query))
  }), [data, filter, search])

  const copy = async (value, message) => { await navigator.clipboard?.writeText(value); toast.success(message) }
  const share = async () => { if (navigator.share) await navigator.share({ title: 'Join Binova', text: 'Join me on Binova', url: referralLink }); else await copy(referralLink, 'Referral link copied') }

  return <main className="referral-shell">
    <header className="referral-header"><Link to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={19} /></Link><div><span>BINOVA</span><small>Referral center</small></div><Gift size={19} /></header>
    <section className="referral-hero"><p className="referral-overline">GROW TOGETHER</p><h1>Share the upside.</h1><p>Earn a $1 reward when a friend completes their first deposit.</p></section>
    <section className="referral-stats">{[['Total earnings', `$${Number(data?.total_earnings || 0).toFixed(2)}`, 'gold'], ['Referred users', data?.total_referred || 0, 'blue'], ['Pending rewards', data?.pending_rewards || 0, 'violet'], ['Rewarded users', data?.rewarded_users || 0, 'mint']].map(([label, value, tone]) => <article key={label}><span className={`referral-stat-icon ${tone}`}>{tone === 'blue' ? <UsersRound size={16} /> : <Gift size={16} />}</span><small>{label}</small><strong>{loading ? '...' : value}</strong></article>)}</section>
    <section className="referral-link-card"><div><p className="referral-overline">YOUR INVITE</p><h2>Bring your circle</h2><p>One reward per referred user, after their first completed deposit.</p></div><div className="referral-code-row"><strong>{data?.code || 'Loading...'}</strong><button onClick={() => copy(data?.code || '', 'Referral code copied')} aria-label="Copy referral code"><Copy size={16} /></button></div><div className="referral-url-row"><span>{referralLink || 'Preparing link...'}</span><button onClick={() => copy(referralLink, 'Referral link copied')} aria-label="Copy referral link"><Copy size={16} /></button></div><div className="referral-actions"><button onClick={share}><Share2 size={16} /> Share link</button>{qrCode && <img src={qrCode} alt="Referral QR code" />}</div></section>
    <section className="referral-list-section"><div className="referral-section-heading"><div><p className="referral-overline">YOUR NETWORK</p><h2>Referral activity</h2></div><span>{referrals.length}</span></div><label className="referral-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or email" /></label><div className="referral-filters">{filters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>{error && <div className="referral-error">{error}<button onClick={load}>Retry</button></div>}{!loading && !referrals.length ? <div className="referral-empty">No referrals match this view.</div> : <div className="referral-list">{referrals.map((item) => <article className="referral-person" key={item.id}><span className="referral-avatar">{item.username.slice(0, 1).toUpperCase()}</span><div className="referral-person-main"><strong>{item.username}</strong><small>{maskEmail(item.email)} · Joined {formatDate(item.joined_at)}</small>{item.first_deposit_amount ? <small>First deposit ${Number(item.first_deposit_amount).toFixed(2)}</small> : <small>First deposit pending</small>}</div><div className={`referral-status ${item.status}`}><span>{item.status === 'rewarded' ? <Check size={12} /> : null}{item.status}</span><b>{item.bonus_amount ? `+$${Number(item.bonus_amount).toFixed(2)}` : '$0.00'}</b></div></article>)}</div>}</section>
  </main>
}

export { ReferralPage }
