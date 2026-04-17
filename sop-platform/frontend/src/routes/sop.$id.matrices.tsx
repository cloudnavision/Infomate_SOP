import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchMetrics, toggleLike, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id/matrices')({
  component: MatricesPage,
})

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function MatricesPage() {
  const { id } = useParams({ from: '/sop/$id/matrices' })
  const qc = useQueryClient()

  const { data: metrics, isLoading } = useQuery({
    queryKey: sopKeys.metrics(id),
    queryFn: () => fetchMetrics(id),
  })

  const likeMutation = useMutation({
    mutationFn: () => toggleLike(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sopKeys.metrics(id) }),
  })

  if (isLoading) return <p className="text-gray-400 text-sm">Loading metrics…</p>
  if (!metrics) return <p className="text-red-500 text-sm">Failed to load metrics.</p>

  const approvalPct = metrics.step_count > 0
    ? Math.round((metrics.approved_step_count / metrics.step_count) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Views" value={metrics.view_count} sub="total opens" />
        <MetricCard label="Likes" value={metrics.like_count} />
        <MetricCard
          label="Steps"
          value={`${metrics.approved_step_count} / ${metrics.step_count}`}
          sub={`${approvalPct}% approved`}
        />
        <MetricCard label="Exports" value={metrics.export_count} sub="DOCX / PDF" />
      </div>

      {/* Like button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
            metrics.user_liked
              ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span>{metrics.user_liked ? '♥' : '♡'}</span>
          <span>{metrics.user_liked ? 'Liked' : 'Like this SOP'}</span>
        </button>
        <span className="text-sm text-gray-400">{metrics.like_count} {metrics.like_count === 1 ? 'person' : 'people'} liked this</span>
      </div>

    </div>
  )
}
