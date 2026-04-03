import type { SOPStep } from '../api/types'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'

interface Props {
  step: SOPStep | null
}

export function StepDetail({ step }: Props) {
  if (!step) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm py-16">
        Select a step from the sidebar to view details
      </div>
    )
  }

  const subSteps = Array.isArray(step.sub_steps) ? step.sub_steps as string[] : []

  return (
    <div className="min-w-0 bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6 overflow-y-auto">
      <h2 className="text-xl font-semibold text-gray-900">
        Step {step.sequence}: {step.title}
      </h2>

      {step.description && (
        <p className="text-gray-700 leading-relaxed">{step.description}</p>
      )}

      {subSteps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Sub-steps
          </h4>
          <ul className="space-y-1 list-disc list-inside text-sm text-gray-700">
            {subSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <CalloutList callouts={step.callouts} />

      {step.discussions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Discussion
          </h4>
          {step.discussions.map((d) => (
            <DiscussionCard key={d.id} discussion={d} />
          ))}
        </div>
      )}
    </div>
  )
}
