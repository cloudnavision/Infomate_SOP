import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSOPStore } from '../hooks/useSOPStore'
import { useStepSync } from '../hooks/useStepSync'
import { StepSidebar } from '../components/StepSidebar'
import { StepDetail } from '../components/StepDetail'
import { VideoPlayer } from '../components/VideoPlayer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { fetchSOP, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id/procedure')({
  component: ProcedurePage,
})

function ProcedurePage() {
  const { id } = useParams({ from: '/sop/$id/procedure' })
  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })
  const { selectedStepId, setSelectedStep } = useSOPStore()
  const { playerRef, handleTimeUpdate, seekTo } = useStepSync(sop?.steps ?? [])

  // Transcript panel open by default on wide screens, collapsed on narrower
  const [transcriptOpen, setTranscriptOpen] = useState(
    () => window.innerWidth >= 1280,
  )

  const selectedStep = sop?.steps.find((s) => s.id === selectedStepId) ?? null

  // Auto-select first step on load
  useEffect(() => {
    if (sop && !selectedStepId && sop.steps.length > 0) {
      setSelectedStep(sop.steps[0].id)
    }
  }, [sop, selectedStepId, setSelectedStep])

  if (!sop) return null

  return (
    <div
      className={`grid gap-0 h-[calc(100vh-11rem)] ${
        transcriptOpen
          ? 'grid-cols-[272px_1fr_300px]'
          : 'grid-cols-[272px_1fr_28px]'
      }`}
    >
      {/* Left: Steps sidebar */}
      <div className="overflow-y-auto">
        <StepSidebar steps={sop.steps} />
      </div>

      {/* Middle: Video player + Step detail */}
      <div className="flex flex-col min-h-0 overflow-hidden px-4">
        <VideoPlayer
          step={selectedStep}
          sopVideoUrl={sop.video_url ?? null}
          playerRef={playerRef}
          onTimeUpdate={handleTimeUpdate}
        />
        <div className="flex-1 overflow-y-auto">
          <StepDetail step={selectedStep} />
        </div>
      </div>

      {/* Right: Transcript panel + collapse toggle */}
      <div className="relative flex min-h-0">
        {/* Collapse toggle button */}
        <button
          onClick={() => setTranscriptOpen((v) => !v)}
          className="absolute -left-3 top-4 z-10 w-6 h-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600 hover:shadow-md transition-all"
          title={transcriptOpen ? 'Collapse transcript' : 'Open transcript'}
        >
          {transcriptOpen ? '›' : '‹'}
        </button>

        {transcriptOpen && (
          <div className="flex-1 min-h-0 h-full">
            <TranscriptPanel sopId={id} onSeek={seekTo} />
          </div>
        )}
      </div>
    </div>
  )
}
