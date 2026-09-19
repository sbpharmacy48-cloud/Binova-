import { supabase } from '../supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

export async function fetchInvestmentData() {
  const client = requireClient()
  const [{ data: plans, error: plansError }, { data: wallet, error: walletError }, { data: investments, error: investmentsError }] = await Promise.all([
    client.from('investment_plans').select('id, slug, name, minimum_deposit, maximum_deposit, duration_days, daily_profit_percentage, estimated_return, return_label, risk_level, color, badge, icon, description').eq('status', 'active').order('display_order', { ascending: true }),
    client.from('wallets').select('main_balance, profit_balance, pending_deposit').maybeSingle(),
    client.from('user_investments').select('id, plan_id, amount, expected_return, current_profit, start_date, end_date, status').order('created_at', { ascending: false }),
  ])
  const firstError = [plansError, walletError, investmentsError].find(Boolean)
  if (firstError) throw firstError
  return { plans: plans ?? [], wallet, investments: investments ?? [] }
}

export async function activateInvestment({ planId, amount }) {
  const { data, error } = await requireClient().rpc('activate_investment', { p_plan_id: planId, p_amount: amount })
  if (error) throw error
  return data
}

export function subscribeInvestment(onChange) {
  const client = requireClient()
  const channel = client.channel('investment-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'investment_plans' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_investments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}