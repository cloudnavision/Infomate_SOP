import clsx from 'clsx'
import { useSOPStore } from '../hooks/useSOPStore'
import type { SOPStep, SOPSection } from '../api/types'

interface Props {
  steps: SOPStep[]
  sections: SOPSection[]
}

export function StepSidebar({ steps, sections }: Props) {
  const { selectedStepId, setSelectedStep } = useSOPStore()

  return (
    <aside className="w-full shrink-0 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      {/* Steps header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Procedure Steps
        </span>
        <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
          {steps.length}
        </span>
      </div>

      {/* Steps list */}
      <ul>
        {steps.map((step) => {
          const isActive = step.id === selectedStepId
          return (
            <li key={step.id}>
              <button
                onClick={() => setSelectedStep(step.id)}
                className={clsx(
                  'w-full text-left px-4 py-2.5 border-l-4 flex items-start gap-3 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 border-blue-500 font-medium text-blue-900'
                    : 'border-transparent hover:bg-gray-50 text-gray-700',
                )}
              >
                <span
                  className={clsx(
                    'shrink-0 font-semibold text-xs mt-0.5',
                    isActive ? 'text-blue-600' : 'text-gray-400',
                  )}
                >
                  {step.sequence}
                </span>
                <span className="truncate">{step.title}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Sections block */}
      {sections.length > 0 && (
        <div className="border-t border-gray-100 mt-1">
          <div className="px-4 py-2.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Sections
            </span>
          </div>
          <ul>
            {sections.map((sec) => (
              <li key={sec.id}>
                <a
                  href={`#section-${sec.section_key}`}
                  className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  {sec.section_title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
