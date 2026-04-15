import { useState } from 'react'
import type { SOPDetail } from '../api/types'
import { exportSOP } from '../api/client'

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
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href)
    showToast('Link copied!')
  }

  async function handleExport(format: 'docx' | 'pdf') {
    setExporting(format)
    showToast('Generating…')
    try {
      const { download_url, filename } = await exportSOP(sop.id, format)
      const a = document.createElement('a')
      a.href = download_url
      a.download = filename
      a.click()
      showToast('Download started!')
    } catch {
      showToast('Export failed')
    } finally {
      setExporting(null)
    }
  }

  const dateStr = sop.meeting_date
    ? formatDate(sop.meeting_date)
    : formatDate(sop.created_at)

  // Use process_name if available, otherwise strip timestamp noise from raw title
  const displayTitle = sop.process_name
    || sop.title.replace(/\b\d{8}\s+\d{6}\b/g, '').replace(/\s{2,}/g, ' ').trim()

  const meta = [sop.client_name, sop.process_name ? null : null, dateStr ? `Updated ${dateStr}` : null]
    .filter(Boolean)
    .join(' | ')

  return (
    <div className="flex items-start justify-between pb-4 border-b border-gray-100 mb-4 shrink-0">
      <div>
        <h1 className="text-xl font-bold text-gray-900 leading-snug">{displayTitle}</h1>
        {meta && <p className="text-sm text-gray-500 mt-0.5">{meta}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-1">
        <button
          onClick={() => handleExport('docx')}
          disabled={exporting !== null}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting === 'docx' ? 'Generating…' : 'Export DOCX'}
        </button>
        <button
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting === 'pdf' ? 'Generating…' : 'Export PDF'}
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
