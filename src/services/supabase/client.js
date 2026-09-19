import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env'

let useSessionStorage = false
const REMEMBER_ME_KEY = 'binova.remember_me'

function isAuthSession(value) {
  if (!value) return false
  try {
    const parsed = JSON.parse(value)
    return Boolean(parsed?.access_token && parsed?.refresh_token)
  } catch {
    return false
  }
}

const authStorage = {
  getItem(key) {
    const preferred = useSessionStorage ? window.sessionStorage : window.localStorage
    const fallback = useSessionStorage ? window.localStorage : window.sessionStorage
    const preferredValue = preferred.getItem(key)
    if (isAuthSession(preferredValue)) return preferredValue

    const fallbackValue = fallback.getItem(key)
    if (isAuthSession(fallbackValue)) {
      preferred.setItem(key, fallbackValue)
      fallback.removeItem(key)
      return fallbackValue
    }

    return preferredValue ?? fallbackValue
  },
  setItem(key, value) {
    const primary = useSessionStorage ? window.sessionStorage : window.localStorage
    const secondary = useSessionStorage ? window.localStorage : window.sessionStorage
    primary.setItem(key, value)
    secondary.removeItem(key)
  },
  removeItem(key) {
    window.sessionStorage.removeItem(key)
    window.localStorage.removeItem(key)
  },
}

export function setRememberMe(rememberMe) {
  useSessionStorage = !rememberMe
  window.localStorage.setItem(REMEMBER_ME_KEY, String(rememberMe))
}

if (typeof window !== 'undefined') {
  useSessionStorage = window.localStorage.getItem(REMEMBER_ME_KEY) === 'false'
}

const clientKey = '__binova_supabase_client__'

export const supabase = env.supabaseUrl && env.supabaseAnonKey
  ? (globalThis[clientKey] ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: authStorage,
      },
    }))
  : null
