import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { fetchUsers, createUser, updateUser, deleteUser, userKeys } from '../api/client'
import { useAuthContext } from '../contexts/AuthContext'
import type { AppUser, UserCreateInput, UserUpdateInput } from '../api/types'

type Role = 'viewer' | 'editor' | 'admin'

const ROLE_CONFIG: Record<Role, {
  label: string
  description: string
  badge: string
  dot: string
  ring: string
  selectedBg: string
}> = {
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to published SOPs',
    badge: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
    dot: 'bg-zinc-400',
    ring: 'ring-zinc-200',
    selectedBg: 'border-zinc-400 bg-zinc-500/10',
  },
  editor: {
    label: 'Editor',
    description: 'Edit steps, tags, callouts and approve',
    badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    dot: 'bg-blue-500',
    ring: 'ring-blue-200',
    selectedBg: 'border-blue-400 bg-blue-500/10',
  },
  admin: {
    label: 'Admin',
    description: 'Full access including user management',
    badge: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
    dot: 'bg-violet-500',
    ring: 'ring-violet-200',
    selectedBg: 'border-violet-400 bg-violet-500/10',
  },
}

const ROLES: Role[] = ['viewer', 'editor', 'admin']

const AVATAR_GRADIENTS = [
  'from-violet-500 to-indigo-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-fuchsia-500 to-purple-500',
  'from-sky-500 to-blue-500',
]

function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

function UserAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const gradient = avatarGradient(name)
  const initials = name.trim().split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs'
  return (
    <div className={clsx(`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold shrink-0`, sizeClass)}>
      {initials || '?'}
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', cfg.badge)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

// ── Add User Panel ─────────────────────────────────────────────────────────────

function AddUserPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: UserCreateInput) => createUser(data),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: userKeys.all }); onClose() },
    onError: (err: Error) => setError(err.message.includes('409') ? 'A user with this email already exists.' : err.message),
  })

  return (
    <div className="border border-violet-200 bg-violet-500/5 rounded-2xl p-5 mb-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-default">Invite new user</h3>
            <p className="text-xs text-muted">They'll be able to sign in with their email</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-raised flex items-center justify-center text-muted transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); setError(null); mutation.mutate({ email: email.trim(), name: name.trim(), role }) }}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <input
                type="text" required placeholder="Sarah Johnson"
                value={name} onChange={e => setName(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-input text-secondary border border-default rounded-lg outline-none placeholder:text-muted/60 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email address</label>
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <input
                type="email" required placeholder="name@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-input text-secondary border border-default rounded-lg outline-none placeholder:text-muted/60 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 transition"
              />
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted mb-2">Assign role</label>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(r => {
              const cfg = ROLE_CONFIG[r]
              return (
                <button
                  key={r} type="button" onClick={() => setRole(r)}
                  className={clsx(
                    'text-left p-3 rounded-xl border-2 transition-all duration-150',
                    role === r ? cfg.selectedBg : 'border-subtle hover:border-default bg-card'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={clsx('w-2 h-2 rounded-full', cfg.dot)} />
                    <span className={clsx('text-xs font-semibold', role === r ? 'text-default' : 'text-secondary')}>{cfg.label}</span>
                  </div>
                  <p className="text-[11px] text-muted leading-snug">{cfg.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-500/10 border border-red-200/50 px-3 py-2 rounded-lg mb-3">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit" disabled={mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {mutation.isPending ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Adding…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Send invite
              </>
            )}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted border border-default rounded-lg hover:bg-raised transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── User Card ──────────────────────────────────────────────────────────────────

function UserCard({ user, isSelf }: { user: AppUser; isSelf: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(user.name)
  const [editRole, setEditRole] = useState<Role>(user.role as Role)
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

  const handleCancel = () => { setEditName(user.name); setEditRole(user.role as Role); setEditing(false); setRowError(null) }

  return (
    <div className={clsx(
      'flex items-center gap-4 px-5 py-4 border-b border-subtle last:border-0 transition-colors duration-100',
      editing ? 'bg-violet-500/5' : confirming ? 'bg-red-500/5' : 'hover:bg-raised/60'
    )}>
      <UserAvatar name={user.name} />

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={editName} onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
            className="text-sm font-medium bg-input text-secondary border border-violet-300 rounded-lg px-2.5 py-1 outline-none focus:ring-1 focus:ring-violet-400/30 w-full max-w-[220px]"
          />
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-default truncate">{user.name}</p>
            {isSelf && <span className="text-[10px] text-violet-600 bg-violet-500/10 px-1.5 py-0.5 rounded-full font-medium border border-violet-200/50">you</span>}
          </div>
        )}
        <p className="text-xs text-muted truncate mt-0.5">{user.email}</p>
        {rowError && <p className="text-[11px] text-red-500 mt-0.5">{rowError}</p>}
      </div>

      <div className="shrink-0">
        {editing ? (
          <div className="flex gap-1">
            {ROLES.map(r => (
              <button
                key={r} onClick={() => setEditRole(r)}
                disabled={isSelf && r !== editRole}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-full border font-medium transition-all disabled:opacity-40',
                  editRole === r ? clsx(ROLE_CONFIG[r].badge, 'shadow-sm') : 'bg-card text-muted border-default hover:border-default'
                )}
              >
                {ROLE_CONFIG[r].label}
              </button>
            ))}
          </div>
        ) : (
          <RoleBadge role={user.role as Role} />
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button
              onClick={handleSave} disabled={updateMutation.isPending}
              className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium shadow-sm transition-colors"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleCancel} className="text-xs px-3 py-1.5 border border-default rounded-lg text-muted hover:bg-raised transition-colors">
              Cancel
            </button>
          </>
        ) : confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500 font-medium">Remove user?</span>
            <button
              onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
              className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium shadow-sm transition-colors"
            >
              {deleteMutation.isPending ? '…' : 'Yes, remove'}
            </button>
            <button onClick={() => setConfirming(false)} className="text-xs px-2.5 py-1.5 border border-default rounded-lg text-muted hover:bg-raised transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 border border-default rounded-lg text-muted hover:bg-raised hover:text-secondary transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirming(true)} disabled={isSelf}
              title={isSelf ? 'Cannot remove yourself' : 'Remove access'}
              className="w-7 h-7 flex items-center justify-center border border-default rounded-lg text-muted/50 hover:border-red-200 hover:text-red-400 hover:bg-red-500/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')

  const { data: users, isLoading, error } = useQuery({
    queryKey: userKeys.all,
    queryFn: fetchUsers,
  })

  const counts = useMemo(() => users ? {
    all: users.length,
    viewer: users.filter(u => u.role === 'viewer').length,
    editor: users.filter(u => u.role === 'editor').length,
    admin: users.filter(u => u.role === 'admin').length,
  } : null, [users])

  const filtered = useMemo(() => {
    if (!users) return []
    return users.filter(u => {
      const matchRole = roleFilter === 'all' || u.role === roleFilter
      const q = search.toLowerCase()
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      return matchRole && matchSearch
    })
  }, [users, search, roleFilter])

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl font-bold text-default">Team Members</h1>
            {counts && (
              <span className="text-xs font-medium text-muted bg-raised border border-subtle px-2 py-0.5 rounded-full">
                {counts.all} {counts.all === 1 ? 'user' : 'users'}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">Manage who can access the SOP platform</p>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all shadow-sm',
            showAddForm
              ? 'bg-violet-700 text-white'
              : 'bg-violet-600 text-white hover:bg-violet-700'
          )}
        >
          <svg className={clsx('w-4 h-4 transition-transform duration-200', showAddForm && 'rotate-45')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          {showAddForm ? 'Cancel' : 'Add user'}
        </button>
      </div>

      {showAddForm && <AddUserPanel onClose={() => setShowAddForm(false)} />}

      {/* Stats row */}
      {counts && counts.all > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {ROLES.map(r => {
            const cfg = ROLE_CONFIG[r]
            const pct = counts.all > 0 ? Math.round((counts[r] / counts.all) * 100) : 0
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
                className={clsx(
                  'flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150',
                  roleFilter === r ? cfg.selectedBg + ' shadow-sm' : 'border-subtle bg-card hover:border-default hover:bg-raised/50'
                )}
              >
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', cfg.badge.split(' ')[0])}>
                  <span className={clsx('text-sm font-bold', cfg.badge.split(' ')[1])}>{counts[r]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-default">{cfg.label}s</p>
                  <p className="text-[11px] text-muted">{pct}% of team</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Search + filter bar */}
      {users && users.length > 3 && (
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <svg className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text" placeholder="Search by name or email…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-sm bg-input border border-default rounded-lg outline-none placeholder:text-muted/60 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {(['all', ...ROLES] as const).map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={clsx(
                  'text-xs px-3 py-2 rounded-lg border font-medium transition-all',
                  roleFilter === r
                    ? r === 'all'
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : clsx(ROLE_CONFIG[r].badge, 'shadow-sm')
                    : 'bg-card text-muted border-default hover:border-default hover:bg-raised'
                )}
              >
                {r === 'all' ? 'All' : ROLE_CONFIG[r].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="bg-card rounded-2xl border border-subtle shadow-sm p-8 flex items-center justify-center gap-3">
          <svg className="w-5 h-5 text-violet-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <span className="text-sm text-muted">Loading team members…</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-sm text-red-600 bg-red-500/10 border border-red-200/50 px-4 py-3 rounded-xl">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          Failed to load users: {(error as Error).message}
        </div>
      )}

      {users && (
        <div className="bg-card rounded-2xl border border-subtle shadow-sm overflow-hidden">
          {users.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-raised flex items-center justify-center mx-auto mb-4 border border-subtle">
                <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <p className="text-sm font-medium text-default mb-1">No team members yet</p>
              <p className="text-xs text-muted">Add the first user to get started</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted">No users match your search</p>
              <button onClick={() => { setSearch(''); setRoleFilter('all') }} className="text-xs text-violet-600 hover:text-violet-700 mt-2 underline">
                Clear filters
              </button>
            </div>
          ) : (
            filtered.map(user => <UserCard key={user.id} user={user} isSelf={user.id === appUser?.id} />)
          )}
        </div>
      )}
    </div>
  )
}
