import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAPI } from '../api/client'
import type { ActivityEvent } from '../api/types'

export const Route = createFileRoute('/sop/$id/history')({
  component: HistoryPage,
})

const eventConfig: Record<string, { icon: string; color: string }> = {
  created:  { icon: '✦', color: 'text-blue-500 bg-blue-50 border-blue-200' },
  pipeline: { icon: '⚙', color: 'text-purple-500 bg-purple-50 border-purple-200' },
  approved: { icon: '✓', color: 'text-green-600 bg-green-50 border-green-200' },
  export:   { icon: '↓', color: 'text-orange-500 bg-orange-50 border-orange-200' },
  edit:     { icon: '✎', color: 'text-violet-500 bg-violet-50 border-violet-200' },
}

function HistoryPage() {
  const { id } = useParams({ from: '/sop/$id/history' })

  const { data: events, isLoading } = useQuery({
    queryKey: ['sops', id, 'history'],
    queryFn: () => fetchAPI<ActivityEvent[]>(`/api/sops/${id}/history`),
  })

  if (isLoading) return <p className="text-gray-400 text-sm">Loading history…</p>
  if (!events || events.length === 0) return <p className="text-gray-400 text-sm">No activity recorded yet.</p>

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

      <div className="space-y-4 pl-12">
        {events.map((event, i) => {
          const cfg = eventConfig[event.event_type] ?? eventConfig.created
          return (
            <div key={i} className="relative">
              {/* Dot */}
              <div className={`absolute -left-9 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold ${cfg.color}`}>
                {cfg.icon}
              </div>

              <div className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{event.label}</p>
                    {event.detail && (
                      <p className="text-xs text-gray-400 mt-0.5">{event.detail}</p>
                    )}
                    {event.actor_name && (
                      <p className="text-xs text-gray-400 mt-0.5">by {event.actor_name}</p>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">
                    {new Date(event.timestamp).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}{' '}
                    {new Date(event.timestamp).toLocaleTimeString('en-GB', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
