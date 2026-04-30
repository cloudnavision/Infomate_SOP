import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuthContext } from '../contexts/AuthContext'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

function LoginPage() {
  const { signInWithMicrosoft, accessDenied, user } = useAuthContext()
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    await signInWithMicrosoft()
    // signInWithMicrosoft initiates an OAuth redirect — loading shows briefly
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="bg-card rounded-xl shadow-md p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-default">SOP Automation Platform</h1>
          <p className="text-sm text-muted mt-2">
            Sign in to access Standard Operating Procedures
          </p>
        </div>

        {/* Access denied message — shown when user authenticated but not registered */}
        {accessDenied && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-600 font-medium">Access denied</p>
            {user?.email && (
              <p className="text-xs text-red-600 mt-0.5">{user.email} is not registered.</p>
            )}
            <p className="text-xs text-red-500 mt-1">
              Contact your administrator to request access.
            </p>
          </div>
        )}

        <button
          onClick={() => void handleSignIn()}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#2f2f2f] text-white rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="text-sm">Redirecting…</span>
          ) : (
            <>
              <MicrosoftIcon />
              <span className="text-sm font-medium">Sign in with Microsoft</span>
            </>
          )}
        </button>

        <p className="text-xs text-muted text-center mt-6">
          Only authorised users can access this platform
        </p>
      </div>
    </div>
  )
}
