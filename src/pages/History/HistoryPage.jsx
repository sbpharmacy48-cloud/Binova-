import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, CircleDollarSign, Clock3, Copy, Filter, Gift, History as HistoryIcon, Home, Search, TrendingUp, WalletCards, X } from 'lucide-react'
import { fetchHistory, subscribeHistory } from '../../services/history/history'
import './HistoryPage.css'

const filters = [['all', 'All'], ['deposits', 'Deposits'], ['withdrawals', 'Withdrawals'], ['investments', 'Investments'], ['profits', 'Profits'], ['referral', 'Referral Bonus']]
const dateFilters = [['all', 'All Time'], ['today', 'Today'], ['7', 'Last 7 Days'], ['30', 'Last 30 Days'], ['90', 'Last 90 Days']]
const icons = { deposit: ArrowDownLeft, withdrawal: ArrowUpRight, investment: TrendingUp, profit: CircleDollarSign, referral: Gift, bonus: Gift, adjustment: WalletCards }

function formatDate(value) { return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) }
function formatTime(value) { return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) }
function shortId(value) { return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'Unavailable' }
function formatAmount(value) { return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) }
function isInDateRange(value, dateFilter) {
  if (dateFilter === 'all') return true
  const date = new Date(value)
  const now = new Date()
  if (dateFilter === 'today') return date.toDateString() === now.toDateString()
  return date >= new Date(Date.now() - Number(dateFilter) * 86400000)
}

function copyValue(value, label) {
  if (!value) return
  navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copied`)).catch(() => toast.error('Unable to copy'))
}

function DetailRow({ label, value, copy }) {
  if (!value && value !== 0) return null
  return <div className="history-detail-row"><span>{label}</span><strong>{String(value)}</strong>{copy && <button onClick={() => copyValue(String(value), label)} aria-label={`Copy ${label}`}><Copy size={14} /></button>}</div>
}

function TransactionSheet({ item, onClose }) {
  const source = item.sourceDetails || {}
  const DetailIcon = icons[item.type] || HistoryIcon
  return <motion.div className="history-sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.section className="history-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${item.label} details`}>
      <div className="sheet-handle" /><header className="history-sheet-header"><div><p>TRANSACTION DETAILS</p><h2>{item.label}</h2></div><button onClick={onClose} aria-label="Close transaction details"><X size={18} /></button></header>
      <div className="history-detail-hero"><span className={`history-detail-icon ${item.type}`}><DetailIcon size={22} /></span><div><strong>{item.amount > 0 ? '+' : ''}{formatAmount(item.amount)} {item.currency}</strong><span className={`history-status status-${item.status}`}>{item.status}</span></div></div>
      <div className="history-detail-list">
        <DetailRow label="Transaction ID" value={item.id} copy />
        <DetailRow label="Reference ID" value={item.referenceId} copy />
        <DetailRow label="Network" value={source.network || item.metadata?.network} />
        <DetailRow label="Wallet Address" value={source.wallet_address} copy />
        <DetailRow label="Transaction Hash" value={item.transactionHash} copy />
        <DetailRow label="Created" value={`${formatDate(item.createdAt)} - ${formatTime(item.createdAt)}`} />
        <DetailRow label="Completed" value={item.completedAt ? `${formatDate(item.completedAt)} - ${formatTime(item.completedAt)}` : null} />
        <DetailRow label="Description" value={item.description} />
        <DetailRow label="Fee" value={item.metadata?.fee ? `${item.metadata.fee} ${item.currency}` : null} />
        <DetailRow label="Final Received" value={item.metadata?.final_received_amount ? `${item.metadata.final_received_amount} ${item.currency}` : null} />
        <DetailRow label="Investment Plan" value={source.investment_plans?.name || source.plan_name} />
        <DetailRow label="Referral User" value={source.child_user_id} copy />
        <DetailRow label="Admin Note" value={source.admin_note} />
      </div>
      {source.screenshot_url && <div className="proof-preview"><span>Payment proof</span><img src={source.screenshot_url} alt="Deposit payment proof" /></div>}
    </motion.section>
  </motion.div>
}

