import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import type { SOPListItem, SOPStatus } from '../api/types'
import { deleteSOP, sopKeys } from '../api/client'
import { useAuthContext } from '../contexts/AuthContext'

interface Props {
  sop: SOPListItem
}

const statusConfig: Record<SOPStatus, { label: string; accent: string; badge: string; dot: string }> = {
  processing: { label: 'Processing', accent: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
  draft:      { label: 'Draft',      accent: 'bg-gray-300',   badge: 'bg-gray-50 text-gray-600 border-gray-200',    dot: 'bg-gray-400' },
  in_review:  { label: 'In Review',  accent: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-200',    dot: 'bg-blue-500' },
  published:  { label: 'Published',  accent: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  archived:   { label: 'Archived',   accent: 'bg-gray-200',   badge: 'bg-gray-50 text-gray-400 border-gray-200',    dot: 'bg-gray-300' },
}

const PIPELINE_STAGES = [
  'transcribing',
  'detecting_screenshare',
  'extracting_frames',
  'deduplicating',
  'classifying_frames',
  'generating_annotations',
  'extracting_clips',
  'generating_sections',
]

const stageLabel: Record<string, string> = {
  transcribing:           'Transcribing',
  detecting_screenshare:  'Detecting screen',
  extracting_frames:      'Extracting frames',
  deduplicating:          'Deduplicating',
  classifying_frames:     'Classifying',
  generating_annotations: 'Annotating',
  extracting_clips:       'Clipping',
  generating_sections:    'Generating sections',
}

function PipelineProgress({ stage }: { stage: string | null }) {
  if (!stage) return null
  const idx = PIPELINE_STAGES.indexOf(stage)
  const pct = idx < 0 ? 5 : Math.round(((idx + 1) / PIPELINE_STAGES.length) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-blue-600 font-medium flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          {stageLabel[stage] ?? stage}…
        </span>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
      <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Initials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(w => /[a-zA-Z0-9]/.test(w[0]))
  const letters = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`
    : name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2)
  return letters.toUpperCase()
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SOPCard({ sop }: Props) {
  const navigate = useNavigate()
  const { appUser } = useAuthContext()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const cfg = statusConfig[sop.status] ?? statusConfig.draft
  const canDelete = appUser?.role === 'editor' || appUser?.role === 'admin'

  const deleteMutation = useMutation({
    mutationFn: () => deleteSOP(sop.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sopKeys.all }),
  })

  const isPipelineRunning = sop.pipeline_status && sop.pipeline_status !== 'completed' && sop.pipeline_status !== 'failed'
  // Strip timestamp noise like "20251231 150143" from raw titles
  const cleanTitle = sop.title.replace(/\b\d{8}\s+\d{6}\b/g, '').replace(/\s{2,}/g, ' ').trim()
  const displayName = sop.process_name || cleanTitle
  const subtitle = sop.client_name ?? null

  return (
    <div
      onClick={() => navigate({ to: '/sop/$id/procedure', params: { id: sop.id } })}
      className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-gray-200 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top accent */}
      <div className={clsx('h-1', cfg.accent)} />

      <div className="p-5 space-y-4">
        {/* Header: avatar + title + badge */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={clsx(
            'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold',
            cfg.accent,
          )}>
            <Initials name={displayName} />
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
              {displayName}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>

          {/* Status badge */}
          <span className={clsx(
            'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border flex items-center gap-1',
            cfg.badge,
          )}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
        </div>

        {/* Pipeline progress bar */}
        {isPipelineRunning && sop.pipeline_stage && (
          <PipelineProgress stage={sop.pipeline_stage} />
        )}
        {sop.pipeline_status === 'failed' && (
          <p className="text-xs text-red-500 font-medium flex items-center gap-1">
            <span>⚠</span> Pipeline failed
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-50">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{sop.step_count} {sop.step_count === 1 ? 'step' : 'steps'}</span>
            {sop.meeting_date && <span>·</span>}
            {sop.meeting_date && <span>{formatDate(sop.meeting_date)}</span>}
          </div>

          <div
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {!confirming ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate({ to: '/sop/$id/procedure', params: { id: sop.id } }) }}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Open
                </button>
                {canDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
                    className="text-xs w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg text-gray-300 hover:border-red-200 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
                  className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate() }}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
