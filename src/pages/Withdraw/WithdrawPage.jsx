import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Bell, ChevronDown, Clock3, Copy, ExternalLink, ShieldCheck, WalletCards } from 'lucide-react'
import { fetchWithdrawData, requestWithdrawal, subscribeWithdraw } from '../../services/wallet/withdraw'
import './WithdrawPage.css'

const fee = 1
const minimum = 10
const maximum = 50000

function money(value) { return `$${Number(value || 0).toFixed(2)}` }
function shortAddress(value = '') { return value ? `${value.slice(0, 7)}...${value.slice(-5)}` : 'Unknown address' }
function formatDate(value) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) }

function WithdrawPage() {
  const [data, setData] = useState({ wallet: null, withdrawals: [] })
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try { setData(await fetchWithdrawData()); setError('') } catch (caught) { setError(caught.message || 'Unable to load withdrawal data') } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    let unsubscribe
    try { unsubscribe = subscribeWithdraw(load) } catch { unsubscribe = undefined }
    return () => { window.clearTimeout(timer); unsubscribe?.() }
  }, [])

  const available = Number(data.wallet?.main_balance || 0)
  const numericAmount = Number(amount || 0)
  const receive = Math.max(0, numericAmount - fee)
  const formError = useMemo(() => {
    if (!amount) return ''
    if (numericAmount < minimum) return `Minimum withdrawal is ${money(minimum)}`
    if (numericAmount > maximum) return `Maximum withdrawal is ${money(maximum)}`
    if (numericAmount > available) return 'Insufficient Balance'
    return ''
  }, [amount, numericAmount, available])

  const submit = async (event) => {
    event.preventDefault()
    if (!address.trim()) return setError('Enter a destination wallet address')
    if (formError) return setError(formError)
    setBusy(true); setError('')
    try {
      await requestWithdrawal({ amount: numericAmount, walletAddress: address.trim() })
      toast.success('Withdrawal request submitted')
      setAddress(''); setAmount(''); await load()
    } catch (caught) { setError(caught.message || 'Unable to request withdrawal') } finally { setBusy(false) }
  }

  const copy = async (value) => { await navigator.clipboard?.writeText(value); toast.success('Wallet address copied') }

  return <main className="withdraw-shell">
    <header className="withdraw-header"><Link to="/wallet" aria-label="Back to wallet"><ArrowLeft size={19} /></Link><div><strong>Withdraw</strong><small>Move funds securely</small></div><Link to="/notifications" aria-label="Notifications"><Bell size={19} /></Link></header>
    {error && <div className="withdraw-error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <section className="withdraw-summary"><div className="withdraw-summary-glow" /><p>AVAILABLE BALANCE</p><strong>{loading ? '...' : money(data.wallet?.main_balance)}</strong><div className="withdraw-summary-grid"><span><small>Pending withdraw</small><b>{money(data.wallet?.pending_withdrawal)}</b></span><span><small>Total withdrawn</small><b>{money(data.wallet?.total_withdrawal)}</b></span></div></section>
    <form className="withdraw-form-card" onSubmit={submit}><div className="withdraw-section-title"><div><p>WITHDRAWAL NETWORK</p><h2>Choose where to send</h2></div><ShieldCheck size={18} /></div><div className="network-select"><WalletCards size={18} /><div><strong>USDT (BEP20)</strong><small>Binance Smart Chain</small></div><ChevronDown size={16} /></div><label className="withdraw-field"><span>Destination wallet address</span><div><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Paste BEP20 address" autoComplete="off" /><button type="button" onClick={() => copy(address)} aria-label="Copy wallet address"><Copy size={16} /></button></div></label><label className="withdraw-field"><span>Amount <small>Available {money(available)}</small></span><div><input type="number" min={minimum} max={maximum} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><button type="button" onClick={() => setAmount(String(available))}>MAX</button></div></label>{formError && <p className="field-error">{formError}</p>}<div className="withdraw-breakdown"><span><small>Withdraw fee</small><b>{money(fee)}</b></span><span><small>Estimated receive</small><b className="receive">{money(receive)}</b></span><span><small>Minimum withdrawal</small><b>{money(minimum)}</b></span><span><small>Maximum withdrawal</small><b>{money(maximum)}</b></span></div><div className="withdraw-confirm"><div><span>Amount</span><b>{money(numericAmount)}</b></div><div><span>Network</span><b>USDT · BEP20</b></div><div><span>Fee</span><b>{money(fee)}</b></div><div><span>You receive</span><b className="receive">{money(receive)}</b></div><div className="confirm-address"><span>Destination</span><b>{shortAddress(address)}</b></div></div><button className="withdraw-submit" disabled={busy || loading}>{busy ? 'Submitting...' : 'Request withdrawal'} <ExternalLink size={17} /></button></form>
    <section className="withdraw-notice"><Clock3 size={18} /><div><strong>Before you withdraw</strong><p>Only BEP20 is supported. Double-check your wallet address. Withdrawals are reviewed by admin and may take up to 30 minutes.</p></div></section>
    <section className="withdraw-history"><div className="withdraw-history-heading"><div><p>YOUR ACTIVITY</p><h2>Withdrawal history</h2></div><span>{data.withdrawals.length}</span></div>{data.withdrawals.length ? <div className="withdraw-list">{data.withdrawals.map((item) => <article key={item.id}><span className={`withdraw-status-dot ${item.status}`} /><div><strong>{money(item.amount)} {item.currency}</strong><small>{item.network} · {shortAddress(item.wallet_address)}</small><small>{formatDate(item.created_at)}</small></div><div className={`withdraw-status ${item.status}`}>{item.status}</div></article>)}</div> : <div className="withdraw-empty">No withdrawals yet.</div>}</section>
  </main>
}

export { WithdrawPage }
