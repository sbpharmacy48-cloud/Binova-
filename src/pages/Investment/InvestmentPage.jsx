import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { activateInvestment, fetchInvestmentData, subscribeInvestment } from '../../services/investment/investments'
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Gem,
  Gift,
  History,
  LayoutGrid,
  LockKeyhole,
  Plus,
  Sparkles,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import './InvestmentPage.css'

const iconMap = { 'circle-dollar-sign': CircleDollarSign, 'trending-up': TrendingUp, 'bar-chart-3': TrendingUp, 'wallet-cards': WalletCards, gem: Gem, sparkles: Sparkles, crown: Gift }
const toneNames = ['starter', 'silver', 'gold', 'diamond', 'platinum', 'vip']

const navItems = [
  { label: 'Home', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Invest', icon: TrendingUp, path: '/investment' },
  { label: 'Wallet', icon: WalletCards, path: '/wallet' },
  { label: 'History', icon: History, path: '/transactions' },
  { label: 'Profile', icon: UserRound, path: '/profile' },
]

function BrandMark() {
  return <img className="invest-brand-mark" src="/binova-mark.svg" alt="BINOVA logo" />
}

function PlanCard({ plan, onInvest }) {
  const Icon = plan.icon
  return (
    <motion.article className={`plan-card plan-${plan.tone}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} whileHover={{ y: -4 }}>
      <div className="plan-card-top"><span className="plan-icon"><Icon size={19} /></span><span className="plan-badge">{plan.badge}</span></div>
      <h3>{plan.name} <span>plan</span></h3><p className="plan-description">{plan.description}</p>
      <div className="plan-range"><span>Investment range</span><strong>${plan.min.toLocaleString()} <i>to</i> ${plan.max.toLocaleString()}</strong></div>
      <div className="plan-facts"><div><span>Duration</span><strong>{plan.duration} days</strong></div><div><span>Daily profit</span><strong className="plan-profit">{plan.daily}%</strong></div><div><span>Total return</span><strong>{plan.totalLabel}</strong></div></div>
      <div className="plan-meta"><span><b className={`risk-dot risk-${plan.risk.toLowerCase()}`} />{plan.risk} risk</span><span>{plan.badge || 'Active plan'}</span></div>
      <div className="plan-progress"><span><i style={{ width: `${Math.min(92, 42 + plan.daily * 9)}%` }} /></span><small>{plan.daily >= 3 ? 'Limited allocation' : 'Open allocation'}</small></div>
      <motion.button className="invest-button" whileTap={{ scale: 0.97 }} onClick={() => onInvest(plan)}>Invest now <ChevronRight size={15} /></motion.button>
    </motion.article>
  )
}

function InvestmentSheet({ plan, onClose }) {
  const PlanIcon = plan.icon
  const [amount, setAmount] = useState(plan.min)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const amountNumber = Number(amount) || 0
  const dailyProfit = amountNumber * (plan.daily / 100)
  const totalProfit = dailyProfit * plan.duration
  const validAmount = amountNumber >= plan.min && amountNumber <= plan.max

  async function confirmInvestment() {
    setSubmitting(true)
    try {
      await activateInvestment({ planId: plan.id, amount: amountNumber })
      onClose()
    } catch (error) {
      toast.error(error.message || 'Unable to activate investment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="investment-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${plan.name} investment`}>
        <div className="sheet-handle" /><header className="sheet-header"><div><p className="overline">YOUR NEXT MOVE</p><h2>Invest in {plan.name}</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close investment sheet"><X size={18} /></button></header>
        <div className="sheet-plan-summary"><span className={`plan-icon ${plan.tone}`}><PlanIcon size={19} /></span><div><strong>{plan.description}</strong><span>${plan.min.toLocaleString()} - ${plan.max.toLocaleString()} · {plan.duration} days · {plan.daily}% daily</span></div><LockKeyhole size={15} /></div>
        <div className="sheet-field"><label htmlFor="investment-amount">Investment amount</label><div className="amount-input"><span>$</span><input id="investment-amount" type="number" min={plan.min} max={plan.max} value={amount} onChange={(event) => setAmount(event.target.value)} /><span>USD</span></div><small>Available balance: ${Number(plan.availableBalance || 0).toFixed(2)}</small></div>
        <div className="quick-amounts">{[10, 25, 50, 100].map((quickAmount) => <button key={quickAmount} onClick={() => setAmount(Math.min(plan.max, Math.max(plan.min, quickAmount)))}>${quickAmount}</button>)}<button onClick={() => setAmount(plan.max)}>MAX</button></div>
        <div className="sheet-results"><div><span>Estimated daily profit</span><strong>+${dailyProfit.toFixed(2)}</strong></div><div><span>Total profit</span><strong>+${totalProfit.toFixed(2)}</strong></div><div><span>Total return</span><strong>${(amountNumber + totalProfit).toFixed(2)}</strong></div></div>
        <div className="sheet-progress"><div><span>Projected return</span><strong>{plan.totalLabel}</strong></div><span><i style={{ width: `${Math.min(94, plan.total - 20)}%` }} /></span></div>
        <label className="terms-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>{agreed ? <Check size={12} /> : null}</span>I understand the plan terms and risk.</label>
        <button className="confirm-button" disabled={!agreed || !validAmount || submitting} onClick={confirmInvestment}>{submitting ? 'Activating...' : <><Plus size={17} /> Confirm investment <ChevronRight size={16} /></>}</button>
      </motion.section>
    </motion.div>
  )
}

function InvestmentPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('All')
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [plans, setPlans] = useState([])
  const [wallet, setWallet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => { setLoading(true); setError(''); try { const data = await fetchInvestmentData(); const normalized = data.plans.map((plan, index) => { const daily = Number(plan.daily_profit_percentage || 0); const duration = Number(plan.duration_days || 0); const total = Number(plan.estimated_return ?? daily * duration); return { ...plan, min: Number(plan.minimum_deposit), max: Number(plan.maximum_deposit), duration, daily, total, totalLabel: plan.estimated_return != null ? `${plan.estimated_return}%` : `${total.toFixed(2)}%`, risk: plan.risk_level || 'balanced', tone: toneNames[index % toneNames.length], icon: iconMap[plan.icon] || Sparkles, badge: plan.badge || '', category: plan.name, description: plan.description || '', availableBalance: Number(data.wallet?.main_balance || 0) } }); setPlans(normalized); setWallet(data.wallet) } catch (caught) { setError(caught.message || 'Unable to load investment plans') } finally { setLoading(false) } }
  useEffect(() => { const timer = window.setTimeout(() => load(), 0); let unsubscribe; try { unsubscribe = subscribeInvestment(load) } catch { unsubscribe = undefined } return () => { window.clearTimeout(timer); unsubscribe?.() } }, [])
  const filters = ['All', ...plans.map((plan) => plan.name)]
  const filteredPlans = useMemo(() => filter === 'All' ? plans : plans.filter((plan) => plan.category === filter), [filter, plans])

  return (
    <main className="investment-shell">
      <div className="invest-orb invest-orb-one" /><div className="invest-orb invest-orb-two" /><div className="invest-particle invest-particle-one" /><div className="invest-particle invest-particle-two" />
      <header className="investment-navbar"><button className="back-button" onClick={() => window.history.back()} aria-label="Go back"><ArrowLeft size={19} /></button><div className="investment-title"><BrandMark /><div><strong>BINOVA</strong><span>Investment plans</span></div></div><div className="nav-tools"><button onClick={() => navigate('/notifications')} aria-label="Notifications"><Bell size={18} /><i>2</i></button><button className="profile-dot" aria-label="Open profile">H</button></div></header>
      <section className="investment-intro page-enter"><p className="overline">GROW WITH INTENTION</p><h1>Make your money<br /><em>work beautifully.</em></h1><p>Thoughtful plans for every stage of your wealth journey.</p></section>
      <section className="available-card"><div className="available-glow" /><div className="available-head"><span className="wallet-symbol"><WalletCards size={18} /></span><div><p>Wallet balance</p><strong>Available balance</strong></div><button aria-label="Wallet details" onClick={() => navigate('/wallet')}><ChevronRight size={16} /></button></div><div className="available-bottom"><strong>${Number(wallet?.main_balance || 0).toFixed(2)}</strong><button onClick={() => navigate('/deposit')}>Deposit <Plus size={15} /></button></div><div className="wallet-animation"><span /><span /><span /><span /><span /></div></section>
      <section className="plans-section"><div className="plans-heading"><div><p className="overline">CURATED PORTFOLIOS</p><h2>Choose your level</h2></div><span className="plan-count">{filteredPlans.length} plans</span></div><div className="filter-row">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>{loading ? <div className="plans-list"><div className="plan-card skeleton-card" /><div className="plan-card skeleton-card" /></div> : error ? <div className="history-empty">{error} <button onClick={load}>Retry</button></div> : <div className="plans-list">{filteredPlans.map((plan) => <PlanCard key={plan.id} plan={plan} onInvest={setSelectedPlan} />)}</div>}</section>
      <nav className="bottom-navigation investment-nav" aria-label="Primary navigation">{navItems.map(({ label, icon: Icon, path }) => <a key={label} href={path} className={`nav-item ${label === 'Invest' ? 'active' : ''}`}><span><Icon size={19} /></span><small>{label}</small></a>)}</nav>
      <AnimatePresence>{selectedPlan && <InvestmentSheet plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}</AnimatePresence>
    </main>
  )
}

export { InvestmentPage }