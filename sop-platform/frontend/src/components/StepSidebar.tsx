import clsx from 'clsx'
import { useSOPStore } from '../hooks/useSOPStore'
import type { SOPStep, SOPSection } from '../api/types'

interface Props {
  steps: SOPStep[]
  sections: SOPSection[]
  sopId: string
}

export function StepSidebar({ steps, sections, sopId }: Props) {
  const { selectedStepId, setSelectedStep } = useSOPStore()

  const approvedCount = steps.filter(s => s.is_approved).length
  const pct = steps.length > 0 ? Math.round((approvedCount / steps.length) * 100) : 0

  return (
    <aside className="w-full shrink-0 overflow-hidden flex flex-col gap-2">
      {/* ── Procedure Steps card ── */}
      <div className="bg-card rounded-xl shadow-sm border border-subtle overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-subtle bg-blue-500/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 14 14" fill="currentColor" className="w-3.5 h-3.5 text-blue-500">
                <path fillRule="evenodd" d="M2 2a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2zm2 1v1h6V3H4zm0 3v1h6V6H4zm0 3v1h4V9H4z" clipRule="evenodd"/>
              </svg>
              <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">
                Procedure Steps
              </span>
            </div>
            <span className="text-xs bg-blue-600 text-white font-bold rounded-full px-2 py-0.5">
              {steps.length}
            </span>
          </div>
          {/* Mini progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-blue-500/15 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-blue-400 shrink-0">{approvedCount}/{steps.length}</span>
          </div>
        </div>

        {/* Steps list */}
        <ul className="overflow-y-auto max-h-[40vh]">
          {steps.map((step) => {
            const isActive = step.id === selectedStepId
            return (
              <li key={step.id}>
                <button
                  onClick={() => setSelectedStep(step.id)}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 border-l-[3px] flex items-center gap-2.5 transition-all',
                    isActive
                      ? 'bg-blue-500/10 border-blue-500'
                      : 'border-transparent hover:bg-raised hover:border-blue-200',
                  )}
                >
                  <span
                    className={clsx(
                      'shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white'
                        : step.is_approved
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-raised text-muted',
                    )}
                  >
                    {step.is_approved && !isActive ? (
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M9.707 3.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L5 6.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    ) : (
                      step.sequence
                    )}
                  </span>
                  <span className={clsx(
                    'truncate leading-snug text-xs',
                    isActive ? 'text-blue-600 font-semibold' : 'text-secondary',
                  )}>
                    {step.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* ── Sections card ── */}
      {sections.length > 0 && (
        <div className="bg-card rounded-xl shadow-sm border border-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-subtle bg-violet-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg viewBox="0 0 14 14" fill="currentColor" className="w-3.5 h-3.5 text-violet-500">
                  <path d="M1 2a1 1 0 011-1h10a1 1 0 010 2H2a1 1 0 01-1-1zm0 4a1 1 0 011-1h10a1 1 0 010 2H2a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 010 2H2a1 1 0 01-1-1z"/>
                </svg>
                <span className="text-xs font-bold text-violet-500 uppercase tracking-wide">
                  Sections
                </span>
              </div>
              <span className="text-xs bg-violet-600 text-white font-bold rounded-full px-2 py-0.5">
                {sections.length}
              </span>
            </div>
          </div>
          <ul className="py-1 overflow-y-auto max-h-[30vh]">
            {sections.map((sec) => (
              <li key={sec.id}>
                <a
                  href={`/sop/${sopId}/overview#section-${sec.section_key}`}
                  className="flex items-center gap-2 px-4 py-2 text-xs text-muted hover:bg-violet-500/10 hover:text-violet-500 transition-colors group border-l-[3px] border-transparent hover:border-violet-400"
                >
                  <svg viewBox="0 0 8 8" fill="currentColor" className="w-1.5 h-1.5 text-violet-300 group-hover:text-violet-500 shrink-0">
                    <circle cx="4" cy="4" r="4"/>
                  </svg>
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
