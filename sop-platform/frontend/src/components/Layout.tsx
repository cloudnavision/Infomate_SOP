import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { useAuthContext } from '../contexts/AuthContext'
import { useTheme, type Theme } from '../contexts/ThemeContext'

const ROLE_CONFIG: Record<'viewer' | 'editor' | 'admin', { label: string; classes: string }> = {
  viewer: { label: 'Viewer', classes: 'bg-raised text-muted' },
  editor: { label: 'Editor', classes: 'bg-blue-500/10 text-blue-400' },
  admin:  { label: 'Admin',  classes: 'bg-violet-500/10 text-violet-400' },
}

function SunIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function SlateIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 010 18" fill="currentColor" fillOpacity="0.3" stroke="none" />
    </svg>
  )
}

const THEMES: { value: Theme; label: string; Icon: () => JSX.Element }[] = [
  { value: 'light', label: 'Light mode', Icon: SunIcon },
  { value: 'dark',  label: 'Dark mode',  Icon: MoonIcon },
  { value: 'gray',  label: 'Gray mode',  Icon: SlateIcon },
]

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const state = useRouterState()
  const active = state.location.pathname.startsWith(to)
  return (
    <Link
      to={to}
      className={clsx(
        'relative text-sm font-medium px-1 py-0.5 transition-colors',
        active ? 'text-default' : 'text-muted hover:text-secondary',
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
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-card border-b border-subtle sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-default tracking-tight">SOP Platform</span>
            </div>

            {isAuthenticated && appUser ? (
              <div className="flex items-center gap-4">
                {/* Nav links */}
                <nav className="flex items-center gap-6">
                  <NavLink to="/dashboard">Dashboard</NavLink>
                  {appUser.role === 'admin' && (
                    <NavLink to="/settings">Settings</NavLink>
                  )}
                </nav>

                {/* Theme toggle */}
                <div className="flex items-center gap-0.5 border border-default rounded-lg p-0.5">
                  {THEMES.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      title={label}
                      className={clsx(
                        'w-6 h-6 rounded-md flex items-center justify-center transition-colors',
                        theme === value
                          ? 'bg-raised text-default'
                          : 'text-muted hover:text-secondary',
                      )}
                    >
                      <Icon />
                    </button>
                  ))}
                </div>

                {/* User info */}
                <div className="flex items-center gap-2.5 border-l border-subtle pl-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                      {appUser.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-secondary hidden sm:block">{appUser.name}</span>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium capitalize', ROLE_CONFIG[appUser.role].classes)}>
                    {ROLE_CONFIG[appUser.role].label}
                  </span>
                  <button
                    onClick={() => void signOut()}
                    className="text-xs text-muted hover:text-red-500 transition-colors ml-1 font-medium"
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
