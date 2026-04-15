import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSOPStore } from '../hooks/useSOPStore'
import { useStepSync } from '../hooks/useStepSync'
import { StepSidebar } from '../components/StepSidebar'
import { StepCard } from '../components/StepCard'
import { VideoPlayer } from '../components/VideoPlayer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { SOPPageHeader } from '../components/SOPPageHeader'
import { fetchSOP, fetchTranscript, trackView, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id/procedure')({
  component: ProcedurePage,
})

function ProcedurePage() {
  const { id } = useParams({ from: '/sop/$id/procedure' })

  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })

  // Lifted transcript query — shared between TranscriptPanel and StepCard
  const { data: transcriptLines = [] } = useQuery({
    queryKey: sopKeys.transcript(id),
    queryFn: () => fetchTranscript(id),
    enabled: !!sop,
  })

  const { selectedStepId, setSelectedStep } = useSOPStore()
  const { playerRef, handleTimeUpdate, seekTo } = useStepSync(sop?.steps ?? [])

  const selectedStep = sop?.steps.find((s) => s.id === selectedStepId) ?? null

  // Track view once on mount
  useEffect(() => {
    trackView(id).catch(() => {/* silent — non-critical */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-select first step on load
  useEffect(() => {
    if (sop && !selectedStepId && sop.steps.length > 0) {
      setSelectedStep(sop.steps[0].id)
    }
  }, [sop, selectedStepId, setSelectedStep])

  if (!sop) return null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] px-6 py-4">
      <SOPPageHeader sop={sop} />

      <div className="grid grid-cols-[220px_1fr_320px] gap-4 flex-1 min-h-0">
        {/* Left: Steps + Sections sidebar */}
        <div className="overflow-y-auto">
          <StepSidebar steps={sop.steps} sections={sop.sections} />
        </div>

        {/* Center: Video + Transcript */}
        <div className="flex flex-col min-h-0 gap-3 overflow-hidden">
          <VideoPlayer
            step={selectedStep}
            sopVideoUrl={sop.video_url ?? null}
            playerRef={playerRef}
            onTimeUpdate={handleTimeUpdate}
          />
          <div className="flex-1 min-h-0 rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <TranscriptPanel lines={transcriptLines} onSeek={seekTo} />
          </div>
        </div>

        {/* Right: Step detail card */}
        <div className="min-h-0 overflow-hidden">
          <StepCard
            step={selectedStep}
            transcriptLines={transcriptLines}
            onSeek={seekTo}
          />
        </div>
      </div>
    </div>
  )
}
