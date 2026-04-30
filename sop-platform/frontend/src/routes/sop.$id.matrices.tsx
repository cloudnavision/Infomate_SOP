import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchMetrics, toggleLike, sopKeys } from '../api/client'
import { useAuth } from '../hooks/useAuth'

export const Route = createFileRoute('/sop/$id/matrices')({
  component: MetricsPage,
})

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: JSX.Element
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="bg-card rounded-xl border border-subtle shadow-sm p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-default mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function LikeButton({ liked, count, pending, onToggle }: {
  liked: boolean
  count: number
  pending: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-card rounded-xl border border-subtle shadow-sm p-5">
      <p className="text-sm font-semibold text-secondary mb-3">Your feedback</p>
      <div className="flex items-center gap-4">
        <button
          onClick={onToggle}
          disabled={pending}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-150 active:scale-95 ${
            liked
              ? 'bg-red-500/10 border-red-500/30 text-red-600 hover:bg-red-500/15 shadow-sm'
              : 'bg-card border-default text-muted hover:bg-raised shadow-sm'
          }`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${liked ? 'scale-110' : ''}`}>
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/>
          </svg>
          {liked ? 'Liked' : 'Like this SOP'}
        </button>
        <span className="text-sm text-muted">
          {count === 0 ? 'Be the first to like this' : `${count} ${count === 1 ? 'person' : 'people'} liked this`}
        </span>
      </div>
    </div>
  )
}

function MetricsPage() {
  const { id } = useParams({ from: '/sop/$id/matrices' })
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const role = appUser?.role ?? 'viewer'

  const { data: metrics, isLoading } = useQuery({
    queryKey: sopKeys.metrics(id),
    queryFn: () => fetchMetrics(id),
  })

  const likeMutation = useMutation({
    mutationFn: () => toggleLike(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sopKeys.metrics(id) }),
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 text-muted text-sm py-8">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading metrics…
    </div>
  )

  if (!metrics) return <p className="text-red-500 text-sm">Failed to load metrics.</p>

  const approvalPct = metrics.step_count > 0
    ? Math.round((metrics.approved_step_count / metrics.step_count) * 100)
    : 0

  // ── Viewer: just total views (like button is in the Procedure page) ──────
  if (role === 'viewer') {
    return (
      <div className="max-w-xs">
        <StatCard
          color="bg-blue-500/10 text-blue-500"
          label="Total Views"
          value={metrics.view_count}
          sub="total opens"
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>}
        />
      </div>
    )
  }

  // ── Editor: stats + approval + like ─────────────────────────────────────
  if (role === 'editor') {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard color="bg-blue-500/10 text-blue-500" label="Views" value={metrics.view_count}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>}
          />
          <StatCard color="bg-red-500/10 text-red-500" label="Likes" value={metrics.like_count}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/></svg>}
          />
          <StatCard color="bg-green-500/10 text-green-500" label="Steps" value={`${metrics.approved_step_count}/${metrics.step_count}`} sub={`${approvalPct}% approved`}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
          />
          <StatCard color="bg-orange-500/10 text-orange-500" label="Exports" value={metrics.export_count} sub="DOCX / PDF"
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/></svg>}
          />
        </div>

        {/* Step approval progress */}
        <div className="bg-card rounded-xl border border-subtle shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-secondary">Step Approval Progress</span>
            <span className={`text-sm font-bold ${approvalPct === 100 ? 'text-green-600' : 'text-muted'}`}>{approvalPct}%</span>
          </div>
          <div className="w-full bg-raised rounded-full h-2.5 overflow-hidden">
            <div className={`h-2.5 rounded-full transition-all duration-500 ${approvalPct === 100 ? 'bg-green-500' : approvalPct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
              style={{ width: `${approvalPct}%` }} />
          </div>
          <p className="text-xs text-muted mt-2">{metrics.approved_step_count} of {metrics.step_count} steps approved</p>
        </div>

        <LikeButton liked={metrics.user_liked} count={metrics.like_count} pending={likeMutation.isPending} onToggle={() => likeMutation.mutate()} />
      </div>
    )
  }

  // ── Admin: full view with who liked ─────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard color="bg-blue-500/10 text-blue-500" label="Views" value={metrics.view_count} sub="total opens"
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>}
        />
        <StatCard color="bg-red-500/10 text-red-500" label="Likes" value={metrics.like_count} sub={`${metrics.like_count === 1 ? '1 person' : `${metrics.like_count} people`}`}
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/></svg>}
        />
        <StatCard color="bg-green-500/10 text-green-500" label="Steps" value={`${metrics.approved_step_count}/${metrics.step_count}`} sub={`${approvalPct}% approved`}
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
        />
        <StatCard color="bg-orange-500/10 text-orange-500" label="Exports" value={metrics.export_count} sub="DOCX / PDF"
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/></svg>}
        />
      </div>

      {/* Step approval progress */}
      <div className="bg-card rounded-xl border border-subtle shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-secondary">Step Approval Progress</span>
          <span className={`text-sm font-bold ${approvalPct === 100 ? 'text-green-600' : 'text-muted'}`}>{approvalPct}%</span>
        </div>
        <div className="w-full bg-raised rounded-full h-2.5 overflow-hidden">
          <div className={`h-2.5 rounded-full transition-all duration-500 ${approvalPct === 100 ? 'bg-green-500' : approvalPct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
            style={{ width: `${approvalPct}%` }} />
        </div>
        <p className="text-xs text-muted mt-2">{metrics.approved_step_count} of {metrics.step_count} steps approved</p>
      </div>

      {/* Who liked this — admin only */}
      <div className="bg-card rounded-xl border border-subtle shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-subtle bg-page flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/>
            </svg>
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Who liked this</span>
          </div>
          <span className="text-xs bg-red-500/10 text-red-600 font-semibold px-2 py-0.5 rounded-full border border-red-500/20">
            {metrics.likers.length}
          </span>
        </div>
        {metrics.likers.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted">No likes yet</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {metrics.likers.map((liker) => (
              <li key={liker.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {liker.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-secondary">{liker.name}</p>
                    <p className="text-xs text-muted">{liker.email}</p>
                  </div>
                </div>
                <span className="text-xs text-muted">
                  {new Date(liker.liked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LikeButton liked={metrics.user_liked} count={metrics.like_count} pending={likeMutation.isPending} onToggle={() => likeMutation.mutate()} />
    </div>
  )
}
