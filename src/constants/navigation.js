import { CircleDollarSign, Home, UserRound, WalletCards } from 'lucide-react'

export const bottomNavigation = [
  { label: 'Home', path: '/dashboard', icon: Home },
  { label: 'Invest', path: '/investment', icon: CircleDollarSign },
  { label: 'Deposit', path: '/deposit', icon: WalletCards },
  { label: 'Wallet', path: '/wallet', icon: WalletCards },
  { label: 'Profile', path: '/profile', icon: UserRound },
]
