import { createFileRoute } from '@tanstack/react-router'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { UserManagementTable } from '../components/UserManagementTable'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const ROLE_PERMISSIONS = [
  {
    role: 'Viewer',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-700 border-gray-200',
    description: 'Read-only access to published SOPs',
    permissions: [
      'Browse and search the dashboard',
      'View SOP procedure pages',
      'Watch embedded KT videos',
      'Read step descriptions and callouts',
    ],
    denied: [
      'Edit tags or step content',
      'Manage callout annotations',
      'Access user settings',
    ],
  },
  {
    role: 'Editor',
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    description: 'Can create and manage SOP content',
    permissions: [
      'All Viewer permissions',
      'Add, edit and remove tags',
      'Reposition and delete callout annotations',
      'Approve SOPs for publishing',
    ],
    denied: [
      'Add or remove users',
      'Change user roles',
    ],
  },
  {
    role: 'Admin',
    dot: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    description: 'Full platform access',
    permissions: [
      'All Editor permissions',
      'Add and remove users',
      'Assign and change user roles',
      'Access the Settings page',
    ],
    denied: [],
  },
]

function RolePermissionsSidebar() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Role Permissions</h2>
        <p className="text-xs text-gray-500 mt-0.5">What each role can and cannot do</p>
      </div>

      {ROLE_PERMISSIONS.map(({ role, dot, badge, description, permissions, denied }) => (
        <div key={role} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {role}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{description}</p>

          <ul className="space-y-1.5 mb-3">
            {permissions.map(p => (
              <li key={p} className="flex items-start gap-2 text-xs text-gray-700">
                <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {p}
              </li>
            ))}
          </ul>

          {denied.length > 0 && (
            <ul className="space-y-1.5 border-t border-gray-50 pt-3">
              {denied.map(d => (
                <li key={d} className="flex items-start gap-2 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function SettingsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
        <UserManagementTable />
        <RolePermissionsSidebar />
      </div>
    </ProtectedRoute>
  )
}
