import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ProtectedRoute } from '../components/ProtectedRoute'

export const Route = createFileRoute('/merge')({
  component: () => (
    <ProtectedRoute requiredRole="editor">
      <Outlet />
    </ProtectedRoute>
  ),
})
