import { supabase } from '../supabase/client'

const CLIENT_SESSION_KEY = 'binova.client_session_id'

function getClientSessionId() {
  let clientSessionId = window.localStorage.getItem(CLIENT_SESSION_KEY)
  if (!clientSessionId) {
    clientSessionId = crypto.randomUUID()
    window.localStorage.setItem(CLIENT_SESSION_KEY, clientSessionId)
  }
  return clientSessionId
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function claimSession() {
  const { data, error } = await requireClient().rpc('claim_single_session', {
    p_client_session_id: getClientSessionId(),
  })
  if (error) throw error
  return data === true
}

export async function isCurrentSession() {
  const { data, error } = await requireClient().rpc('is_current_session', {
    p_client_session_id: getClientSessionId(),
  })
  if (error) throw error
  return data === true
}

export async function touchSession() {
  return requireClient().rpc('touch_current_session', {
    p_client_session_id: getClientSessionId(),
  })
}

export async function releaseSession() {
  return requireClient().rpc('release_current_session', {
    p_client_session_id: getClientSessionId(),
  })
}
