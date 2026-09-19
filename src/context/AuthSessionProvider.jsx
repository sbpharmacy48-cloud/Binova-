import { useEffect, useRef } from 'react'
import { supabase } from '../services/supabase/client'
import { claimSession, isCurrentSession, touchSession } from '../services/auth/session'
import { ensureUserAccount } from '../services/auth/auth'
import { AuthSessionContext } from './AuthSessionContext'
import { PushNotificationPrompt } from '../components/notifications/PushNotificationPrompt'

export function AuthSessionProvider({ children }) {
  const checkingRef = useRef(false)

  useEffect(() => {
    if (!supabase) return undefined

    const enforceSession = async (claim = false) => {
      if (checkingRef.current) return
      checkingRef.current = true
      try {
        const { data: { session } } = await supabase.auth.getSession()
        console.debug('[Auth] Session check', { hasSession: Boolean(session), userId: session?.user?.id ?? null, expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null })
        if (!session) return
        const valid = claim ? await claimSession() : await isCurrentSession()
        if (!valid) {
          console.warn('[Auth] Application session check returned false; preserving the Supabase Auth session.')
        } else {
          await ensureUserAccount()
          await touchSession()
        }
      } catch (error) {
        console.error('Binova session check failed:', error)
      } finally {
        checkingRef.current = false
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.debug('[Auth] Auth state changed', { event, hasSession: Boolean(session), userId: session?.user?.id ?? null, accessTokenPresent: Boolean(session?.access_token) })
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        window.setTimeout(() => enforceSession(event === 'SIGNED_IN'), 0)
      }
    })

    const handleFocus = () => enforceSession()
    window.addEventListener('focus', handleFocus)
    const heartbeat = window.setInterval(() => enforceSession(), 30_000)
    enforceSession()

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
      window.clearInterval(heartbeat)
    }
  }, [])

  return <AuthSessionContext.Provider value={{}}>{children}<PushNotificationPrompt /></AuthSessionContext.Provider>
}
