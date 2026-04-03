import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import { fetchTranscript, sopKeys } from '../api/client'
import { useSOPStore } from '../hooks/useSOPStore'

interface Props {
  sopId: string
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TranscriptPanel({ sopId, onSeek }: Props) {
  const { selectedStepId } = useSOPStore()
  const [search, setSearch] = useState('')

  const { data: lines = [] } = useQuery({
    queryKey: sopKeys.transcript(sopId),
    queryFn: () => fetchTranscript(sopId),
  })

  // Derived filtered array — never mutates the React Query cache
  const filteredLines = useMemo(() => {
    if (!search.trim()) return lines
    const q = search.toLowerCase()
    return lines.filter(
      (l) =>
        l.content.toLowerCase().includes(q) ||
        l.speaker.toLowerCase().includes(q),
    )
  }, [lines, search])

  const parentRef = useRef<HTMLDivElement>(null)

  // Fixed-height rows: content capped by line-clamp-3, estimateSize reliable
  const virtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  // Auto-scroll to first line linked to the selected step
  useEffect(() => {
    if (!selectedStepId) return
    const idx = filteredLines.findIndex((l) => l.linked_step_id === selectedStepId)
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'start' })
    }
  }, [selectedStepId, filteredLines]) // eslint-disable-line react-hooks/exhaustive-deps

  if (lines.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400 border-l border-gray-100">
        No transcript available.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col border-l border-gray-100 bg-white">
      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <input
          type="text"
          placeholder="Search transcript..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Virtualised list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const line = filteredLines[virtualItem.index]
            const isLinked = line.linked_step_id === selectedStepId

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: virtualItem.start + 'px',
                  width: '100%',
                  height: '72px',
                }}
                onClick={() => onSeek(line.timestamp_sec)}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-50 border-l-2 transition-colors ${
                  isLinked ? 'border-blue-400 bg-blue-50' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-gray-400 font-mono tabular-nums">
                    {formatTime(line.timestamp_sec)}
                  </span>
                  <span className="text-xs font-semibold text-gray-600 truncate">
                    {line.speaker}
                  </span>
                </div>
                {/* line-clamp-3 enforces fixed height matching estimateSize */}
                <p className="text-sm text-gray-700 leading-snug line-clamp-3">{line.content}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
