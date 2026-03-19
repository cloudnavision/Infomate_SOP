import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthContext } from '../contexts/AuthContext'
import { AccessDenied } from '../components/AccessDenied'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const { loading, isAuthenticated, accessDenied } = useAuthContext()

  useEffect(() => {
    if (loading) return
    if (isAuthenticated) {
      void navigate({ to: '/dashboard' })
    }
    // accessDenied is rendered below; useAuth already called signOut()
  }, [loading, isAuthenticated, navigate])

  if (accessDenied) {
    return <AccessDenied />
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-500 text-sm">Completing sign in…</p>
    </div>
  )
}
