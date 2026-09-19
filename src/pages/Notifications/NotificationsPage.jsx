import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Bell, BellRing, Check, ChevronRight, Clock3, Gift, Search, ShieldAlert, Trash2, TrendingUp, WalletCards } from 'lucide-react'
import { enableWebPush, fetchNotifications, getPushPermission, getPushSupport, markAllNotificationsRead, markNotificationRead, deleteNotification, subscribeNotifications, syncWebPushSubscription } from '../../services/notification/notifications'
import './NotificationsPage.css'

const filters = ['all', 'unread', 'read']
const typeIcons = { deposit: WalletCards, withdrawal: ArrowLeft, investment: TrendingUp, referral: Gift, security: ShieldAlert, system: Bell }
const typeLabels = { deposit: 'Deposit', withdrawal: 'Withdrawal', investment: 'Investment', referral: 'Referral', security: 'Security', system: 'System', admin: 'Announcement' }

function formatDate(value) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) }

function NotificationsPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pushPermission, setPushPermission] = useState(() => getPushPermission())
  const [pushEnabled, setPushEnabled] = useState(false)

  const load = async () => { try { setNotifications(await fetchNotifications()) } catch (caught) { toast.error(caught.message || 'Unable to load notifications') } finally { setLoading(false) } }
  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    syncWebPushSubscription().then((subscription) => setPushEnabled(Boolean(subscription))).catch(() => undefined)
    let unsubscribe
    try { unsubscribe = subscribeNotifications(load) } catch { unsubscribe = undefined }
    return () => { window.clearTimeout(timer); unsubscribe?.() }
  }, [])

  const visible = useMemo(() => notifications.filter((item) => {
    const matchFilter = filter === 'all' || (filter === 'unread' ? !item.is_read : item.is_read)
    const query = search.trim().toLowerCase()
    return matchFilter && (!query || item.title.toLowerCase().includes(query) || item.message.toLowerCase().includes(query))
  }), [notifications, filter, search])

  const markRead = async (item) => { if (!item.is_read) { await markNotificationRead(item.id); setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true, read_at: new Date().toISOString() } : entry)) } if (item.action_url) navigate(item.action_url) }
  const markAll = async () => { await markAllNotificationsRead(); setNotifications((current) => current.map((item) => ({ ...item, is_read: true, read_at: new Date().toISOString() }))); toast.success('All notifications marked as read') }
  const remove = async (id) => { await deleteNotification(id); setNotifications((current) => current.filter((item) => item.id !== id)) }
  const enablePush = async () => { try { await enableWebPush(); setPushEnabled(true); setPushPermission('granted'); toast.success('Push Notifications Enabled Successfully') } catch (caught) { setPushPermission(getPushPermission()); toast.error(caught.message || 'Unable to enable push notifications') } }
  const pushBlocked = pushPermission === 'denied'

  return <main className="notifications-shell">
    <header className="notifications-header"><Link to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={19} /></Link><div><strong>Notifications</strong><small>Stay in the loop</small></div><BellRing size={19} /></header>
    <section className="notifications-intro"><div><p>ACCOUNT UPDATES</p><h1>Everything in one place.</h1><span>{notifications.filter((item) => !item.is_read).length} unread updates</span></div><button className="push-button" onClick={enablePush} disabled={pushEnabled || !getPushSupport() || pushBlocked}>{pushEnabled ? <Check size={15} /> : <BellRing size={15} />} {pushEnabled ? 'Push on' : pushBlocked ? 'Push blocked' : getPushSupport() ? 'Enable push' : 'Push unavailable'}</button></section>
    {pushBlocked && <div className="push-disabled-notice"><ShieldAlert size={16} /><span><strong>Push Notifications are Disabled</strong><small>Enable notifications for BINOVA in your browser settings, then return here.</small></span></div>}
    <div className="notifications-tools"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notifications" /></label><button onClick={markAll}>Mark all read</button></div>
    <div className="notification-filters">{filters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    {loading ? <div className="notifications-empty">Loading updates...</div> : visible.length ? <section className="notification-list">{visible.map((item) => { const Icon = typeIcons[item.type] || Bell; return <article className={`notification-card ${item.is_read ? 'read' : 'unread'}`} key={item.id} onClick={() => markRead(item)}><span className={`notification-icon ${item.type}`}><Icon size={17} /></span><div className="notification-copy"><div><strong>{item.title}</strong><small>{typeLabels[item.type] || item.type}</small></div><p>{item.message}</p><time><Clock3 size={11} /> {formatDate(item.created_at)}</time></div><div className="notification-actions">{!item.is_read && <i aria-label="Unread" />}{item.action_url && <ChevronRight size={16} />}<button onClick={(event) => { event.stopPropagation(); remove(item.id) }} aria-label="Delete notification"><Trash2 size={14} /></button></div></article>})}</section> : <div className="notifications-empty"><Bell size={22} /><strong>No notifications here</strong><span>New account activity will appear in this space.</span></div>}
  </main>
}

export { NotificationsPage }
