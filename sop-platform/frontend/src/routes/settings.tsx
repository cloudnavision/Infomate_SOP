import { createFileRoute } from '@tanstack/react-router'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { UserManagementTable } from '../components/UserManagementTable'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <UserManagementTable />
    </ProtectedRoute>
  )
}
