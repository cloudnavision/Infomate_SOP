import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAPI } from '../api/client'
import type { ActivityEvent } from '../api/types'

export const Route = createFileRoute('/sop/$id/history')({
  component: HistoryPage,
})

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
}

// ── Per-event styling + icon resolution ───────────────────────────────────────
function resolveEvent(event: ActivityEvent): {
  IconComp: () => JSX.Element
  bg: string
  ring: string
  iconColor: string
  labelColor: string
} {
  const label = event.label.toLowerCase()

  if (event.event_type === 'export')
    return { IconComp: Icon.Download, bg: 'bg-orange-50', ring: 'ring-orange-200', iconColor: 'text-orange-500', labelColor: 'text-orange-700' }
  if (event.event_type === 'approved')
    return { IconComp: Icon.ThumbUp, bg: 'bg-green-50', ring: 'ring-green-200', iconColor: 'text-green-600', labelColor: 'text-green-800' }
  if (event.event_type === 'edit')
    return { IconComp: Icon.Pencil, bg: 'bg-violet-50', ring: 'ring-violet-200', iconColor: 'text-violet-500', labelColor: 'text-violet-800' }
  if (event.event_type === 'created')
    return { IconComp: Icon.Plus, bg: 'bg-blue-50', ring: 'ring-blue-200', iconColor: 'text-blue-600', labelColor: 'text-blue-800' }

  // pipeline — differentiate by label
  if (label.includes('failed'))
    return { IconComp: Icon.XCircle, bg: 'bg-red-50', ring: 'ring-red-200', iconColor: 'text-red-500', labelColor: 'text-red-700' }
  if (label.includes('completed') || label.includes('complete') && label.includes('pipeline'))
    return { IconComp: Icon.CheckCircle, bg: 'bg-green-50', ring: 'ring-green-200', iconColor: 'text-green-600', labelColor: 'text-green-800' }
  if (label.includes('started') || label.includes('in progress'))
    return { IconComp: Icon.Play, bg: 'bg-gray-50', ring: 'ring-gray-200', iconColor: 'text-gray-400', labelColor: 'text-gray-700' }
  if (label.includes('transcription'))
    return { IconComp: Icon.Mic, bg: 'bg-indigo-50', ring: 'ring-indigo-200', iconColor: 'text-indigo-500', labelColor: 'text-indigo-800' }
  if (label.includes('screen') || label.includes('detection'))
    return { IconComp: Icon.Monitor, bg: 'bg-sky-50', ring: 'ring-sky-200', iconColor: 'text-sky-500', labelColor: 'text-sky-800' }
  if (label.includes('frame extraction'))
    return { IconComp: Icon.Camera, bg: 'bg-cyan-50', ring: 'ring-cyan-200', iconColor: 'text-cyan-600', labelColor: 'text-cyan-800' }
  if (label.includes('annotation'))
    return { IconComp: Icon.Tag, bg: 'bg-purple-50', ring: 'ring-purple-200', iconColor: 'text-purple-500', labelColor: 'text-purple-800' }
  if (label.includes('clip'))
    return { IconComp: Icon.Film, bg: 'bg-fuchsia-50', ring: 'ring-fuchsia-200', iconColor: 'text-fuchsia-500', labelColor: 'text-fuchsia-800' }
  if (label.includes('step content') || label.includes('section'))
    return { IconComp: Icon.FileText, bg: 'bg-teal-50', ring: 'ring-teal-200', iconColor: 'text-teal-600', labelColor: 'text-teal-800' }

  return { IconComp: Icon.Clock, bg: 'bg-gray-50', ring: 'ring-gray-200', iconColor: 'text-gray-400', labelColor: 'text-gray-700' }
}

function formatDate(ts: string) {
  const d = new Date(ts)
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }
}

function HistoryPage() {
  const { id } = useParams({ from: '/sop/$id/history' })

  const { data: events, isLoading } = useQuery({
    queryKey: ['sops', id, 'history'],
    queryFn: () => fetchAPI<ActivityEvent[]>(`/api/sops/${id}/history`),
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading history…
    </div>
  )

  if (!events || events.length === 0)
    return <p className="text-gray-400 text-sm py-8">No activity recorded yet.</p>

  return (
    <div className="max-w-2xl">
      <div className="relative">
        {/* Vertical timeline track */}
        <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-gradient-to-b from-blue-200 via-gray-200 to-gray-100" />

        <ol className="space-y-1">
          {events.map((event, i) => {
            const { IconComp, bg, ring, iconColor, labelColor } = resolveEvent(event)
            const { date, time } = formatDate(event.timestamp)
            const isSystem = !event.actor_name || event.actor_name === 'System'

            return (
              <li key={i} className="relative flex gap-4 group">
                {/* Icon dot */}
                <div className={`relative z-10 shrink-0 w-10 h-10 rounded-full ${bg} ring-2 ${ring} flex items-center justify-center shadow-sm transition-transform group-hover:scale-110`}>
                  <span className={iconColor}>
                    <IconComp />
                  </span>
                </div>

                {/* Card */}
                <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-2 transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${labelColor} leading-snug`}>{event.label}</p>
                      {event.detail && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{event.detail}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {isSystem ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                              <path d="M8 2a2 2 0 100 4A2 2 0 008 2zM4 9a4 4 0 018 0v1H4V9z"/>
                            </svg>
                            System
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-medium">
                            <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold uppercase">
                              {event.actor_name![0]}
                            </span>
                            {event.actor_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-gray-500">{time}</p>
                      <p className="text-xs text-gray-400">{date}</p>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
