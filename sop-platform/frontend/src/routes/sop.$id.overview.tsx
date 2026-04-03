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

function OverviewPage() {
  const { id } = useParams({ from: '/sop/$id/overview' })
  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })

  if (!sop) return null

  if (sop.sections.length === 0) {
    return <p className="text-gray-400 text-sm">No sections available yet. Run the pipeline to generate content.</p>
  }

  return (
    <div className="space-y-8">
      {sop.sections.map((section) => (
        <SectionBlock key={section.id} section={section} />
      ))}
    </div>
  )
}
