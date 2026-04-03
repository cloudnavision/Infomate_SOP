import { useCallback, useEffect, useRef } from 'react'
import type Player from 'video.js/dist/types/player'
import { useSOPStore } from './useSOPStore'
import type { SOPStep } from '../api/types'

export function useStepSync(steps: SOPStep[]) {
  const { selectedStepId, setSelectedStep, videoMode, setVideoMode } = useSOPStore()

  const playerRef = useRef<Player | null>(null)
  // Ref-based guard: synchronous, no re-render, immune to timeupdate race condition
  const seekSourceRef = useRef<'user' | 'sync' | null>(null)

  // When selected step changes → seek video to step start (full video mode only)
  // Skip if the step change was triggered by the sync itself
  useEffect(() => {
    if (seekSourceRef.current === 'sync') return
    if (!playerRef.current || !selectedStepId || videoMode !== 'full') return
    const step = steps.find((s) => s.id === selectedStepId)
    if (!step) return
    playerRef.current.currentTime(step.timestamp_start)
  }, [selectedStepId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Called by VideoPlayer on every timeupdate event (~250ms)
  const handleTimeUpdate = useCallback(
    (time: number) => {
      seekSourceRef.current = null  // reset guard synchronously at top of every call

      if (videoMode !== 'full') return

      const currentStep = steps.find(
        (s) =>
          time >= s.timestamp_start &&
          (s.timestamp_end == null || time < s.timestamp_end),
      )

      if (currentStep && currentStep.id !== selectedStepId) {
        seekSourceRef.current = 'sync'
        setSelectedStep(currentStep.id)
        // seekSourceRef resets to null on next timeupdate call (~250ms later)
      }
    },
    [steps, selectedStepId, videoMode, setSelectedStep],
  )

  // Called by TranscriptPanel when a transcript line is clicked
  const seekTo = useCallback(
    (seconds: number) => {
      if (!playerRef.current) return
      seekSourceRef.current = 'user'

      // Transcript timestamps are absolute — switch to full video so seek makes sense
      if (videoMode === 'clip') {
        setVideoMode('full')
      }

      playerRef.current.currentTime(seconds)
    },
    [videoMode, setVideoMode],
  )

  return { playerRef, handleTimeUpdate, seekTo }
}
