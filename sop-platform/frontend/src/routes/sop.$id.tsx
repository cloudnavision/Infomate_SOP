import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOP, sopKeys } from '../api/client'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { useAuth } from '../hooks/useAuth'

export const Route = createFileRoute('/sop/$id')({
  component: () => (
    <ProtectedRoute requiredRole="viewer">
      <SOPLayout />
    </ProtectedRoute>
  ),
})

const ALL_TABS = [
  { label: 'Procedure', path: 'procedure', minRole: 'viewer' },
  { label: 'Overview', path: 'overview', minRole: 'viewer' },
  { label: 'Process Map', path: 'processmap', minRole: 'viewer' },
  { label: 'Metrics', path: 'matrices', minRole: 'editor' },
  { label: 'History', path: 'history', minRole: 'editor' },
] as const

function SOPLayout() {
  const { id } = Route.useParams()
  const { appUser } = useAuth()
  const role = appUser?.role ?? 'viewer'
  const tabs = ALL_TABS.filter(t =>
    t.minRole === 'viewer' || role === 'editor' || role === 'admin'
  )
  const { data: sop, isLoading, error } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })

  if (isLoading) {
    return <p className="text-gray-500">Loading SOP...</p>
  }

  if (error) {
    return <p className="text-red-600">Error: {(error as Error).message}</p>
  }

  if (!sop) {
    return <p className="text-gray-400">SOP not found.</p>
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-secondary leading-tight">{sop.title}</h1>
      </div>

      <nav className="flex gap-1 border-b border-default mb-6">
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            to={`/sop/$id/${tab.path}`}
            params={{ id }}
            className="px-4 py-2 text-sm text-muted hover:text-gray-900 border-b-2 border-transparent -mb-px transition-colors"
            activeProps={{ className: 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-500 -mb-px' }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
