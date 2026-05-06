import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { finalizeMerge, fetchSOP, fetchMergeSession, sopKeys } from '../api/client'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { PageLoader, PageError } from '../components/PageLoader'
import type { MergeStepDecision } from '../api/types'

export const Route = createFileRoute('/merge/$sessionId/preview')({
  component: () => (
    <ProtectedRoute requiredRole="editor">
      <PreviewPage />
    </ProtectedRoute>
  ),
})

function PreviewPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()
  const stored = sessionStorage.getItem(`merge-steps-${sessionId}`)
  const steps: MergeStepDecision[] = stored ? JSON.parse(stored) : []

  const { data: session } = useQuery({
    queryKey: ['merge-session', sessionId],
    queryFn: () => fetchMergeSession(sessionId),
  })

  const { data: baseSop } = useQuery({
    queryKey: session ? sopKeys.detail(session.base_sop_id) : ['noop'],
    queryFn: () => fetchSOP(session!.base_sop_id),
    enabled: !!session,
  })
  const { data: updatedSop } = useQuery({
    queryKey: session ? sopKeys.detail(session.updated_sop_id) : ['noop'],
    queryFn: () => fetchSOP(session!.updated_sop_id),
    enabled: !!session,
  })

  const stepById: Record<string, { title: string; description: string | null }> = {}
  baseSop?.steps.forEach(s => { stepById[s.id] = s })
  updatedSop?.steps.forEach(s => { stepById[s.id] = s })

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeMerge(sessionId, steps),
    onSuccess: (data) => {
      navigate({ to: '/sop/$id/procedure', params: { id: data!.merged_sop_id } })
    },
  })

  if (!session) return <PageLoader label="Loading preview…" />

  if (steps.length === 0) {
    return (
      <PageError message="No steps found. Please go back and make your merge decisions.">
        <Link to="/merge/$sessionId" params={{ sessionId }} className="flex items-center gap-1.5 text-blue-500 text-sm mt-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to diff review
        </Link>
      </PageError>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/merge/$sessionId" params={{ sessionId }} className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-800 bg-card border border-default hover:border-default px-3 py-1.5 rounded-lg transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <h1 className="text-2xl font-bold text-default">Preview Merged SOP</h1>
      </div>

      <div className="bg-card border border-subtle rounded-xl shadow-sm p-5">
        <p className="text-sm text-muted mb-4">
          The following <strong>{steps.length} steps</strong> will be combined into a new SOP (status: draft).
        </p>

        <div className="space-y-2">
          {steps.map((decision, i) => {
            const step = stepById[decision.step_id]
            return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-secondary truncate">{step?.title ?? decision.step_id}</p>
                  {step?.description && (
                    <p className="text-xs text-muted truncate">{step.description}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${decision.source === 'updated' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                  {decision.source}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {finalizeMutation.isError && (
        <p className="text-sm text-red-500">{(finalizeMutation.error as Error).message}</p>
      )}

      <div className="flex items-center justify-between">
        <Link to="/merge/$sessionId" params={{ sessionId }} className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted border border-default rounded-xl hover:bg-raised hover:border-default">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <button
          onClick={() => finalizeMutation.mutate()}
          disabled={finalizeMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {finalizeMutation.isPending ? 'Creating…' : (
            <>Create Merged SOP <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></>
          )}
        </button>
      </div>
    </div>
  )
}
