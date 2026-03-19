import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOPs, sopKeys } from '../api/client'
import { SOPCard } from '../components/SOPCard'
import { ProtectedRoute } from '../components/ProtectedRoute'

export const Route = createFileRoute('/dashboard')({
  component: () => (
    <ProtectedRoute requiredRole="viewer">
      <Dashboard />
    </ProtectedRoute>
  ),
})

function Dashboard() {
  const { data: sops, isLoading, error } = useQuery({
    queryKey: sopKeys.all,
    queryFn: fetchSOPs,
  })

  if (isLoading) {
    return <p className="text-gray-500">Loading SOPs...</p>
  }

  if (error) {
    return <p className="text-red-600">Error loading SOPs: {(error as Error).message}</p>
  }

  if (!sops || sops.length === 0) {
    return <p className="text-gray-400">No SOPs found.</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sops.map((sop) => (
          <SOPCard key={sop.id} sop={sop} />
        ))}
      </div>
    </div>
  )
}
