import { Outlet } from 'react-router-dom'
import { BottomNavigation } from '../../components/navigation/BottomNavigation'

export function MobileLayout() {
  return (
    <div className="app-frame">
      <main className="app-content"><Outlet /></main>
      <BottomNavigation />
    </div>
  )
}
