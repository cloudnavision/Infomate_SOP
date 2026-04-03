import { useState } from 'react'
import type { SOPStep, TranscriptLine } from '../api/types'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'
import { ScreenshotModal } from './ScreenshotModal'

interface Props {
  step: SOPStep | null
  transcriptLines: TranscriptLine[]
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getKTLines(step: SOPStep, lines: TranscriptLine[]): TranscriptLine[] {
  const end = step.timestamp_end ?? Infinity
  const inRange = lines.filter(
    (l) => l.timestamp_sec >= step.timestamp_start && l.timestamp_sec <= end,
  )
  if (inRange.length > 0) return inRange.slice(0, 3)
  // Fallback: single line nearest to timestamp_start
  const nearest = [...lines].sort(
    (a, b) =>
      Math.abs(a.timestamp_sec - step.timestamp_start) -
      Math.abs(b.timestamp_sec - step.timestamp_start),
  )[0]
  return nearest ? [nearest] : []
}

export function StepCard({ step, transcriptLines, onSeek }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!step) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm py-16 h-full">
        Select a step to view details
      </div>
    )
  }

  const screenshotUrl = step.annotated_screenshot_url ?? step.screenshot_url
  const subSteps = Array.isArray(step.sub_steps) ? (step.sub_steps as string[]) : []
  const ktLines = getKTLines(step, transcriptLines)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 space-y-5 overflow-y-auto h-full">
      {/* Step badge + title */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {step.sequence}
        </span>
        <h2 className="text-base font-semibold text-gray-900 leading-snug">{step.title}</h2>
      </div>

      {/* Description */}
      {step.description && (
        <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
      )}

      {/* Sub-steps */}
      {subSteps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Sub-steps
          </h4>
          <ul className="space-y-1 list-disc list-inside text-sm text-gray-700">
            {subSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Screenshot thumbnail */}
      {screenshotUrl && (
        <div>
          <img
            src={screenshotUrl}
            alt="Annotated screenshot"
            className="w-full rounded border border-gray-100 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            style={{ maxHeight: '160px', objectPosition: 'top' }}
            onClick={() => setModalOpen(true)}
          />
          <button
            onClick={() => setModalOpen(true)}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            Click to expand full screenshot
          </button>
          {modalOpen && (
            <ScreenshotModal
              src={screenshotUrl}
              alt={`Step ${step.sequence} screenshot`}
              onClose={() => setModalOpen(false)}
            />
          )}
        </div>
      )}

      {/* KT session quote */}
      {ktLines.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From the KT session
          </p>
          <div className="space-y-2">
            {ktLines.map((l) => (
              <div key={l.id}>
                <p className="text-sm text-gray-700 italic leading-snug">"{l.content}"</p>
                <p className="text-xs text-gray-400 mt-0.5">{l.speaker}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Play from timestamp */}
      <button
        onClick={() => onSeek(step.timestamp_start)}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <span>▶</span>
        <span>Play from {formatTime(step.timestamp_start)}</span>
      </button>

      {/* Callouts */}
      <CalloutList callouts={step.callouts} />

      {/* Discussions */}
      {step.discussions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
