'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, getToken, setToken, type User } from '@/lib/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session from stored token
  useEffect(() => {
    let cancelled = false

    async function restore() {
      const token = getToken()
      if (!token) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const me = await api.get<User>('/api/me')
        if (!cancelled) setUser(me)
      } catch {
        if (!cancelled) setToken(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{
      accessToken: string
      refreshToken: string
      user: User
    }>('/api/auth/login', { email, password })
    setToken(res.accessToken)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
