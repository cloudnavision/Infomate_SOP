import { Link } from '@tanstack/react-router'
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

export function SOPCard({ sop }: Props) {
  const status = statusConfig[sop.status] ?? statusConfig.draft

  return (
    <Link
      to="/sop/$id/procedure"
      params={{ id: sop.id }}
      className="block bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100"
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
        <p className="text-sm text-gray-400 mb-3">{sop.process_name}</p>
      )}
      <div className="flex items-center gap-4 text-xs text-gray-400 mt-auto">
        <span>{sop.step_count} steps</span>
        {sop.meeting_date && <span>{sop.meeting_date}</span>}
      </div>
    </Link>
  )
}