function HistoryCard({ item, onClick, index }) {
  const Icon = icons[item.type] || HistoryIcon
  const incoming = ['deposit', 'profit', 'referral', 'bonus'].includes(item.type)
  return <motion.button className="history-card" onClick={onClick} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.035 }}>
    <span className={`history-card-icon ${item.type}`}><Icon size={18} /></span><span className="history-card-copy"><strong>{item.label}</strong><small><CalendarDays size={11} /> {formatDate(item.createdAt)} - <Clock3 size={11} /> {formatTime(item.createdAt)}</small><small>TX: {shortId(item.transactionHash || item.id)}</small></span><span className="history-card-value"><strong className={incoming ? 'incoming' : ''}>{incoming ? '+' : '-'}{formatAmount(item.amount)}</strong><small>{item.currency}</small><span className={`history-status status-${item.status}`}>{item.status}</span></span><ChevronRight className="history-card-arrow" size={16} />
  </motion.button>
}

function HistoryPage() {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const searchInputRef = useRef(null)

  const load = useCallback(async () => {
    try { setError(''); setItems(await fetchHistory()) } catch (caught) { setError(caught.message || 'Unable to load transaction history') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    let unsubscribe
    try { unsubscribe = subscribeHistory(load) } catch { unsubscribe = undefined }
    return () => { window.clearTimeout(timer); unsubscribe?.() }
  }, [load])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const searchable = [item.id, item.referenceId, item.transactionHash, item.sourceDetails?.wallet_address, item.amount, item.currency].filter(Boolean).join(' ').toLowerCase()
      return (filter === 'all' || item.category === filter) && isInDateRange(item.createdAt, dateFilter) && (!query || searchable.includes(query))
    })
  }, [dateFilter, filter, items, search])

  return <main className="history-shell">
    <header className="history-header"><Link to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={19} /></Link><div><strong>History</strong><small>All account activity</small></div><div className="history-header-actions"><button onClick={() => searchInputRef.current?.focus()} aria-label="Focus search"><Search size={18} /></button><button onClick={() => setShowFilters((value) => !value)} aria-label="Open filters"><Filter size={18} /></button></div></header>
    <section className="history-intro"><p>TRANSACTION LEDGER</p><h1>Every move, <em>accounted for.</em></h1><span>{visible.length} visible {visible.length === 1 ? 'record' : 'records'}</span></section>
    <label className="history-search"><Search size={16} /><input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, wallet, amount..." /><kbd>Ctrl K</kbd></label>
    <div className="history-filter-row">{filters.map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <AnimatePresence>{showFilters && <motion.div className="history-date-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><div className="history-date-title"><span><CalendarDays size={15} /> Date range</span><button onClick={() => setShowFilters(false)} aria-label="Close filters"><X size={14} /></button></div><div className="history-date-row">{dateFilters.map(([value, label]) => <button key={value} className={dateFilter === value ? 'active' : ''} onClick={() => setDateFilter(value)}>{label}</button>)}</div></motion.div>}</AnimatePresence>
    {loading ? <div className="history-state"><span className="history-spinner" />Loading ledger...</div> : error ? <div className="history-state error-state">{error}<button onClick={load}>Retry</button></div> : visible.length ? <section className="history-list">{visible.map((item, index) => <HistoryCard key={item.key} item={item} index={index} onClick={() => setSelected(item)} />)}</section> : <div className="history-state"><HistoryIcon size={24} /><strong>No matching activity</strong><span>Completed and pending wallet movements will appear here.</span></div>}
    <nav className="bottom-navigation history-nav"><Link to="/dashboard"><Home size={19} /><small>Home</small></Link><Link to="/investment"><TrendingUp size={19} /><small>Invest</small></Link><Link to="/wallet"><WalletCards size={19} /><small>Wallet</small></Link><Link className="active" to="/transactions"><HistoryIcon size={19} /><small>History</small></Link><Link to="/profile"><CircleDollarSign size={19} /><small>Profile</small></Link></nav>
    <AnimatePresence>{selected && <TransactionSheet item={selected} onClose={() => setSelected(null)} />}</AnimatePresence>
  </main>
}

export { HistoryPage }
