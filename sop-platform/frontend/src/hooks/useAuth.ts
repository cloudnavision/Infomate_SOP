import { useState, useEffect } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../api/types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function fetchAppUser(token: string): Promise<AppUser | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 403) return null // authenticated but not in users table
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`)
  return res.json() as Promise<AppUser>
}

export interface UseAuthReturn {
  user: SupabaseUser | null
  appUser: AppUser | null
  loading: boolean
  isAuthenticated: boolean
  accessDenied: boolean
  signInWithMicrosoft: () => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  async function handleSession(
    supabaseUser: SupabaseUser | null,
    token: string | null,
  ): Promise<void> {
    if (!supabaseUser || !token) {
      setUser(null)
      setAppUser(null)
      return
    }

    setUser(supabaseUser)
    const app = await fetchAppUser(token)
    if (!app) {
      // Authenticated with Azure but email not in users table — deny access
      setAccessDenied(true)
      await supabase.auth.signOut()
      setUser(null)
      setAppUser(null)
    } else {
      setAccessDenied(false)
      setAppUser(app)
    }
  }

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session?.user ?? null, session?.access_token ?? null).finally(
        () => setLoading(false),
      )
    })

    // Keep auth state in sync with Supabase session changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session?.user ?? null, session?.access_token ?? null)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signInWithMicrosoft = async (): Promise<void> => {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email profile',
      },
    })
  }

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut()
    setUser(null)
    setAppUser(null)
    setAccessDenied(false)
  }

  return {
    user,
    appUser,
    loading,
    isAuthenticated: user !== null && appUser !== null,
    accessDenied,
    signInWithMicrosoft,
    signOut,
  }
}
