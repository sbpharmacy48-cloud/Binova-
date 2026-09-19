export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY
    ?? '',
  webPushPublicKey: import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY ?? '',
}
