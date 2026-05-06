import { createFileRoute } from '@tanstack/react-router'
import clsx from 'clsx'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { UserManagementTable } from '../components/UserManagementTable'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const ROLE_PERMISSIONS = [
  {
    role: 'Viewer',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
    ),
    iconColor: 'text-zinc-400',
    accent: 'border-l-zinc-400',
    dotColor: 'bg-zinc-400',
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
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
    ),
    iconColor: 'text-blue-500',
    accent: 'border-l-blue-500',
    dotColor: 'bg-blue-500',
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
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    ),
    iconColor: 'text-violet-500',
    accent: 'border-l-violet-500',
    dotColor: 'bg-violet-500',
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
    <div className="space-y-3">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-default flex items-center gap-2">
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          Role Permissions
        </h2>
        <p className="text-xs text-muted mt-0.5 pl-6">What each role can and cannot do</p>
      </div>

      {ROLE_PERMISSIONS.map(({ role, icon, iconColor, accent, dotColor, description, permissions, denied }) => (
        <div key={role} className={clsx('bg-card rounded-xl border border-subtle border-l-4 shadow-sm overflow-hidden', accent)}>
          {/* Role header */}
          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-subtle">
            <div className={clsx('shrink-0', iconColor)}>{icon}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-default">{role}</span>
                <span className={clsx('w-1.5 h-1.5 rounded-full', dotColor)} />
              </div>
              <p className="text-[11px] text-muted leading-tight">{description}</p>
            </div>
          </div>

          {/* Permissions */}
          <div className="px-3.5 py-3 space-y-1.5">
            {permissions.map(p => (
              <div key={p} className="flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <span className="text-[11px] text-secondary leading-tight">{p}</span>
              </div>
            ))}
            {denied.length > 0 && (
              <div className="border-t border-subtle pt-2.5 mt-2.5 space-y-1.5">
                {denied.map(d => (
                  <div key={d} className="flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-muted/40 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    <span className="text-[11px] text-muted leading-tight">{d}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SettingsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">
        <UserManagementTable />
        <RolePermissionsSidebar />
      </div>
    </ProtectedRoute>
  )
}
