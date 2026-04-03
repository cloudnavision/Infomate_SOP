import { createFileRoute } from '@tanstack/react-router'
import { ProtectedRoute } from '../components/ProtectedRoute'

export const Route = createFileRoute('/sop/new')({
  component: () => (
    <ProtectedRoute requiredRole="admin">
      <p className="text-gray-400 text-sm">Upload a recording — coming in Phase 4</p>
    </ProtectedRoute>
  ),
})
