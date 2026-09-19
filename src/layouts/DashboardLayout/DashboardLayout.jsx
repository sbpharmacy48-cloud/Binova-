import { Outlet } from 'react-router-dom'
import { MobileLayout } from '../MobileLayout/MobileLayout'

export function DashboardLayout() {
  return <MobileLayout><Outlet /></MobileLayout>
}
