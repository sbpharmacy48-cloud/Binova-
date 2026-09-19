import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Chart from 'react-apexcharts'
import { supabase } from '../../services/supabase/client'
import { fetchDashboardData, subscribeDashboard } from '../../services/dashboard/dashboard'
import { LiveMarketWidget } from '../../components/markets/LiveMarketWidget'
import { getAdminAccess } from '../../services/admin/admin'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Gift,
  History,
  LayoutGrid,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  WalletCards,
} from 'lucide-react'
import './DashboardPage.css'

const actions = [
  { label: 'Deposit', icon: ArrowDownToLine, tone: 'gold' },
  { label: 'Withdraw', icon: ArrowUpRight, tone: 'blue' },
  { label: 'Invest', icon: TrendingUp, tone: 'mint' },
  { label: 'History', icon: History, tone: 'violet' },
]

const chartOptions = {
  chart: { type: 'area', toolbar: { show: false }, sparkline: { enabled: true }, animations: { enabled: true, speed: 900 } },
  stroke: { curve: 'smooth', width: 3, colors: ['#f5c542'] },
  fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.34, opacityTo: 0.02, stops: [0, 100], colorStops: [] } },
  colors: ['#f5c542'],
  dataLabels: { enabled: false },
  grid: { show: false },
  xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  yaxis: { min: 0 },
  tooltip: { theme: 'dark', x: { show: false }, y: { formatter: (value) => `$${value.toLocaleString()}` } },
}

function BrandMark() {
  return <img className="brand-mark" src="/binova-mark.svg" alt="BINOVA logo" />
}

