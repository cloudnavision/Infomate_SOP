import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOP, sopKeys } from '../api/client'
import type { SOPSection } from '../api/types'

export const Route = createFileRoute('/sop/$id/overview')({
  component: OverviewPage,
})

function SectionBlock({ section }: { section: SOPSection }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">{section.section_title}</h3>
      {section.content_type === 'text' && section.content_text && (
        <p className="text-sm text-gray-700 leading-relaxed">{section.content_text}</p>
      )}
      {section.content_type === 'list' && Array.isArray(section.content_json) && (
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          {(section.content_json as string[]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      {section.content_type === 'table' && Array.isArray(section.content_json) && section.content_json.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr>
                {Object.keys(section.content_json[0] as Record<string, unknown>).map((col) => (
                  <th key={col} className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-50">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(section.content_json as Record<string, unknown>[]).map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="border border-gray-200 px-3 py-2 text-gray-700">
                      {String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-36 shrink-0 text-gray-400">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  )
}

function OverviewPage() {
  const { id } = useParams({ from: '/sop/$id/overview' })
  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })

  if (!sop) return null

  const participants = Array.isArray(sop.meeting_participants) && sop.meeting_participants.length > 0
    ? (sop.meeting_participants as string[]).join(', ')
    : null

  return (
    <div className="space-y-8">
      {/* SOP metadata — always shown */}
      <div className="bg-white rounded-lg border border-gray-100 p-5 space-y-2.5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">SOP Details</h3>
        <MetaRow label="Client" value={sop.client_name} />
        <MetaRow label="Process" value={sop.process_name} />
        <MetaRow label="Meeting Date" value={sop.meeting_date
          ? new Date(sop.meeting_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
          : null}
        />
        <MetaRow label="Participants" value={participants} />
        <MetaRow label="Status" value={sop.status.replace('_', ' ').toUpperCase()} />
        <MetaRow label="Steps" value={String(sop.steps.length)} />
        {sop.video_duration_sec && (
          <MetaRow label="Video Duration" value={`${Math.floor(sop.video_duration_sec / 60)} min ${sop.video_duration_sec % 60} sec`} />
        )}
      </div>

      {/* AI-generated sections */}
      {sop.sections.length === 0 ? (
        <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-4 border border-dashed border-gray-200">
          No sections generated yet. The section generation pipeline hasn't run for this SOP.
        </div>
      ) : (
        <div className="space-y-8">
          {sop.sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}
