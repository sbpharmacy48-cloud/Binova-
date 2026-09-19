import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Activity, ArrowDownToLine, ArrowLeft, ArrowUpRight, BarChart3, Bell, Check, CircleDollarSign, FileText, Gift, LayoutDashboard, LogOut, Menu, RefreshCw, Search, Settings2, ShieldCheck, Users, WalletCards, X } from 'lucide-react'
import { signOut } from '../../services/auth/auth'
import { approveDeposit, fetchAdminOperations, fetchAdminOverview, fetchAdminUsers, getAdminAccess, processWithdrawal, setAdminUserStatus, subscribeAdmin } from '../../services/admin/admin'
import './AdminPage.css'

const navItems = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['users', 'Users', Users], ['deposits', 'Deposits', ArrowDownToLine], ['withdrawals', 'Withdrawals', ArrowUpRight], ['investments', 'Investments', CircleDollarSign], ['plans', 'Investment Plans', BarChart3], ['addresses', 'Wallet Addresses', WalletCards], ['referrals', 'Referrals', Gift], ['notifications', 'Notifications', Bell], ['support', 'Support', FileText], ['reports', 'Reports', Activity], ['settings', 'System Settings', Settings2], ['audit', 'Audit Logs', ShieldCheck],
]

function money(value) { return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function shortId(value) { return value ? `${value.slice(0, 7)}...${value.slice(-5)}` : '-' }
function date(value) { return value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '-' }

function StatCard({ label, value, tone }) { return <article className={`admin-stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>Live from Supabase</small></article> }

function DataTable({ children }) { return <div className="admin-table-wrap"><table className="admin-table"><tbody>{children}</tbody></table></div> }

function AdminPage() {
  const navigate = useNavigate()
  const [active, setActive] = useState('dashboard')
  const [access, setAccess] = useState(null)
  const [overview, setOverview] = useState({})
  const [operations, setOperations] = useState({ deposits: [], withdrawals: [], plans: [], wallet_addresses: [], referrals: [], audit_logs: [] })
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const nextAccess = await getAdminAccess()
      if (!nextAccess.isAdmin) { navigate('/dashboard', { replace: true }); return }
      const [nextOverview, nextOperations, nextUsers] = await Promise.all([fetchAdminOverview(), fetchAdminOperations(), fetchAdminUsers({ search })])
      setAccess(nextAccess); setOverview(nextOverview); setOperations(nextOperations); setUsers(nextUsers)
    } catch (caught) { setError(caught.message || 'Unable to load admin panel') } finally { setLoading(false) }
  }, [navigate, search])

  useEffect(() => { const timer = window.setTimeout(load, 0); let unsubscribe; try { unsubscribe = subscribeAdmin(load) } catch { unsubscribe = undefined }; return () => { window.clearTimeout(timer); unsubscribe?.() } }, [load])

  const run = async (id, action) => { setBusyId(id); try { await action(); toast.success('Admin action completed'); await load() } catch (caught) { toast.error(caught.message || 'Admin action failed') } finally { setBusyId('') } }
  const logout = async () => { await signOut(); navigate('/login', { replace: true }) }
  const currentRows = useMemo(() => active === 'deposits' ? operations.deposits : active === 'withdrawals' ? operations.withdrawals : active === 'plans' ? operations.plans : active === 'addresses' ? operations.wallet_addresses : active === 'referrals' ? operations.referrals : active === 'audit' ? operations.audit_logs : [], [active, operations])

  if (loading && !access) return <main className="admin-loading"><span /><strong>Verifying admin access...</strong></main>
  if (error && !access) return <main className="admin-loading"><ShieldCheck size={28} /><strong>{error}</strong><button onClick={load}>Retry</button></main>

  return <main className="admin-shell">
    <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}><div className="admin-brand"><span>B</span><div><strong>BINOVA</strong><small>ADMIN CONTROL</small></div><button className="admin-mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button></div><nav>{navItems.map(([id, label, Icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); setSidebarOpen(false) }}><Icon size={17} /><span>{label}</span></button>)}</nav><button className="admin-logout" onClick={logout}><LogOut size={16} /> Sign out</button></aside>
    {sidebarOpen && <button className="admin-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
    <section className="admin-main"><header className="admin-topbar"><button className="admin-menu" onClick={() => setSidebarOpen(true)} aria-label="Open admin navigation"><Menu size={20} /></button><div><p>CONTROL CENTER</p><h1>{navItems.find(([id]) => id === active)?.[1] || 'Dashboard'}</h1></div><div className="admin-top-actions"><span className="admin-role"><ShieldCheck size={14} /> {access?.profile?.role || 'admin'}</span><Link to="/dashboard" aria-label="Open user dashboard"><ArrowLeft size={17} /></Link></div></header>
      {error && <div className="admin-error">{error}<button onClick={load}>Retry</button></div>}
      {active === 'dashboard' && <><div className="admin-stat-grid"><StatCard label="Total users" value={overview.total_users ?? 0} tone="gold" /><StatCard label="Verified users" value={overview.verified_users ?? 0} tone="mint" /><StatCard label="Pending deposits" value={overview.pending_deposits ?? 0} tone="blue" /><StatCard label="Pending withdrawals" value={overview.pending_withdrawals ?? 0} tone="red" /><StatCard label="Today's deposits" value={money(overview.today_deposits)} tone="gold" /><StatCard label="Today's withdrawals" value={money(overview.today_withdrawals)} tone="violet" /><StatCard label="Total investments" value={money(overview.total_investments)} tone="mint" /><StatCard label="Pending support" value={overview.pending_support_tickets ?? 0} tone="red" /></div><section className="admin-panel"><div className="admin-panel-head"><div><p>OPERATIONS</p><h2>Quick actions</h2></div><button onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</button></div><div className="admin-quick-actions"><button onClick={() => setActive('deposits')}><ArrowDownToLine size={17} /> Review deposits</button><button onClick={() => setActive('withdrawals')}><ArrowUpRight size={17} /> Process withdrawals</button><button onClick={() => setActive('users')}><Users size={17} /> Manage users</button><button onClick={() => setActive('audit')}><ShieldCheck size={17} /> Audit activity</button></div></section></>}
      {active === 'users' && <section className="admin-panel"><PanelHeader title="User management" count={users.length} search={search} setSearch={setSearch} /><DataTable>{users.map((user) => <tr key={user.id}><td><strong>{user.full_name || user.username}</strong><small>{user.email}</small></td><td><span className={`admin-status ${user.account_status}`}>{user.account_status}</span><small>{user.role}</small></td><td>{money(user.main_balance)}<small>Balance</small></td><td>{date(user.created_at)}</td><td><button className="table-action" disabled={busyId === user.id} onClick={() => run(user.id, () => setAdminUserStatus(user.id, user.account_status === 'active' ? 'suspended' : 'active'))}>{user.account_status === 'active' ? 'Suspend' : 'Activate'}</button></td></tr>)}</DataTable></section>}
      {['deposits', 'withdrawals', 'plans', 'addresses', 'referrals', 'audit'].includes(active) && <section className="admin-panel"><PanelHeader title={navItems.find(([id]) => id === active)?.[1]} count={currentRows.length} /><AdminRows active={active} rows={currentRows} busyId={busyId} run={run} /></section>}
      {['investments', 'notifications', 'support', 'reports', 'settings'].includes(active) && <section className="admin-panel admin-coming"><Settings2 size={25} /><h2>{navItems.find(([id]) => id === active)?.[1]} workspace</h2><p>This secured area is routed through the admin shell. Its data actions should be connected to dedicated admin RPCs before enabling operational use.</p></section>}
    </section></main>
}

function PanelHeader({ title, count, search, setSearch }) { return <div className="admin-panel-head"><div><p>SECURED DATA</p><h2>{title} <small>{count}</small></h2></div>{setSearch && <label className="admin-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /></label>}</div> }
function AdminRows({ active, rows, busyId, run }) {
  if (!rows.length) return <div className="admin-empty"><Activity size={22} /><strong>No records found</strong><span>New operational data will appear here.</span></div>
  return <DataTable>{rows.map((row) => <tr key={row.id}><td><strong>{row.email || row.name || row.subject || shortId(row.id)}</strong><small>{date(row.created_at || row.updated_at)}</small></td><td>{active === 'deposits' || active === 'withdrawals' ? money(row.amount) : active === 'plans' ? row.name : active === 'addresses' ? `${row.symbol} · ${row.network}` : active === 'audit' ? row.description : row.status || row.commission || '-'}</td><td>{row.status && <span className={`admin-status ${row.status}`}>{row.status}</span>}</td><td>{active === 'deposits' && <button className="table-action" disabled={busyId === row.id} onClick={() => run(row.id, () => approveDeposit(row.id))}><Check size={13} /> Approve</button>}{active === 'withdrawals' && <button className="table-action" disabled={busyId === row.id} onClick={() => run(row.id, () => processWithdrawal(row.id, 'processing'))}><ArrowUpRight size={13} /> Process</button>}</td></tr>)}</DataTable>
}

export { AdminPage }
