import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchAPI } from '../api/client'
import type { ActivityEvent } from '../api/types'
import { InlineLoader } from '../components/PageLoader'

export const Route = createFileRoute('/sop/$id/history')({
  component: HistoryPage,
})

const INITIAL_LIMIT = 15

// ── SVG icons ─────────────────────────────────────────────────────────────────
const Icon = {
  Plus: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
    </svg>
  ),
  Play: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
    </svg>
  ),
  Mic: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
    </svg>
  ),
  Monitor: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd"/>
    </svg>
  ),
  Camera: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
    </svg>
  ),
  Tag: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
    </svg>
  ),
  Film: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h2v-2h-2zm-2-2H7v4h6v-4zm4 0h-2v2h2v-2zM5 5H3v2h2V5zm0 4H3v2h2V9zm0 4H3v2h2v-2zm12-8h-2v2h2V5zm0 4h-2v2h2V9z" clipRule="evenodd"/>
    </svg>
  ),
  FileText: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
    </svg>
  ),
  XCircle: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
    </svg>
  ),
  Download: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  ),
  Pencil: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
    </svg>
  ),
  ThumbUp: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  ),
}

// ── Per-event styling ─────────────────────────────────────────────────────────
function resolveEvent(event: ActivityEvent): {
  IconComp: () => JSX.Element
  bg: string
  ring: string
  iconColor: string
  labelColor: string
} {
  const label = event.label.toLowerCase()

  if (event.event_type === 'export')
    return { IconComp: Icon.Download, bg: 'bg-orange-500/10', ring: 'ring-orange-500/30', iconColor: 'text-orange-500', labelColor: 'text-orange-600 dark:text-orange-400' }
  if (event.event_type === 'approved')
    return { IconComp: Icon.ThumbUp, bg: 'bg-green-500/10', ring: 'ring-green-500/30', iconColor: 'text-green-600', labelColor: 'text-green-600 dark:text-green-400' }
  if (event.event_type === 'edit')
    return { IconComp: Icon.Pencil, bg: 'bg-violet-500/10', ring: 'ring-violet-500/30', iconColor: 'text-violet-500', labelColor: 'text-violet-600 dark:text-violet-400' }
  if (event.event_type === 'created')
    return { IconComp: Icon.Plus, bg: 'bg-blue-500/10', ring: 'ring-blue-500/30', iconColor: 'text-blue-600', labelColor: 'text-blue-600 dark:text-blue-400' }

  if (label.includes('failed'))
    return { IconComp: Icon.XCircle, bg: 'bg-red-500/10', ring: 'ring-red-500/30', iconColor: 'text-red-500', labelColor: 'text-red-600 dark:text-red-400' }
  if (label.includes('completed') || (label.includes('complete') && label.includes('pipeline')))
    return { IconComp: Icon.CheckCircle, bg: 'bg-green-500/10', ring: 'ring-green-500/30', iconColor: 'text-green-600', labelColor: 'text-green-600 dark:text-green-400' }
  if (label.includes('started') || label.includes('in progress'))
    return { IconComp: Icon.Play, bg: 'bg-raised', ring: 'ring-subtle', iconColor: 'text-muted', labelColor: 'text-secondary' }
  if (label.includes('transcription'))
    return { IconComp: Icon.Mic, bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/30', iconColor: 'text-indigo-500', labelColor: 'text-indigo-600 dark:text-indigo-400' }
  if (label.includes('screen') || label.includes('detection'))
    return { IconComp: Icon.Monitor, bg: 'bg-sky-500/10', ring: 'ring-sky-500/30', iconColor: 'text-sky-500', labelColor: 'text-sky-600 dark:text-sky-400' }
  if (label.includes('frame extraction'))
    return { IconComp: Icon.Camera, bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/30', iconColor: 'text-cyan-600', labelColor: 'text-cyan-600 dark:text-cyan-400' }
  if (label.includes('annotation'))
    return { IconComp: Icon.Tag, bg: 'bg-purple-500/10', ring: 'ring-purple-500/30', iconColor: 'text-purple-500', labelColor: 'text-purple-600 dark:text-purple-400' }
  if (label.includes('clip'))
    return { IconComp: Icon.Film, bg: 'bg-fuchsia-500/10', ring: 'ring-fuchsia-500/30', iconColor: 'text-fuchsia-500', labelColor: 'text-fuchsia-600 dark:text-fuchsia-400' }
  if (label.includes('step content') || label.includes('section'))
    return { IconComp: Icon.FileText, bg: 'bg-teal-500/10', ring: 'ring-teal-500/30', iconColor: 'text-teal-600', labelColor: 'text-teal-600 dark:text-teal-400' }

  return { IconComp: Icon.Clock, bg: 'bg-raised', ring: 'ring-subtle', iconColor: 'text-muted', labelColor: 'text-secondary' }
}

function formatDate(ts: string) {
  const d = new Date(ts)
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }
}

function groupByDate(events: ActivityEvent[]): [string, ActivityEvent[]][] {
  const map = new Map<string, ActivityEvent[]>()
  for (const e of events) {
    const { date } = formatDate(e.timestamp)
    if (!map.has(date)) map.set(date, [])
    map.get(date)!.push(e)
  }
  return Array.from(map.entries())
}

function HistoryPage() {
  const { id } = useParams({ from: '/sop/$id/history' })
  const [showAll, setShowAll] = useState(false)

  const { data: events, isLoading } = useQuery({
    queryKey: ['sops', id, 'history'],
    queryFn: () => fetchAPI<ActivityEvent[]>(`/api/sops/${id}/history`),
  })

  if (isLoading) return <InlineLoader label="Loading history…" />

  if (!events || events.length === 0)
    return <p className="text-muted text-sm py-8">No activity recorded yet.</p>

  const visible = showAll ? events : events.slice(0, INITIAL_LIMIT)
  const hiddenCount = events.length - INITIAL_LIMIT
  const grouped = groupByDate(visible)

  return (
    <div className="max-w-2xl">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-default">Activity History</h2>
          <p className="text-xs text-muted mt-0.5">{events.length} events total</p>
        </div>
        {showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(false)}
            className="text-xs text-muted hover:text-default transition-colors"
          >
            Show less
          </button>
        )}
      </div>

      {/* Timeline grouped by date */}
      {grouped.map(([date, dateEvents]) => (
        <div key={date} className="mb-4">
          {/* Date divider */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-subtle" />
            <span className="text-[10px] font-semibold tracking-widest uppercase text-muted px-1">{date}</span>
            <div className="h-px flex-1 bg-subtle" />
          </div>

          <ol>
            {dateEvents.map((event, i) => {
              const { IconComp, bg, ring, iconColor, labelColor } = resolveEvent(event)
              const { time } = formatDate(event.timestamp)
              const isLast = i === dateEvents.length - 1
              const isSystem = !event.actor_name || event.actor_name === 'System'

              return (
                <li key={i} className="flex gap-3 group">
                  {/* Icon + connector column */}
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className={`w-9 h-9 rounded-full ${bg} ring-2 ${ring} flex items-center justify-center shadow-sm transition-transform duration-150 group-hover:scale-110`}
                    >
                      <span className={iconColor}><IconComp /></span>
                    </div>
                    {/* Connector line — grows to match card height */}
                    {!isLast && (
                      <div className="w-px flex-1 bg-subtle mt-1.5 mb-1.5 min-h-[12px]" />
                    )}
                  </div>

                  {/* Event card */}
                  <div className={`flex-1 min-w-0 bg-card border border-subtle rounded-xl shadow-sm px-4 py-3 transition-all duration-150 group-hover:shadow-md group-hover:border-default ${!isLast ? 'mb-3' : 'mb-2'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${labelColor} leading-snug truncate`}>
                          {event.label}
                        </p>
                        {event.detail && (
                          <p className="text-xs text-muted mt-0.5 leading-relaxed">{event.detail}</p>
                        )}
                        {/* Actor */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {isSystem ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                              <span className="w-3.5 h-3.5 rounded-full bg-raised border border-subtle flex items-center justify-center">
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2 text-muted">
                                  <path d="M8 2a2 2 0 100 4A2 2 0 008 2zM4 9a4 4 0 018 0v1H4V9z"/>
                                </svg>
                              </span>
                              System
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted font-medium">
                              <span className="w-3.5 h-3.5 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center text-[8px] font-bold uppercase">
                                {event.actor_name![0]}
                              </span>
                              {event.actor_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium text-default tabular-nums">{time}</p>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ))}

      {/* Show more button */}
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-1 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-muted hover:text-default border border-subtle rounded-xl hover:bg-raised transition-all duration-150"
        >
          <Icon.ChevronDown />
          Show {hiddenCount} older event{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
