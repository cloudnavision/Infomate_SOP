import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Pencil, Trash2, X, Check, UserPlus } from 'lucide-react'
import { fetchUsers, createUser, updateUser, deleteUser, userKeys } from '../api/client'
import { useAuthContext } from '../contexts/AuthContext'
import type { AppUser, UserCreateInput, UserUpdateInput } from '../api/types'

type Role = 'viewer' | 'editor' | 'admin'

const ROLE_COLOURS: Record<Role, string> = {
  viewer: 'bg-gray-100 text-gray-700',
  editor: 'bg-blue-100 text-blue-700',
  admin:  'bg-purple-100 text-purple-700',
}

const ROLES: Role[] = ['viewer', 'editor', 'admin']

// ── Add User Form ─────────────────────────────────────────────────────────────

interface AddFormProps {
  onClose: () => void
}

function AddUserForm({ onClose }: AddFormProps) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: UserCreateInput) => createUser(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all })
      onClose()
    },
    onError: (err: Error) => {
      if (err.message.includes('409')) {
        setError('A user with this email already exists')
      } else {
        setError(err.message || 'Failed to add user')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate({ email: email.trim(), name: name.trim(), role })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Add new user</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <input
          type="email"
          required
          placeholder="email@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 capitalize"
        >
          {ROLES.map((r) => (
            <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {mutation.isPending ? 'Adding…' : 'Add user'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Table Row ─────────────────────────────────────────────────────────────────

interface RowProps {
  user: AppUser
  isSelf: boolean
}

function UserRow({ user, isSelf }: RowProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(user.name)
  const [editRole, setEditRole] = useState<Role>(user.role)
  const [rowError, setRowError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (data: UserUpdateInput) => updateUser(user.id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all })
      setEditing(false)
      setRowError(null)
    },
    onError: (err: Error) => setRowError(err.message || 'Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
    onError: (err: Error) => setRowError(err.message || 'Delete failed'),
  })

  const handleSave = () => {
    setRowError(null)
    const data: UserUpdateInput = {}
    if (editName.trim() !== user.name) data.name = editName.trim()
    if (editRole !== user.role) data.role = editRole
    if (Object.keys(data).length === 0) { setEditing(false); return }
    updateMutation.mutate(data)
  }

  const handleDelete = () => {
    if (window.confirm(`Remove ${user.name}'s access to the platform?`)) {
      deleteMutation.mutate()
    }
  }

  const handleCancel = () => {
    setEditName(user.name)
    setEditRole(user.role)
    setEditing(false)
    setRowError(null)
  }

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      {/* Email */}
      <td className="px-4 py-3 text-sm text-gray-700">
        {user.email}
        {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
          />
        ) : (
          <span className="text-sm text-gray-700">{user.name}</span>
        )}
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        {editing ? (
          <select
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as Role)}
            disabled={isSelf}
            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        ) : (
          <span className={clsx('text-xs px-2 py-0.5 rounded-full capitalize', ROLE_COLOURS[user.role])}>
            {user.role}
          </span>
        )}
      </td>

      {/* Error */}
      <td className="px-4 py-3 text-xs text-red-600">
        {rowError}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                title="Save"
                className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
              >
                <Check size={15} />
              </button>
              <button
                onClick={handleCancel}
                title="Cancel"
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                title="Edit"
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={handleDelete}
                disabled={isSelf || deleteMutation.isPending}
                title={isSelf ? 'Cannot delete your own account' : 'Remove access'}
                className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main Table ────────────────────────────────────────────────────────────────

export function UserManagementTable() {
  const { appUser } = useAuthContext()
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: users, isLoading, error } = useQuery({
    queryKey: userKeys.all,
    queryFn: fetchUsers,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Control who can access the SOP platform</p>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} />
          Add user
        </button>
      </div>

      {showAddForm && <AddUserForm onClose={() => setShowAddForm(false)} />}

      {isLoading && <p className="text-sm text-gray-500">Loading users…</p>}
      {error && (
        <p className="text-sm text-red-600">Failed to load users: {(error as Error).message}</p>
      )}

      {users && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    No users yet — add the first one above
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === appUser?.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
