import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOP, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id')({
  component: SOPLayout,
})

const tabs = [
  { label: 'Procedure', path: 'procedure' },
  { label: 'Overview', path: 'overview' },
  { label: 'Matrices', path: 'matrices' },
  { label: 'History', path: 'history' },
] as const

function SOPLayout() {
  const { id } = Route.useParams()
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{sop.title}</h1>
        {sop.client_name && (
          <p className="text-sm text-gray-500">{sop.client_name}</p>
        )}
      </div>

      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            to={`/sop/$id/${tab.path}`}
            params={{ id }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent -mb-px transition-colors"
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
