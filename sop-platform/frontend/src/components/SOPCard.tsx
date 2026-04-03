import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import type { SOPListItem, SOPStatus } from '../api/types'

interface Props {
  sop: SOPListItem
}

const statusConfig: Record<SOPStatus, { label: string; className: string }> = {
  processing: { label: 'Processing', className: 'bg-amber-100 text-amber-800' },
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-800' },
  in_review: { label: 'In Review', className: 'bg-blue-100 text-blue-800' },
  published: { label: 'Published', className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', className: 'bg-gray-200 text-gray-600' },
}

function PipelineBadge({ status, stage }: { status: string | null; stage: string | null }) {
  if (!status || status === 'completed') return null
  if (status === 'failed') {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
        Pipeline failed
      </span>
    )
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
      Processing… {stage ? `(${stage})` : ''}
    </span>
  )
}

export function SOPCard({ sop }: Props) {
  const navigate = useNavigate()
  const status = statusConfig[sop.status] ?? statusConfig.draft

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    navigate({ to: '/sop/$id/procedure', params: { id: sop.id } })
  }

  return (
    <div
      onClick={() => navigate({ to: '/sop/$id/procedure', params: { id: sop.id } })}
      className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="text-base font-semibold text-gray-900 leading-snug">{sop.title}</h3>
        <span className={clsx('shrink-0 text-xs font-medium px-2.5 py-1 rounded-full', status.className)}>
          {status.label}
        </span>
      </div>
      {sop.client_name && (
        <p className="text-sm text-gray-500 mb-1">{sop.client_name}</p>
      )}
      {sop.process_name && (
        <p className="text-sm text-gray-400 mb-2">{sop.process_name}</p>
      )}

      <div className="mb-3 min-h-[20px]">
        <PipelineBadge status={sop.pipeline_status} stage={sop.pipeline_stage} />
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{sop.step_count} steps</span>
          {sop.meeting_date && <span>{sop.meeting_date}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpen}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Open →
          </button>
          <button
            disabled
            title="Export not available yet"
            onClick={(e) => e.stopPropagation()}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-400 cursor-not-allowed"
          >
            Export PDF
          </button>
        </div>
      </div>
    </div>
  )
}
