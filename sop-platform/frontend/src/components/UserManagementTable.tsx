import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { fetchUsers, createUser, updateUser, deleteUser, userKeys } from '../api/client'
import { useAuthContext } from '../contexts/AuthContext'
import type { AppUser, UserCreateInput, UserUpdateInput } from '../api/types'

type Role = 'viewer' | 'editor' | 'admin'

const ROLE_CONFIG: Record<Role, { label: string; description: string; badge: string; dot: string }> = {
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to published SOPs',
    badge: 'bg-raised text-secondary border-default',
    dot: 'bg-gray-400',
  },
  editor: {
    label: 'Editor',
    description: 'Can edit steps, tags, callouts and approve',
    badge: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    dot: 'bg-blue-500',
  },
  admin: {
    label: 'Admin',
    description: 'Full access including user management',
    badge: 'bg-violet-500/10 text-violet-500 border-violet-500/30',
    dot: 'bg-violet-500',
  },
}

const ROLES: Role[] = ['viewer', 'editor', 'admin']

function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', cfg.badge)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function UserAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initial}
    </div>
  )
}

// ── Add User Form ──────────────────────────────────────────────────────────────

function AddUserForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: UserCreateInput) => createUser(data),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: userKeys.all }); onClose() },
    onError: (err: Error) => setError(err.message.includes('409') ? 'A user with this email already exists' : err.message),
  })

  return (
    <div className="bg-card border border-default rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-default">Add new user</h3>
          <p className="text-xs text-muted mt-0.5">They'll be able to sign in with their email</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); setError(null); mutation.mutate({ email: email.trim(), name: name.trim(), role }) }}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
            <input
              type="text" required placeholder="e.g. Sarah Johnson"
              value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-input text-secondary border border-default rounded-lg outline-none placeholder:text-muted focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email address</label>
            <input
              type="email" required placeholder="name@company.com"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-input text-secondary border border-default rounded-lg outline-none placeholder:text-muted focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30"
            />
          </div>
        </div>

        {/* Role picker */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted mb-2">Role</label>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(r => {
              const cfg = ROLE_CONFIG[r]
              return (
                <button
                  key={r} type="button"
                  onClick={() => setRole(r)}
                  className={clsx(
                    'text-left p-3 rounded-xl border-2 transition-all',
                    role === r ? 'border-violet-400 bg-violet-500/10' : 'border-subtle hover:border-default bg-card'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={clsx('w-2 h-2 rounded-full', cfg.dot)} />
                    <span className="text-xs font-semibold text-secondary">{cfg.label}</span>
                  </div>
                  <p className="text-xs text-muted leading-snug">{cfg.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="text-xs text-red-600 mb-3 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit" disabled={mutation.isPending}
            className="flex-1 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Adding…' : 'Add user'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted border border-default rounded-lg hover:bg-raised transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── User Row ───────────────────────────────────────────────────────────────────

function UserRow({ user, isSelf }: { user: AppUser; isSelf: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(user.name)
  const [editRole, setEditRole] = useState<Role>(user.role)
  const [confirming, setConfirming] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (data: UserUpdateInput) => updateUser(user.id, data),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: userKeys.all }); setEditing(false); setRowError(null) },
    onError: (err: Error) => setRowError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
    onError: (err: Error) => setRowError(err.message),
  })

  const handleSave = () => {
    setRowError(null)
    const data: UserUpdateInput = {}
    if (editName.trim() !== user.name) data.name = editName.trim()
    if (editRole !== user.role) data.role = editRole
    if (!Object.keys(data).length) { setEditing(false); return }
    updateMutation.mutate(data)
  }

  const handleCancel = () => { setEditName(user.name); setEditRole(user.role); setEditing(false); setRowError(null) }

  return (
    <div className={clsx('flex items-center gap-4 px-5 py-4 border-b border-subtle last:border-0', editing ? 'bg-violet-500/10' : 'hover:bg-raised')}>
      <UserAvatar name={user.name} />

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            value={editName} onChange={e => setEditName(e.target.value)}
            className="text-sm font-medium bg-input text-secondary border border-default rounded-lg px-2.5 py-1 outline-none focus:border-violet-400 w-full max-w-[200px]"
          />
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-default truncate">{user.name}</p>
            {isSelf && <span className="text-xs text-muted bg-raised px-1.5 py-0.5 rounded-full">you</span>}
          </div>
        )}
        <p className="text-xs text-muted truncate mt-0.5">{user.email}</p>
      </div>

      <div className="shrink-0">
        {editing ? (
          <div className="flex gap-1.5">
            {ROLES.map(r => (
              <button
                key={r} onClick={() => setEditRole(r)}
                disabled={isSelf}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-full border font-medium transition-all disabled:opacity-50',
                  editRole === r
                    ? ROLE_CONFIG[r].badge + ' border-current'
                    : 'bg-card text-muted border-default hover:border-default'
                )}
              >
                {ROLE_CONFIG[r].label}
              </button>
            ))}
          </div>
        ) : (
          <RoleBadge role={user.role} />
        )}
      </div>

      {rowError && <p className="text-xs text-red-500 shrink-0 max-w-[140px] truncate">{rowError}</p>}

      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button
              onClick={handleSave} disabled={updateMutation.isPending}
              className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleCancel} className="text-xs px-3 py-1.5 border border-default rounded-lg text-muted hover:bg-raised">
              Cancel
            </button>
          </>
        ) : confirming ? (
          <>
            <span className="text-xs text-muted mr-1">Remove?</span>
            <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium">
              {deleteMutation.isPending ? '…' : 'Yes'}
            </button>
            <button onClick={() => setConfirming(false)} className="text-xs px-2.5 py-1.5 border border-default rounded-lg text-muted hover:bg-raised">
              No
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="text-xs px-3 py-1.5 border border-default rounded-lg text-muted hover:bg-raised transition-colors">
              Edit
            </button>
            <button
              onClick={() => setConfirming(true)} disabled={isSelf}
              className="text-xs w-7 h-7 flex items-center justify-center border border-default rounded-lg text-gray-300 hover:border-red-200 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={isSelf ? 'Cannot remove yourself' : 'Remove access'}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function UserManagementTable() {
  const { appUser } = useAuthContext()
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: users, isLoading, error } = useQuery({
    queryKey: userKeys.all,
    queryFn: fetchUsers,
  })

  const counts = users ? {
    viewer: users.filter(u => u.role === 'viewer').length,
    editor: users.filter(u => u.role === 'editor').length,
    admin:  users.filter(u => u.role === 'admin').length,
  } : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-default">Users</h1>
          <p className="text-sm text-muted mt-0.5">Manage who can access the SOP platform</p>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add user
        </button>
      </div>

      {/* Role summary pills */}
      {counts && (
        <div className="flex gap-2 mb-6">
          {ROLES.map(r => (
            <div key={r} className={clsx('flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border', ROLE_CONFIG[r].badge)}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', ROLE_CONFIG[r].dot)} />
              {counts[r]} {ROLE_CONFIG[r].label}{counts[r] !== 1 ? 's' : ''}
            </div>
          ))}
        </div>
      )}

      {showAddForm && <AddUserForm onClose={() => setShowAddForm(false)} />}

      {isLoading && <p className="text-sm text-muted">Loading users…</p>}
      {error && <p className="text-sm text-red-600 bg-red-500/10 px-4 py-3 rounded-xl">Failed to load users: {(error as Error).message}</p>}

      {users && (
        <div className="bg-card rounded-2xl border border-subtle shadow-sm overflow-hidden">
          {users.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-raised flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <p className="text-sm text-muted">No users yet — add the first one</p>
            </div>
          ) : (
            users.map(user => <UserRow key={user.id} user={user} isSelf={user.id === appUser?.id} />)
          )}
        </div>
      )}
    </div>
  )
}
