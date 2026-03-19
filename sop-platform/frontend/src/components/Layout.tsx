import { Link, Outlet } from '@tanstack/react-router'
import clsx from 'clsx'
import { useAuthContext } from '../contexts/AuthContext'

const ROLE_COLOURS: Record<'viewer' | 'editor' | 'admin', string> = {
  viewer: 'bg-gray-100 text-gray-600',
  editor: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
}

const navLink = 'text-sm text-gray-600 hover:text-gray-900 transition-colors'
const navLinkActive = 'text-sm text-blue-600 font-medium'

export function Layout() {
  const { isAuthenticated, appUser, signOut } = useAuthContext()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <span className="text-lg font-semibold text-gray-900">SOP Platform</span>

            {isAuthenticated && appUser ? (
              <div className="flex items-center gap-6">
                <nav className="flex gap-6">
                  <Link to="/dashboard" className={navLink} activeProps={{ className: navLinkActive }}>
                    Dashboard
                  </Link>
                  {appUser.role === 'admin' && (
                    <Link to="/sop/new" className={navLink} activeProps={{ className: navLinkActive }}>
                      Upload
                    </Link>
                  )}
                  {appUser.role === 'admin' && (
                    <Link to="/settings" className={navLink} activeProps={{ className: navLinkActive }}>
                      Settings
                    </Link>
                  )}
                </nav>

                <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
                  <span className="text-sm text-gray-700">{appUser.name}</span>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded-full capitalize',
                      ROLE_COLOURS[appUser.role],
                    )}
                  >
                    {appUser.role}
                  </span>
                  <button
                    onClick={() => void signOut()}
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
