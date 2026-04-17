import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { useAuthContext } from '../contexts/AuthContext'

const ROLE_CONFIG: Record<'viewer' | 'editor' | 'admin', { label: string; classes: string }> = {
  viewer: { label: 'Viewer', classes: 'bg-gray-100 text-gray-600' },
  editor: { label: 'Editor', classes: 'bg-blue-100 text-blue-700' },
  admin:  { label: 'Admin',  classes: 'bg-violet-100 text-violet-700' },
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const state = useRouterState()
  const active = state.location.pathname.startsWith(to)
  return (
    <Link
      to={to}
      className={clsx(
        'relative text-sm font-medium px-1 py-0.5 transition-colors',
        active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800',
      )}
    >
      {children}
      {active && (
        <span className="absolute -bottom-[18px] left-0 right-0 h-0.5 bg-violet-500 rounded-full" />
      )}
    </Link>
  )
}

export function Layout() {
  const { isAuthenticated, appUser, signOut } = useAuthContext()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-gray-900 tracking-tight">SOP Platform</span>
            </div>

            {isAuthenticated && appUser ? (
              <div className="flex items-center gap-6">
                {/* Nav links */}
                <nav className="flex items-center gap-6">
                  <NavLink to="/dashboard">Dashboard</NavLink>
                  {appUser.role === 'admin' && (
                    <NavLink to="/settings">Settings</NavLink>
                  )}
                </nav>

                {/* User info */}
                <div className="flex items-center gap-2.5 border-l border-gray-100 pl-5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                      {appUser.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700 hidden sm:block">{appUser.name}</span>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium capitalize', ROLE_CONFIG[appUser.role].classes)}>
                    {ROLE_CONFIG[appUser.role].label}
                  </span>
                  <button
                    onClick={() => void signOut()}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1 font-medium"
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
