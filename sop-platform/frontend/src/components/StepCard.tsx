import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SOPStep, TranscriptLine } from '../api/types'
import { useAuth } from '../hooks/useAuth'
import { approveStep, renameStep, updateSubSteps, sopKeys } from '../api/client'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'
import { ScreenshotModal } from './ScreenshotModal'
import { AnnotationEditorModal } from './AnnotationEditorModal'

interface Props {
  step: SOPStep | null
  transcriptLines: TranscriptLine[]
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getKTLines(step: SOPStep, lines: TranscriptLine[]): TranscriptLine[] {
  const end = step.timestamp_end ?? Infinity
  const inRange = lines.filter(
    (l) => l.timestamp_sec >= step.timestamp_start && l.timestamp_sec <= end,
  )
  if (inRange.length > 0) return inRange.slice(0, 3)
  // Fallback: single line nearest to timestamp_start
  const nearest = [...lines].sort(
    (a, b) =>
      Math.abs(a.timestamp_sec - step.timestamp_start) -
      Math.abs(b.timestamp_sec - step.timestamp_start),
  )[0]
  return nearest ? [nearest] : []
}

export function StepCard({ step, transcriptLines, onSeek }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [renamingTitle, setRenamingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [editingSubSteps, setEditingSubSteps] = useState(false)
  const [subStepInputs, setSubStepInputs] = useState<string[]>([])
  const { appUser } = useAuth()
  const qc = useQueryClient()
  const canEdit = appUser?.role === 'editor' || appUser?.role === 'admin'

  const subStepsMutation = useMutation({
    mutationFn: (items: string[]) => updateSubSteps(step!.id, items),
    onSuccess: (updated) => {
      if (!updated) return
      qc.setQueryData<{ steps: SOPStep[] }>(
        sopKeys.detail(updated.sop_id),
        (old: any) => old
          ? { ...old, steps: old.steps.map((s: SOPStep) => s.id === updated.id ? updated : s) }
          : old,
      )
      setEditingSubSteps(false)
    },
  })

  const renameMutation = useMutation({
    mutationFn: (title: string) => renameStep(step!.id, title),
    onSuccess: (updated) => {
      if (!updated) return
      qc.setQueryData<{ steps: SOPStep[] }>(
        sopKeys.detail(updated.sop_id),
        (old: any) => old
          ? { ...old, steps: old.steps.map((s: SOPStep) => s.id === updated.id ? updated : s) }
          : old,
      )
      setRenamingTitle(false)
    },
  })

  useEffect(() => {
    if (renamingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [renamingTitle])

  const approveMutation = useMutation({
    mutationFn: () => approveStep(step!.id),
    onSuccess: (updated) => {
      if (!updated) return
      qc.setQueryData<{ steps: SOPStep[] }>(
        sopKeys.detail(updated.sop_id),
        (old: any) => old
          ? { ...old, steps: old.steps.map((s: SOPStep) => s.id === updated.id ? updated : s) }
          : old,
      )
      qc.invalidateQueries({ queryKey: sopKeys.metrics(updated.sop_id) })
    },
  })

  if (!step) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm py-16 h-full">
        Select a step to view details
      </div>
    )
  }

  const screenshotUrl = step.annotated_screenshot_url ?? step.screenshot_url
  const subSteps = Array.isArray(step.sub_steps) ? (step.sub_steps as string[]) : []
  const ktLines = getKTLines(step, transcriptLines)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 space-y-5 overflow-y-auto h-full">
      {/* Step badge + title */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {step.sequence}
        </span>
        {renamingTitle ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              ref={titleInputRef}
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') renameMutation.mutate(titleInput.trim())
                if (e.key === 'Escape') setRenamingTitle(false)
              }}
              className="flex-1 text-sm font-semibold border border-violet-300 rounded-lg px-2.5 py-1 outline-none focus:ring-1 focus:ring-violet-200"
            />
            <button
              onClick={() => renameMutation.mutate(titleInput.trim())}
              disabled={renameMutation.isPending || !titleInput.trim()}
              className="text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium"
            >
              {renameMutation.isPending ? '…' : 'Save'}
            </button>
            <button
              onClick={() => setRenamingTitle(false)}
              className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-start gap-2">
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{step.title}</h2>
            {canEdit && (
              <button
                onClick={() => { setTitleInput(step.title); setRenamingTitle(true) }}
                className="text-gray-400 hover:text-violet-600 mt-0.5 shrink-0 transition-colors"
                title="Rename step"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {step.description && (
        <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
      )}

      {/* Sub-steps */}
      {(subSteps.length > 0 || canEdit) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sub-steps</h4>
            {canEdit && !editingSubSteps && (
              <button
                onClick={() => { setSubStepInputs(subSteps.length ? [...subSteps] : ['']); setEditingSubSteps(true) }}
                className="text-gray-400 hover:text-violet-600 transition-colors"
                title="Edit sub-steps"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </div>

          {editingSubSteps ? (
            <div className="space-y-2">
              {subStepInputs.map((val, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}.</span>
                  <input
                    value={val}
                    onChange={e => setSubStepInputs(prev => prev.map((s, idx) => idx === i ? e.target.value : s))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); setSubStepInputs(prev => [...prev.slice(0, i + 1), '', ...prev.slice(i + 1)]) }
                      if (e.key === 'Backspace' && !val && subStepInputs.length > 1) { e.preventDefault(); setSubStepInputs(prev => prev.filter((_, idx) => idx !== i)) }
                    }}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1 outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-100"
                    placeholder={`Sub-step ${i + 1}`}
                    autoFocus={i === subStepInputs.length - 1 && val === ''}
                  />
                  <button
                    onClick={() => setSubStepInputs(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              <button
                onClick={() => setSubStepInputs(prev => [...prev, ''])}
                className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 mt-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add sub-step
              </button>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => subStepsMutation.mutate(subStepInputs)}
                  disabled={subStepsMutation.isPending}
                  className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium"
                >
                  {subStepsMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingSubSteps(false)}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ul className="space-y-1 list-disc list-inside text-sm text-gray-700">
              {subSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Screenshot thumbnail */}
      {screenshotUrl && (
        <div>
          <img
            src={screenshotUrl}
            alt="Annotated screenshot"
            className="w-full rounded border border-gray-100 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            style={{ maxHeight: '160px', objectPosition: 'top' }}
            onClick={() => setModalOpen(true)}
          />
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => setModalOpen(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              Click to expand full screenshot
            </button>
            {canEdit && (
              <button
                onClick={() => setEditorOpen(true)}
                className="text-xs text-purple-600 hover:underline font-medium"
              >
                ✎ Edit Callouts
              </button>
            )}
          </div>
          {modalOpen && (
            <ScreenshotModal
              src={screenshotUrl}
              alt={`Step ${step.sequence} screenshot`}
              onClose={() => setModalOpen(false)}
            />
          )}
          {editorOpen && canEdit && (
            <AnnotationEditorModal
              sopId={step.sop_id}
              stepId={step.id}
              stepTitle={step.title}
              stepNumber={step.sequence}
              screenshotUrl={screenshotUrl}
              callouts={step.callouts}
              highlight_boxes={step.highlight_boxes || []}
              onClose={() => setEditorOpen(false)}
            />
          )}
        </div>
      )}

      {/* KT session quote */}
      {ktLines.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From the KT session
          </p>
          <div className="space-y-2">
            {ktLines.map((l) => (
              <div key={l.id}>
                <p className="text-sm text-gray-700 italic leading-snug">"{l.content}"</p>
                <p className="text-xs text-gray-400 mt-0.5">{l.speaker}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Play from timestamp */}
      <button
        onClick={() => onSeek(step.timestamp_start)}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <span>▶</span>
        <span>Play from {formatTime(step.timestamp_start)}</span>
      </button>

      {/* Callouts */}
      <CalloutList callouts={step.callouts} />

      {/* Discussions */}
      {step.discussions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Discussion
          </h4>
          {step.discussions.map((d) => (
            <DiscussionCard key={d.id} discussion={d} />
          ))}
        </div>
      )}

      {/* Approve step */}
      {canEdit && (
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              step.is_approved
                ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600'
            }`}
          >
            <span>{step.is_approved ? '✓' : '○'}</span>
            <span>{step.is_approved ? 'Approved' : 'Mark as Approved'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
