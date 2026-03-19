import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase exchanges the OAuth code automatically and fires SIGNED_IN.
    // We wait for that event, then redirect to the dashboard.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe()
        void navigate({ to: '/dashboard' })
      }
    })

    // Fallback: if the event never fires (already signed in), redirect after 3s
    const timer = setTimeout(() => void navigate({ to: '/dashboard' }), 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-500 text-sm">Signing in…</p>
    </div>
  )
}
