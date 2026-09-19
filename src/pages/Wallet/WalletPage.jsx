import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import {
  ArrowDownToLine, ArrowLeft, ArrowUpRight, Bell, Check, ChevronRight,
  CircleDollarSign, Eye, EyeOff, Gift, History, Home, LoaderCircle,
  LockKeyhole, TrendingUp, UserRound, WalletCards, X,
} from 'lucide-react'
import { claimWalletProfit, fetchWalletSystem, requestWalletWithdrawal, subscribeWallet } from '../../services/wallet/system'
import './WalletPage.css'

const navItems = [
  { label: 'Home', path: '/dashboard', icon: Home },
  { label: 'Invest', path: '/investment', icon: TrendingUp },
  { label: 'Deposit', path: '/deposit', icon: ArrowDownToLine },
  { label: 'Wallet', path: '/wallet', icon: WalletCards },
  { label: 'Profile', path: '/profile', icon: UserRound },
]

function money(value) { return `$${Number(value || 0).toFixed(2)}` }

function WalletPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => { setLoading(true); setError(''); try { setData(await fetchWalletSystem()) } catch (caught) { setError(caught.message || 'Unable to load wallet') } finally { setLoading(false) } }
  useEffect(() => { const timer = window.setTimeout(load, 0); let unsubscribe; try { unsubscribe = subscribeWallet(load) } catch { unsubscribe = undefined } return () => { window.clearTimeout(timer); unsubscribe?.() } }, [])

  const wallet = data?.wallet
  const planMap = useMemo(() => new Map((data?.plans || []).map((plan) => [plan.id, plan])), [data?.plans])
  const canClaim = Number(wallet?.pending_profit || 0) > 0
  const claim = async () => { setBusy(true); try { await claimWalletProfit(); toast.success('Profit claimed successfully'); await load() } catch (caught) { toast.error(caught.message || 'Unable to claim profit') } finally { setBusy(false) } }
  const withdraw = async (event) => { event.preventDefault(); setBusy(true); try { await requestWalletWithdrawal({ amount: Number(withdrawAmount), walletAddress: withdrawAddress }); toast.success('Withdrawal request submitted'); setShowWithdraw(false); setWithdrawAmount(''); setWithdrawAddress(''); await load() } catch (caught) { toast.error(caught.message || 'Unable to request withdrawal') } finally { setBusy(false) } }

  return <main className="wallet-shell">
    <header className="wallet-navbar"><Link className="wallet-back" to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={19} /></Link><div className="wallet-brand"><img src="/binova-mark.svg" alt="BINOVA logo" /><div><strong>BINOVA</strong><span>Wallet</span></div></div><Link className="wallet-bell" to="/notifications" aria-label="Notifications"><Bell size={19} /></Link></header>
    <section className="wallet-intro"><p className="wallet-overline">YOUR FINANCIAL CORE</p><h1>Wallet <em>overview.</em></h1><p>One clear view of every balance, movement, and decision.</p></section>
    {error && <div className="wallet-error">{error}<button onClick={load}>Retry</button></div>}
    <motion.section className="wallet-balance-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}><div className="wallet-card-glow" /><div className="wallet-balance-top"><span>Available balance</span><button onClick={() => setHidden(!hidden)} aria-label={hidden ? 'Show balance' : 'Hide balance'}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><strong>{hidden ? '••••••' : money(wallet?.main_balance)}</strong><span className="wallet-currency">USDT · Ready to move</span><div className="wallet-balance-actions"><Link to="/deposit"><ArrowDownToLine size={16} /> Deposit</Link><Link to="/withdraw"><ArrowUpRight size={16} /> Withdraw</Link></div></motion.section>
    <div className="wallet-quick-grid"><Link to="/deposit"><span className="quick-gold"><ArrowDownToLine size={18} /></span><small>Deposit</small></Link><Link to="/investment"><span className="quick-blue"><TrendingUp size={18} /></span><small>Invest</small></Link><Link to="/withdraw"><span className="quick-red"><ArrowUpRight size={18} /></span><small>Withdraw</small></Link><Link to="/transactions"><span className="quick-violet"><History size={18} /></span><small>History</small></Link><button onClick={claim} disabled={!canClaim || busy}><span className="quick-mint"><Gift size={18} /></span><small>Claim profit</small></button></div>
    <section className="wallet-section"><div className="wallet-section-heading"><div><p className="wallet-overline">BALANCE BREAKDOWN</p><h2>What you own</h2></div><LockKeyhole size={16} /></div><div className="wallet-stat-grid">{[{ label: 'Total deposited', value: wallet?.total_deposit, icon: ArrowDownToLine, tone: 'gold' }, { label: 'Total invested', value: wallet?.total_invested, icon: TrendingUp, tone: 'blue' }, { label: 'Active investment', value: wallet?.active_investment, icon: CircleDollarSign, tone: 'violet' }, { label: 'Pending profit', value: wallet?.pending_profit, icon: Gift, tone: 'mint' }, { label: 'Referral bonus', value: wallet?.referral_balance, icon: Gift, tone: 'gold' }, { label: 'Total profit', value: wallet?.total_profit, icon: TrendingUp, tone: 'mint' }, { label: 'Total withdrawn', value: wallet?.total_withdrawal, icon: ArrowUpRight, tone: 'red' }, { label: 'Pending withdraw', value: wallet?.pending_withdrawal, icon: History, tone: 'blue' }].map(({ label, value, icon: Icon, tone }) => <article className="wallet-stat" key={label}><span className={`wallet-stat-icon ${tone}`}><Icon size={15} /></span><small>{label}</small><strong>{loading ? '...' : money(value)}</strong></article>)}</div></section>
    <section className="wallet-section"><div className="wallet-section-heading"><div><p className="wallet-overline">ACTIVE POSITIONS</p><h2>Investments</h2></div><Link to="/investment">Manage <ChevronRight size={14} /></Link></div>{data?.investments?.length ? <div className="wallet-investments">{data.investments.map((item) => <article className="wallet-investment" key={item.id}><div className="wallet-investment-title"><span><TrendingUp size={16} /></span><div><strong>{planMap.get(item.plan_id)?.name || 'Investment plan'}</strong><small>{item.status} · {item.end_date ? `Ends ${new Date(item.end_date).toLocaleDateString()}` : 'Active term'}</small></div><b>{money(item.amount)}</b></div><div className="wallet-investment-line"><span>Current profit {money(item.current_profit)}</span><span>{money(item.expected_return)} projected</span></div><div className="wallet-progress"><i style={{ width: item.status === 'active' ? '64%' : '22%' }} /></div></article>)}</div> : <div className="wallet-empty">No active investments yet.</div>}</section>
    <section className="wallet-section"><div className="wallet-section-heading"><div><p className="wallet-overline">LEDGER</p><h2>Recent activity</h2></div><Link to="/transactions">See all <ChevronRight size={14} /></Link></div>{data?.history?.length ? <div className="wallet-ledger">{data.history.slice(0, 6).map((item) => <div className="ledger-row" key={item.id}><span className="ledger-icon"><History size={15} /></span><div><strong>{item.description || item.type}</strong><small>{new Date(item.created_at).toLocaleDateString()} · {item.type}</small></div><b>{item.amount > 0 ? `+${money(item.amount)}` : money(item.amount)}</b></div>)}</div> : <div className="wallet-empty">Your wallet history will appear here.</div>}</section>
    <nav className="bottom-navigation wallet-nav">{navItems.map(({ label, path, icon: Icon }) => <Link key={label} to={path} className={`nav-item ${label === 'Wallet' ? 'active' : ''}`}><span><Icon size={19} /></span><small>{label}</small></Link>)}</nav>
    {showWithdraw && <div className="wallet-modal-backdrop" onClick={() => setShowWithdraw(false)}><form className="withdraw-sheet" onSubmit={withdraw} onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="wallet-sheet-heading"><div><p className="wallet-overline">MOVE FUNDS</p><h2>Withdraw USDT</h2></div><button type="button" onClick={() => setShowWithdraw(false)} aria-label="Close withdrawal"><X size={18} /></button></div><label>Amount<input type="number" min="0" step="0.01" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} required placeholder="0.00" /></label><label>BEP20 wallet address<input value={withdrawAddress} onChange={(event) => setWithdrawAddress(event.target.value)} required placeholder="0x..." /></label><button className="confirm-withdraw" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} {busy ? 'Submitting...' : 'Request withdrawal'}</button></form></div>}
  </main>
}

export { WalletPage }