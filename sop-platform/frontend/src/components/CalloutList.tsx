import clsx from 'clsx'
import type { StepCallout, CalloutConfidence } from '../api/types'

interface Props {
  callouts: StepCallout[]
}

const confidenceColour: Record<CalloutConfidence, string> = {
  ocr_exact: 'bg-green-500',
  ocr_fuzzy: 'bg-amber-500',
  gemini_only: 'bg-red-500',
}

export function CalloutList({ callouts }: Props) {
  if (callouts.length === 0) return null

  return (
    <div>
      <h4 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
        Callouts
      </h4>
      <ul className="space-y-1.5">
        {callouts.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-sm text-secondary">
            <span
              className={clsx('w-3 h-3 rounded-full shrink-0', confidenceColour[c.confidence])}
              title={c.confidence}
            />
            <span className="font-semibold">{c.callout_number}.</span>
            <span>{c.label}</span>
            {c.element_type && (
              <span className="text-xs bg-raised rounded px-1.5 py-0.5 text-muted">
                {c.element_type}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
