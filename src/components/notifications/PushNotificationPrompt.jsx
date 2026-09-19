import { useEffect, useState } from 'react'
import { BellRing, Check, ShieldCheck, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { enableWebPush, getPushPermission, getPushSupport, syncWebPushSubscription } from '../../services/notification/notifications'
import { supabase } from '../../services/supabase/client'
import './PushNotificationPrompt.css'

const SESSION_PROMPT_KEY = 'binova.push_prompt_seen'

function PushNotificationPrompt() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase || !getPushSupport()) return undefined
    let active = true
    let timer

    const evaluate = async (session) => {
      if (!session || !active) return
      const permission = getPushPermission()
      if (permission === 'granted') {
        try { await syncWebPushSubscription() } catch (error) { console.warn('[Push] Unable to sync subscription.', error) }
        return
      }
      if (permission !== 'default' || window.sessionStorage.getItem(SESSION_PROMPT_KEY)) return
      timer = window.setTimeout(() => { if (active) setOpen(true) }, 2000)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { window.sessionStorage.removeItem(SESSION_PROMPT_KEY); setOpen(false); return }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') evaluate(session)
    })
    supabase.auth.getSession().then(({ data: { session } }) => evaluate(session)).catch(() => undefined)

    return () => { active = false; window.clearTimeout(timer); subscription.unsubscribe() }
  }, [])

  const dismiss = () => {
    window.sessionStorage.setItem(SESSION_PROMPT_KEY, 'true')
    setOpen(false)
  }

  const enable = async () => {
    setBusy(true)
    try {
      await enableWebPush()
      window.sessionStorage.setItem(SESSION_PROMPT_KEY, 'true')
      setOpen(false)
      toast.success('Push Notifications Enabled Successfully')
    } catch (error) {
      toast.error(error.message || 'Unable to enable notifications')
      if (getPushPermission() !== 'default') dismiss()
    } finally { setBusy(false) }
  }

  if (!open) return null
  return <div className="push-prompt-backdrop" role="presentation">
    <section className="push-prompt" role="dialog" aria-modal="true" aria-labelledby="push-prompt-title">
      <button className="push-prompt-close" onClick={dismiss} aria-label="Close notification prompt"><X size={17} /></button>
      <div className="push-prompt-icon"><BellRing size={23} /></div>
      <p className="push-prompt-overline">BINOVA ALERTS</p>
      <h2 id="push-prompt-title">Stay Updated</h2>
      <p className="push-prompt-copy">Enable notifications to receive instant updates about your account.</p>
      <div className="push-prompt-list"><span><Check size={13} /> Deposits and withdrawals</span><span><Check size={13} /> Investments and daily profit</span><span><Check size={13} /> Referral, security, and system alerts</span></div>
      <button className="push-prompt-enable" onClick={enable} disabled={busy}><BellRing size={16} />{busy ? 'Enabling...' : 'Enable Notifications'}</button>
      <button className="push-prompt-later" onClick={dismiss} disabled={busy}>Maybe Later</button>
      <div className="push-prompt-secure"><ShieldCheck size={14} /> You can change this anytime in Notifications</div>
    </section>
  </div>
}

export { PushNotificationPrompt }
