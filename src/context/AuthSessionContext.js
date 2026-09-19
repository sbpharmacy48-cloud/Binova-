import { createContext, useContext } from 'react'

export const AuthSessionContext = createContext(null)

export function useAuthSession() {
  return useContext(AuthSessionContext)
}
