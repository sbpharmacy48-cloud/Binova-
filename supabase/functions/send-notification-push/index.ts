import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await request.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, message, action_url, metadata')
      .eq('id', body.notification_id)
      .single()
    if (notificationError) throw notificationError

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('id, provider, endpoint, p256dh, auth')
      .eq('user_id', notification.user_id)
    if (subscriptionsError) throw subscriptionsError

    const provider = Deno.env.get('PUSH_PROVIDER') || 'web-push'
    if (provider !== 'web-push') throw new Error(`Provider adapter not configured: ${provider}`)
    webpush.setVapidDetails(
      Deno.env.get('WEB_PUSH_SUBJECT') || 'mailto:security@binova.app',
      Deno.env.get('WEB_PUSH_PUBLIC_KEY')!,
      Deno.env.get('WEB_PUSH_PRIVATE_KEY')!,
    )

    const payload = JSON.stringify({ type: notification.type, title: notification.title, body: notification.message, url: notification.action_url || '/notifications', tag: notification.id })
    await Promise.all((subscriptions || []).filter((subscription) => subscription.provider === 'web-push').map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload)
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
      }
    }))

    return new Response(JSON.stringify({ delivered: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
