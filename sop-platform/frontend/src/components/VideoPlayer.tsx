import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import type { SOPStep } from '../api/types'
import { useSOPStore } from '../hooks/useSOPStore'

interface Props {
  step: SOPStep | null
  sopVideoUrl: string | null
  playerRef: React.MutableRefObject<Player | null>
  onTimeUpdate: (time: number) => void
}

export function VideoPlayer({ step, sopVideoUrl, playerRef, onTimeUpdate }: Props) {
  const { videoMode, setVideoMode } = useSOPStore()
  const videoElRef = useRef<HTMLVideoElement>(null)

  const clipUrl = step?.clips?.[0]?.clip_url ?? null
  const hasFullVideo = !!sopVideoUrl
  const currentSrc = videoMode === 'clip' ? clipUrl : sopVideoUrl

  // Initialise Video.js once on mount
  // <video> element is always in DOM so videojs() always finds videoElRef.current
  useEffect(() => {
    if (!videoElRef.current) return

    const player = videojs(videoElRef.current, {
      controls: true,
      preload: 'auto',
      fill: true,
    })

    playerRef.current = player

    player.on('timeupdate', () => {
      onTimeUpdate(player.currentTime() ?? 0)
    })

    return () => {
      player.dispose()
      playerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swap source only when it actually changes — prevents unnecessary restarts
  useEffect(() => {
    if (!playerRef.current || !currentSrc) return
    const existingSrc = playerRef.current.currentSrc()
    if (existingSrc === currentSrc) return
    playerRef.current.src([{ src: currentSrc, type: 'video/mp4' }])
    if (videoMode === 'clip') {
      playerRef.current.play()?.catch(() => {/* autoplay may be blocked by browser */})
    }
  }, [currentSrc, videoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // On step change in full video mode — seek to step start
  useEffect(() => {
    if (!playerRef.current || videoMode !== 'full' || !step) return
    playerRef.current.currentTime(step.timestamp_start)
  }, [step?.id, videoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderFallback = () => {
    if (step?.annotated_screenshot_url) {
      return (
        <div className="relative">
          <img src={step.annotated_screenshot_url} className="w-full rounded" alt="Annotated screenshot" />
          <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-200">
            Clip processing...
          </span>
        </div>
      )
    }
    if (step?.screenshot_url) {
      return (
        <div className="relative">
          <img src={step.screenshot_url} className="w-full rounded" alt="Screenshot" />
          <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-200">
            Clip processing...
          </span>
        </div>
      )
    }
    return (
      <div className="bg-gray-100 rounded-lg p-8 border border-dashed border-gray-300 text-center">
        <p className="text-sm text-gray-400">Screenshot available after pipeline processing</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-4 shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {videoMode === 'clip' ? 'Step Clip' : 'Full Recording'}
        </span>
        <button
          onClick={() => setVideoMode(videoMode === 'clip' ? 'full' : 'clip')}
          disabled={!hasFullVideo && videoMode === 'clip'}
          title={!hasFullVideo ? 'Full video not available' : undefined}
          className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {videoMode === 'clip' ? 'Full Video ▾' : 'Step Clip ▴'}
        </button>
      </div>
      <div className="p-3">
        {/* Fixed height so transcript panel gets enough space below */}
        <div
          className={currentSrc ? 'w-full bg-black' : 'hidden'}
          style={{ height: '260px' }}
        >
          <div data-vjs-player style={{ width: '100%', height: '100%' }}>
            <video ref={videoElRef} className="video-js vjs-big-play-centered" />
          </div>
        </div>
        {!currentSrc && renderFallback()}
      </div>
    </div>
  )
}
