import clsx from 'clsx'
import { useSOPStore } from '../hooks/useSOPStore'
import type { SOPStep } from '../api/types'

interface Props {
  steps: SOPStep[]
}

export function StepSidebar({ steps }: Props) {
  const { selectedStepId, setSelectedStep } = useSOPStore()

  return (
    <aside className="w-72 shrink-0 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Steps</span>
        <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
          {steps.length}
        </span>
      </div>
      <ul className="overflow-y-auto">
        {steps.map((step) => {
          const isActive = step.id === selectedStepId
          return (
            <li key={step.id}>
              <button
                onClick={() => setSelectedStep(step.id)}
                className={clsx(
                  'w-full text-left px-4 py-3 border-l-4 flex items-start gap-3 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 border-blue-500 font-medium text-blue-900'
                    : 'border-transparent hover:bg-gray-50 text-gray-700'
                )}
              >
                <span className={clsx('shrink-0 font-semibold text-xs mt-0.5', isActive ? 'text-blue-600' : 'text-gray-400')}>
                  {step.sequence}
                </span>
                <span className="truncate">{step.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