function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [range, setRange] = useState('7D')
  const [activeTab, setActiveTab] = useState('Home')
  const [copied, setCopied] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = async () => { setLoading(true); setError(''); try { if (!supabase) throw new Error('Supabase is not configured yet.'); const { data: { session } } = await supabase.auth.getSession(); if (!session) { setData(null); setLoading(false); return } setData(await fetchDashboardData()) } catch (caught) { setError(caught.message || 'Unable to load dashboard data') } finally { setLoading(false) } }
  useEffect(() => { const timer = window.setTimeout(() => load(), 0); let unsubscribe; try { unsubscribe = subscribeDashboard(load) } catch { unsubscribe = undefined } return () => { window.clearTimeout(timer); unsubscribe?.() } }, [])
  useEffect(() => { getAdminAccess().then(({ isAdmin: admin }) => setIsAdmin(admin)).catch(() => setIsAdmin(false)) }, [])
  const wallet = data?.wallet
  const stats = [
    { label: 'Active investments', amount: data ? `$${data.investments.reduce((total, item) => total + Number(item.amount || 0), 0).toFixed(2)}` : '—', trend: `${data?.investments.length || 0} active`, icon: TrendingUp, tone: 'gold' },
    { label: 'Total profit', amount: data ? `$${Number(wallet?.total_profit || 0).toFixed(2)}` : '—', trend: 'Live', icon: Sparkles, tone: 'mint' },
    { label: 'Referral earnings', amount: data ? `$${data.referrals.reduce((total, item) => total + Number(item.commission || 0), 0).toFixed(2)}` : '—', trend: `${data?.referrals.length || 0} referrals`, icon: Gift, tone: 'violet' },
    { label: 'Available balance', amount: data ? `$${Number(wallet?.main_balance || 0).toFixed(2)}` : '—', trend: 'Live', icon: WalletCards, tone: 'blue' },
  ]
  const activities = (data?.transactions || []).slice(0, 3).map((item) => ({ title: item.description || item.type, detail: item.currency, date: new Date(item.created_at).toLocaleDateString(), amount: `${item.type === 'withdrawal' || item.type === 'investment' ? '-' : '+'}$${Number(item.amount || 0).toFixed(2)}`, icon: item.type === 'deposit' ? ArrowDownToLine : item.type === 'profit' ? TrendingUp : Sparkles, tone: item.type === 'deposit' ? 'blue' : item.type === 'profit' ? 'mint' : 'gold' }))

  function copyReferralCode() {
    navigator.clipboard?.writeText(data?.profile?.referral_code || '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <main className="dashboard-shell">
      <div className="gold-particle particle-one" />
      <div className="gold-particle particle-two" />
      <header className="dashboard-header">
        <div className="brand-lockup"><BrandMark /><span>BINOVA</span></div>
        <div className="header-actions">
          {isAdmin && <button className="icon-button" onClick={() => navigate('/admin')} aria-label="Open admin panel"><ShieldCheck size={20} strokeWidth={1.8} /></button>}
          <button className="icon-button notification-button" onClick={() => navigate('/notifications')} aria-label="Notifications"><Bell size={20} strokeWidth={1.8} />{data?.unreadNotifications > 0 && <span>{data.unreadNotifications > 99 ? '99+' : data.unreadNotifications}</span>}</button>
          <button className="avatar-button" onClick={() => navigate('/profile')} aria-label="Open profile">{data?.profile?.avatar_url ? <img src={data.profile.avatar_url} alt="Profile" /> : <span>{(data?.profile?.full_name || 'H').slice(0, 1).toUpperCase()}</span>}</button>
        </div>
      </header>

      <section className="welcome-copy page-enter">
        <p className="overline">SATURDAY, SEPTEMBER 19</p>
        <h1>Good morning, <em>{data?.profile?.full_name || 'there'}</em></h1>
        <p className="subtle-copy">Your wealth is moving in the right direction.</p>
      </section>

      <motion.section className="balance-card glass-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div className="balance-card-glow" />
        <div className="balance-topline"><span>Total portfolio balance</span><button className="minimal-button" onClick={() => setBalanceVisible(!balanceVisible)} aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}>{balanceVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button></div>
        <strong>{balanceVisible ? `$${Number((wallet?.main_balance || 0) + (wallet?.profit_balance || 0)).toFixed(2)}` : '••••••••'}</strong>
        <div className="balance-footer"><span className="positive-dot" /> <span>Live wallet balance</span><span className="balance-percent">{data?.unreadNotifications || 0} alerts</span></div>
        <div className="balance-sparkline"><i /><i /><i /><i /><i /><i /><i /></div>
      </motion.section>

      <section className="quick-actions">
        {actions.map(({ label, icon: Icon, tone }, index) => <motion.button key={label} className="quick-action" onClick={() => label === 'Invest' ? navigate('/investment') : label === 'Deposit' ? navigate('/deposit') : label === 'Withdraw' ? navigate('/withdraw') : label === 'History' ? navigate('/transactions') : undefined} whileTap={{ scale: 0.94 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + index * 0.05 }}><span className={`action-icon ${tone}`}><Icon size={19} /></span><span>{label}</span></motion.button>)}
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="overline">YOUR NUMBERS</p><h2>At a glance</h2></div><button className="more-button" aria-label="More statistics"><MoreHorizontal size={20} /></button></div>
        <div className="stats-grid">{stats.map(({ label, amount, trend, icon: Icon, tone }) => <motion.article className="stat-card" key={label} whileHover={{ y: -3 }}><span className={`stat-icon ${tone}`}><Icon size={16} /></span><p>{label}</p><strong>{loading ? '...' : amount}</strong><small className="neutral">{trend}</small></motion.article>)}</div>
      </section>

      <section className="referral-card glass-card"><div className="referral-copy"><span className="referral-icon"><Gift size={19} /></span><div><p className="overline">SHARE THE MOMENT</p><h2>Bring your circle</h2><p>Earn from successful referrals.</p></div></div><div className="referral-code"><span>{data?.profile?.referral_code || 'Not available'}</span><button onClick={copyReferralCode} aria-label="Copy referral code">{copied ? <Sparkles size={16} /> : <Copy size={16} />}</button></div><button className="share-button" onClick={() => navigate('/referral')}><Share2 size={16} /> View referrals</button></section>

      <section className="section-block chart-section">
        <div className="section-heading"><div><p className="overline">PORTFOLIO GROWTH</p><h2>Performance</h2></div><div className="range-switcher">{['7D', '30D'].map((option) => <button key={option} className={range === option ? 'selected' : ''} onClick={() => setRange(option)}>{option}</button>)}</div></div>
        <div className="chart-card glass-card"><div className="chart-total">${Number((wallet?.main_balance || 0) + (wallet?.profit_balance || 0)).toFixed(2)} <span>Live</span></div>{error ? <div className="history-empty">{error} <button onClick={load}>Retry</button></div> : <Chart options={chartOptions} series={[{ name: 'Portfolio', data: (data?.transactions || []).slice(0, 7).reverse().map((item) => Number(item.amount || 0)) }]} type="area" height={140} />}<div className="chart-labels"><span>Recent</span><span>Transactions</span></div></div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="overline">CURATED FOR YOU</p><h2>Active investment</h2></div><button className="text-button">View all <ChevronRight size={14} /></button></div>
        <article className="investment-card glass-card">{data?.investments?.[0] ? <><div className="investment-header"><div className="plan-badge"><Sparkles size={17} /></div><div><h3>{data.plans.find((plan) => plan.id === data.investments[0].plan_id)?.name || 'Investment'}</h3><p>Live investment position</p></div><span className="status-badge">{data.investments[0].status}</span></div><div className="investment-values"><div><span>Invested</span><strong>${Number(data.investments[0].amount).toFixed(2)}</strong></div><div><span>Current profit</span><strong>{Number(data.investments[0].current_profit || 0).toFixed(2)}</strong></div><div><span>Ends</span><strong>{data.investments[0].end_date ? new Date(data.investments[0].end_date).toLocaleDateString() : 'Active'}</strong></div></div><div className="progress-meta"><span>Database position</span><span>{data.investments[0].status}</span></div><div className="progress-track"><motion.i initial={{ width: 0 }} animate={{ width: data.investments[0].status === 'active' ? '68%' : '24%' }} /></div></> : <div className="history-empty">No active investments yet.</div>}</article>
      </section>

      <LiveMarketWidget />

      <section className="section-block activity-section"><div className="section-heading"><div><p className="overline">MONEY MOVEMENT</p><h2>Latest activity</h2></div><button className="text-button">View all <ChevronRight size={14} /></button></div><div className="activity-list">{activities.map(({ title, detail, date, amount, icon: Icon, tone }, index) => <div className="activity-row" key={title}><span className={`activity-icon ${tone}`}><Icon size={16} /></span><div className="activity-info"><strong>{title}</strong><span>{detail} · {date}</span></div><strong className={amount.startsWith('+') ? 'activity-positive' : ''}>{amount}</strong>{index < activities.length - 1 && <span className="activity-line" />}</div>)}</div></section>

      <nav className="bottom-navigation dashboard-nav">{[{ label: 'Home', icon: LayoutGrid }, { label: 'Invest', icon: TrendingUp }, { label: 'Wallet', icon: WalletCards }, { label: 'History', icon: History }, { label: 'Profile', icon: UserRound }].map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeTab === label ? 'active' : ''}`} onClick={() => label === 'Invest' ? navigate('/investment') : label === 'Wallet' ? navigate('/wallet') : label === 'Profile' ? navigate('/profile') : label === 'History' ? navigate('/transactions') : setActiveTab(label)}><span><Icon size={19} /></span><small>{label}</small></button>)}</nav>
    </main>
  )
}

export { DashboardPage }