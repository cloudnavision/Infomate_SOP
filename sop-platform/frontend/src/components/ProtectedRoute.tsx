import { type ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { useAuthContext } from '../contexts/AuthContext'
import { AccessDenied } from './AccessDenied'

type Role = 'viewer' | 'editor' | 'admin'

const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
}

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: Role
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { loading, isAuthenticated, accessDenied, appUser } = useAuthContext()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (accessDenied) {
    return <AccessDenied />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  if (requiredRole && appUser) {
    const userRank = ROLE_RANK[appUser.role]
    const requiredRank = ROLE_RANK[requiredRole]
    if (userRank < requiredRank) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-700 font-medium mb-3">
              You don't have permission to access this page.
            </p>
            <Link to="/dashboard" className="text-sm text-blue-600 hover:underline">
              Return to Dashboard
            </Link>
          </div>
        </div>
      )
    }
  }

  return <>{children}</>
}
