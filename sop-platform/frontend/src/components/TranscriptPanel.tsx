import { useMemo, useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSOPStore } from '../hooks/useSOPStore'
import type { TranscriptLine } from '../api/types'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  lines: TranscriptLine[]
  onSeek: (seconds: number) => void
}

export function TranscriptPanel({ lines, onSeek }: Props) {
  const { currentVideoTime } = useSOPStore()
  const [search, setSearch] = useState('')
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null)

  const speakers = useMemo(
    () => Array.from(new Set(lines.map((l) => l.speaker))).sort(),
    [lines],
  )

  const filteredLines = useMemo(() => {
    let result = [...lines].sort((a, b) => a.timestamp_sec - b.timestamp_sec)
    if (speakerFilter) result = result.filter((l) => l.speaker === speakerFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (l) =>
          l.content.toLowerCase().includes(q) ||
          l.speaker.toLowerCase().includes(q),
      )
    }
    return result
  }, [lines, search, speakerFilter])

  // Find the active transcript line: last line whose timestamp <= currentVideoTime
  const activeLineIndex = useMemo(() => {
    if (currentVideoTime <= 0) return -1
    let last = -1
    for (let i = 0; i < filteredLines.length; i++) {
      if (filteredLines[i].timestamp_sec <= currentVideoTime) last = i
      else break
    }
    return last
  }, [filteredLines, currentVideoTime])

  const parentRef = useRef<HTMLDivElement>(null)
  const lastScrolledIndex = useRef(-1)

  const virtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  // Auto-scroll to active line as video plays
  useEffect(() => {
    if (activeLineIndex >= 0 && activeLineIndex !== lastScrolledIndex.current) {
      lastScrolledIndex.current = activeLineIndex
      virtualizer.scrollToIndex(activeLineIndex, { align: 'start' })
    }
  }, [activeLineIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  if (lines.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400">
        No transcript available.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0 space-y-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Synced transcript
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search transcript..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={speakerFilter ?? ''}
            onChange={(e) => setSpeakerFilter(e.target.value || null)}
            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none"
          >
            <option value="">All speakers</option>
            {speakers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Virtualised list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const line = filteredLines[virtualItem.index]
            const isActive = virtualItem.index === activeLineIndex

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: virtualItem.start + 'px',
                  width: '100%',
                }}
                onClick={() => onSeek(line.timestamp_sec)}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-50 border-l-2 transition-colors ${
                  isActive ? 'border-blue-500 bg-blue-50' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-mono tabular-nums ${isActive ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>
                    {formatTime(line.timestamp_sec)}
                  </span>
                  <span className="text-xs font-semibold text-gray-600 truncate">
                    {line.speaker}
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-snug pb-2">{line.content}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
