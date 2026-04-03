import { useState } from 'react'
import type { SOPDetail } from '../api/types'

interface Props {
  sop: SOPDetail
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SOPPageHeader({ sop }: Props) {
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href)
    showToast('Link copied!')
  }

  const dateStr = sop.meeting_date
    ? formatDate(sop.meeting_date)
    : formatDate(sop.created_at)

  const meta = [sop.client_name, 'v1.x', dateStr ? `Updated ${dateStr}` : null]
    .filter(Boolean)
    .join(' | ')

  return (
    <div className="flex items-start justify-between pb-4 border-b border-gray-100 mb-4 shrink-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{sop.title}</h1>
        {meta && <p className="text-sm text-gray-500 mt-0.5">{meta}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-1">
        <button
          disabled
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-400 cursor-not-allowed"
        >
          Export DOCX
        </button>
        <button
          disabled
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-400 cursor-not-allowed"
        >
          Export PDF
        </button>
        <button
          onClick={handleShare}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Share link
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
