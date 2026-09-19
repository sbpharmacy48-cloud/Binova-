import { supabase } from '../supabase/client'

export async function fetchInvestmentPlans() {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('investment_plans')
    .select('slug, name, estimated_return, return_label, status, minimum_deposit, maximum_deposit, duration_days, daily_profit_percentage, risk_level, color, badge, icon, description')
    .eq('status', 'active')
    .order('minimum_deposit', { ascending: true })
    .limit(5)

  if (error) throw error
  return data ?? []
}

export async function fetchLandingStats() {
  if (!supabase) return []
  const { data, error } = await supabase.from('app_settings').select('setting_key, setting_value').eq('is_public', true).eq('setting_key', 'landing_stats').maybeSingle()
  if (error) throw error
  return Array.isArray(data?.setting_value?.stats) ? data.setting_value.stats : []
}
