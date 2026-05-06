import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { fetchMergeSession, fetchSOP, sopKeys } from '../api/client'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { PageLoader, PageError } from '../components/PageLoader'
import type { MergeStepDecision } from '../api/types'

export const Route = createFileRoute('/merge/$sessionId/')({
  component: () => (
    <ProtectedRoute requiredRole="editor">
      <DiffReviewPage />
    </ProtectedRoute>
  ),
})

const STATUS_COLORS: Record<string, string> = {
  unchanged: 'border-default bg-page',
  changed:   'border-yellow-500/30 bg-yellow-500/10',
  added:     'border-green-500/30 bg-green-500/10',
  removed:   'border-red-500/30 bg-red-500/10',
}

const STATUS_BADGE: Record<string, string> = {
  unchanged: 'bg-raised text-muted',
  changed:   'bg-yellow-500/15 text-yellow-600',
  added:     'bg-green-500/15 text-green-600',
  removed:   'bg-red-500/15 text-red-600',
}

type Decision = 'accept_updated' | 'keep_base' | 'include' | 'exclude'

function DiffReviewPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()

  const { data: session, isLoading: sessionLoading } = useQuery({
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

  const [decisions, setDecisions] = useState<Record<number, Decision>>(() => {
    const stored = sessionStorage.getItem(`merge-decisions-${sessionId}`)
    return stored ? JSON.parse(stored) : {}
  })

  useEffect(() => {
    if (!session || Object.keys(decisions).length > 0) return
    const initial: Record<number, Decision> = {}
    session.matches.forEach((m, i) => {
      if (m.status === 'unchanged') initial[i] = 'accept_updated'
      else if (m.status === 'changed') initial[i] = 'accept_updated'
      else if (m.status === 'added') initial[i] = 'include'
      else if (m.status === 'removed') initial[i] = 'exclude'
    })
    setDecisions(initial)
  }, [session])

  useEffect(() => {
    if (Object.keys(decisions).length > 0)
      sessionStorage.setItem(`merge-decisions-${sessionId}`, JSON.stringify(decisions))
  }, [decisions, sessionId])

  const stepById: Record<string, { title: string; description: string | null }> = {}
  baseSop?.steps.forEach(s => { stepById[s.id] = s })
  updatedSop?.steps.forEach(s => { stepById[s.id] = s })

  const changedUnresolved = session?.matches
    .filter((m, i) => m.status === 'changed' && decisions[i] === undefined)
    .length ?? 0

  const buildFinalSteps = (): MergeStepDecision[] => {
    if (!session) return []
    const steps: MergeStepDecision[] = []
    session.matches.forEach((m, i) => {
      const decision = decisions[i]
      if (m.status === 'unchanged' && m.updated_step_id) {
        steps.push({ step_id: m.updated_step_id, source: 'updated' })
      } else if (m.status === 'changed') {
        if (decision === 'keep_base' && m.base_step_id) {
          steps.push({ step_id: m.base_step_id, source: 'base' })
        } else if (m.updated_step_id) {
          steps.push({ step_id: m.updated_step_id, source: 'updated' })
        }
      } else if (m.status === 'added' && decision === 'include' && m.updated_step_id) {
        steps.push({ step_id: m.updated_step_id, source: 'updated' })
      } else if (m.status === 'removed' && decision === 'include' && m.base_step_id) {
        steps.push({ step_id: m.base_step_id, source: 'base' })
      }
    })
    return steps
  }

  const canProceed = changedUnresolved === 0

  if (sessionLoading) return <PageLoader label="Loading diff…" />
  if (!session) return <PageError message="Session not found or has expired." />

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/merge" search={{ tab: 'groups' }} className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-800 bg-card border border-default hover:border-default px-3 py-1.5 rounded-lg transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <h1 className="text-2xl font-bold text-default">Review Changes</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-card rounded-xl border border-subtle p-4">
          <p className="text-xs font-medium text-muted uppercase mb-1">Original</p>
          <p className="font-medium text-secondary truncate">{baseSop?.title}</p>
          <p className="text-xs text-muted">{baseSop?.meeting_date}</p>
        </div>
        <div className="bg-card rounded-xl border border-subtle p-4">
          <p className="text-xs font-medium text-muted uppercase mb-1">Updated</p>
          <p className="font-medium text-secondary truncate">{updatedSop?.title}</p>
          <p className="text-xs text-muted">{updatedSop?.meeting_date}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {(['unchanged', 'changed', 'added', 'removed'] as const).map(s => (
          <span key={s} className={`px-2.5 py-1 rounded-full font-medium border ${STATUS_BADGE[s]} ${STATUS_COLORS[s]}`}>
            {s}
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {session.matches.map((match, i) => {
          const baseStep = match.base_step_id ? stepById[match.base_step_id] : null
          const updatedStep = match.updated_step_id ? stepById[match.updated_step_id] : null
          const decision = decisions[i]

          return (
            <div key={i} className={`rounded-xl border p-4 space-y-3 ${STATUS_COLORS[match.status]}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[match.status]}`}>
                  {match.status}
                </span>
                {match.change_summary && (
                  <p className="text-xs text-muted flex-1">{match.change_summary}</p>
                )}
              </div>

              {match.status === 'unchanged' && updatedStep && (
                <p className="text-sm text-secondary"><span className="font-medium">{updatedStep.title}</span></p>
              )}

              {match.status === 'changed' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-600">Original</p>
                    <p className="text-sm font-medium text-secondary">{baseStep?.title}</p>
                    <p className="text-xs text-muted line-clamp-3">{baseStep?.description}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-600">Updated</p>
                    <p className="text-sm font-medium text-secondary">{updatedStep?.title}</p>
                    <p className="text-xs text-muted line-clamp-3">{updatedStep?.description}</p>
                  </div>
                </div>
              )}

              {match.status === 'added' && (
                <p className="text-sm text-secondary">
                  <span className="font-medium">{updatedStep?.title}</span>{' '}
                  <span className="text-xs text-muted">(new step)</span>
                </p>
              )}

              {match.status === 'removed' && (
                <p className="text-sm text-secondary">
                  <span className="font-medium">{baseStep?.title}</span>{' '}
                  <span className="text-xs text-muted">(from original)</span>
                </p>
              )}

              {match.status === 'changed' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'accept_updated' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'accept_updated' ? 'bg-green-600 text-white border-green-600' : 'border-default text-muted hover:border-green-400'}`}
                  >
                    Accept updated
                  </button>
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'keep_base' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'keep_base' ? 'bg-amber-500 text-white border-amber-500' : 'border-default text-muted hover:border-amber-400'}`}
                  >
                    Keep original
                  </button>
                </div>
              )}

              {(match.status === 'added' || match.status === 'removed') && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'include' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'include' ? 'bg-blue-600 text-white border-blue-600' : 'border-default text-muted hover:border-blue-400'}`}
                  >
                    Include
                  </button>
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'exclude' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'exclude' ? 'bg-red-500 text-white border-red-500' : 'border-default text-muted hover:border-red-500/40'}`}
                  >
                    Exclude
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Link to="/merge" search={{ tab: 'groups' }} className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted border border-default rounded-xl hover:bg-raised hover:border-default">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <div className="flex items-center gap-3">
          {changedUnresolved > 0 && (
            <p className="text-xs text-amber-600">{changedUnresolved} changed step{changedUnresolved > 1 ? 's' : ''} need a decision</p>
          )}
          <button
            onClick={() => {
              sessionStorage.setItem(`merge-steps-${sessionId}`, JSON.stringify(buildFinalSteps()))
              navigate({ to: '/merge/$sessionId/preview', params: { sessionId } })
            }}
            disabled={!canProceed}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            Next: Preview
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
