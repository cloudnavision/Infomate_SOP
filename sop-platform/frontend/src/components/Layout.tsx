import { Link, Outlet } from '@tanstack/react-router'

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <span className="text-lg font-semibold text-gray-900">SOP Platform</span>
            <nav className="flex gap-6">
              <Link
                to="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                activeProps={{ className: 'text-sm text-blue-600 font-medium' }}
              >
                Dashboard
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
