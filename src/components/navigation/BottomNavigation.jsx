import { NavLink } from 'react-router-dom'
import { bottomNavigation } from '../../constants/navigation'

export function BottomNavigation() {
  return (
    <nav className="bottom-navigation" aria-label="Primary navigation">
      {bottomNavigation.map(({ label, path, icon: Icon }) => (
        <NavLink key={path} to={path} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Icon size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
