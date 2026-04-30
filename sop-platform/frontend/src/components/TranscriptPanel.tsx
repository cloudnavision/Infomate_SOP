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
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="px-3 py-2 border-b border-subtle bg-page shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 text-amber-500">
              <path d="M1 2a1 1 0 011-1h8a1 1 0 011 1v.5H1V2zm0 2h10v1H1V4zm0 2.5h10v1H1v-1zM1 9h6v1H1V9z"/>
            </svg>
          </span>
          <span className="text-xs font-bold text-muted uppercase tracking-wide">
            Synced Transcript
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search transcript..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm px-3 py-1.5 bg-input text-secondary border border-default rounded-md placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-blue-400/50"
          />
          <select
            value={speakerFilter ?? ''}
            onChange={(e) => setSpeakerFilter(e.target.value || null)}
            className="text-xs bg-input text-muted border border-default rounded px-2 py-1 focus:outline-none"
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
                className={`px-3 py-2 cursor-pointer hover:bg-raised border-l-2 transition-colors ${
                  isActive ? 'border-blue-500 bg-blue-500/10' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-mono tabular-nums ${isActive ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>
                    {formatTime(line.timestamp_sec)}
                  </span>
                  <span className="text-xs font-semibold text-muted truncate">
                    {line.speaker}
                  </span>
                </div>
                <p className="text-sm text-secondary leading-snug pb-2">{line.content}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
