import { useAuthContext } from '../contexts/AuthContext'

export function AccessDenied() {
  const { user, signOut } = useAuthContext()

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="bg-card rounded-xl shadow-md p-8 w-full max-w-sm text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-default mb-2">Access Denied</h2>

        {user?.email && (
          <p className="text-sm text-muted mb-1">
            Your account (<span className="font-medium">{user.email}</span>) is not registered
            for this platform.
          </p>
        )}

        <p className="text-sm text-muted mb-6">
          Contact your administrator to request access.
        </p>

        <button
          onClick={() => void signOut()}
          className="w-full px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
