import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Shape, Text, Group } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useQueryClient } from '@tanstack/react-query'
import type { StepCallout, CalloutPatchItem } from '../api/types'
import { patchCallouts, renderAnnotated, sopKeys } from '../api/client'

interface Props {
  sopId: string
  stepId: string
  stepTitle: string
  stepNumber: number
  screenshotUrl: string
  callouts: StepCallout[]
  onClose: () => void
}

interface LocalCallout extends StepCallout {
  x_px: number   // live-editing position in original image pixels
  y_px: number
}

interface NaturalDims { w: number; h: number }

interface StageDimensions { width: number; height: number }

function dotColor(c: LocalCallout): string {
  if (c.was_repositioned) return '#3b82f6'
  if (c.confidence === 'ocr_exact' || c.confidence === 'ocr_fuzzy') return '#10b981'
  return '#f59e0b'
}

function confidenceLabel(c: LocalCallout): string {
  if (c.was_repositioned) return 'repositioned'
  if (c.confidence === 'ocr_exact') return 'ocr_exact'
  if (c.confidence === 'ocr_fuzzy') return 'ocr_fuzzy'
  return 'gemini'
}

export function AnnotationEditorModal({
  sopId, stepId, stepTitle, stepNumber, screenshotUrl, callouts, onClose,
}: Props) {
  const qc = useQueryClient()

  const [local, setLocal] = useState<LocalCallout[]>(() =>
    callouts.map((c) => ({ ...c, x_px: c.target_x, y_px: c.target_y })),
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rerendering, setRerendering] = useState(false)
  const [rerenderUrl, setRerenderUrl] = useState<string | null>(null)

  // Stage dimensions = rendered img dimensions (not natural — avoids drag offset)
  const [stageDim, setStageDim] = useState<StageDimensions>({ width: 720, height: 450 })
  // Natural image dimensions — needed to convert raw pixel coords → stage pixels
  const [naturalDims, setNaturalDims] = useState<NaturalDims>({ w: 1920, h: 1080 })
  const imgRef = useRef<HTMLImageElement>(null)

  function measureImg() {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect()
      setStageDim({ width: rect.width, height: rect.height })
      if (imgRef.current.naturalWidth > 0) {
        setNaturalDims({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
      }
    }
  }

  useEffect(() => {
    window.addEventListener('resize', measureImg)
    return () => window.removeEventListener('resize', measureImg)
  }, [])

  // Convert rendered stage pixel → raw pixel coord
  const toNative = (stagePx: number, stageDim: number, naturalDim: number) =>
    Math.round((stagePx / stageDim) * naturalDim)

  function handleDragEnd(id: string, e: KonvaEventObject<DragEvent>) {
    const { width, height } = stageDim
    const { w: nw, h: nh } = naturalDims
    const clampedX = Math.max(0, Math.min(width, e.target.x()))
    const clampedY = Math.max(0, Math.min(height, e.target.y()))
    setLocal((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              x_px: toNative(clampedX, width, nw),
              y_px: toNative(clampedY, height, nh),
              was_repositioned: true,
            }
          : c,
      ),
    )
  }

  function deleteCallout(id: string) {
    setLocal((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: CalloutPatchItem[] = local.map((c) => ({
        id: c.id,
        target_x: c.x_px,
        target_y: c.y_px,
        was_repositioned: c.was_repositioned,
      }))
      await patchCallouts(stepId, payload)
      await qc.invalidateQueries({ queryKey: sopKeys.detail(sopId) })
      onClose()
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleRerender() {
    setRerendering(true)
    try {
      const res = await renderAnnotated(stepId)
      setRerenderUrl(res.annotated_screenshot_url)
      await qc.invalidateQueries({ queryKey: sopKeys.detail(sopId) })
    } catch (err) {
      alert(`Re-render failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRerendering(false)
    }
  }

  const { width: sw, height: sh } = stageDim
  // rerenderUrl already has SAS (applied by API) — just append cache-buster
  const displayUrl = rerenderUrl
    ? `${rerenderUrl}${rerenderUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
    : screenshotUrl
  const allGemini = local.every((c) => c.confidence === 'gemini_only' && !c.was_repositioned)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-[92vw] max-w-[1200px] h-[88vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700 bg-slate-900 shrink-0">
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
            STEP {stepNumber}
          </span>
          <h2 className="flex-1 text-sm font-semibold text-slate-100 truncate">{stepTitle}</h2>
          {allGemini && (
            <span className="text-xs bg-yellow-900/60 text-yellow-300 px-2 py-0.5 rounded font-semibold">
              ⚠ gemini_only
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-400 border border-slate-600 rounded hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Canvas area */}
          <div className="flex-1 bg-slate-950 relative flex items-center justify-center overflow-hidden">
            <div className="relative">
              {/* Screenshot img — Konva Stage overlaid at exact rendered size */}
              <img
                ref={imgRef}
                src={displayUrl}
                alt="Step screenshot"
                className="max-h-[70vh] max-w-full object-contain rounded block"
                onLoad={measureImg}
              />
              <Stage
                width={sw}
                height={sh}
                style={{ position: 'absolute', top: 0, left: 0 }}
                onClick={() => setActiveId(null)}
              >
                <Layer>
                  {local.map((c) => {
                    const { w: nw, h: nh } = naturalDims
                    const x = (c.x_px / nw) * sw
                    const y = (c.y_px / nh) * sh
                    const color = dotColor(c)
                    const isActive = c.id === activeId
                    return (
                      <Group
                        key={c.id}
                        x={x}
                        y={y}
                        draggable
                        onDragEnd={(e) => handleDragEnd(c.id, e)}
                        onClick={(e) => { e.cancelBubble = true; setActiveId(c.id) }}
                      >
                        {/* Pentagon/arrow badge — points right, centred on (0,0) */}
                        {isActive && (
                          <Shape
                            sceneFunc={(ctx, shape) => {
                              ctx.beginPath()
                              ctx.moveTo(-23, -17)
                              ctx.lineTo(11, -17)
                              ctx.lineTo(23, 0)
                              ctx.lineTo(11, 17)
                              ctx.lineTo(-23, 17)
                              ctx.closePath()
                              ctx.fillStrokeShape(shape)
                            }}
                            fill="white"
                            stroke="#3b82f6"
                            strokeWidth={3}
                          />
                        )}
                        <Shape
                          sceneFunc={(ctx, shape) => {
                            const w = 38, h = 28, tip = 13
                            ctx.beginPath()
                            ctx.moveTo(-w / 2,        -h / 2)
                            ctx.lineTo(w / 2 - tip,   -h / 2)
                            ctx.lineTo(w / 2,          0)
                            ctx.lineTo(w / 2 - tip,    h / 2)
                            ctx.lineTo(-w / 2,         h / 2)
                            ctx.closePath()
                            ctx.fillStrokeShape(shape)
                          }}
                          fill={color}
                        />
                        <Text
                          text={String(c.callout_number)}
                          fontSize={12}
                          fontStyle="bold"
                          fill="white"
                          offsetX={7}
                          offsetY={6}
                        />
                      </Group>
                    )
                  })}
                </Layer>
              </Stage>
            </div>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-slate-500 bg-black/50 px-3 py-1 rounded-full pointer-events-none">
              Drag dots to reposition
            </p>
          </div>

          {/* Right panel */}
          <div className="w-72 border-l border-slate-700 bg-slate-900 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Callouts — {local.length}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {local.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    activeId === c.id
                      ? 'border-blue-500 bg-slate-800'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: dotColor(c) }}
                    >
                      {c.callout_number}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 flex-1 truncate">
                      {c.label}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        c.was_repositioned
                          ? 'bg-blue-900/50 text-blue-300'
                          : c.confidence.startsWith('ocr')
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : 'bg-yellow-900/50 text-yellow-300'
                      }`}
                    >
                      {confidenceLabel(c)}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500">
                    x:{c.x_px}px y:{c.y_px}px
                  </p>
                  <div className="flex gap-1 mt-2 pt-2 border-t border-slate-700">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCallout(c.id) }}
                      className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/70"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-700">
              <button
                onClick={handleRerender}
                disabled={rerendering}
                className="w-full py-2 text-xs font-semibold bg-purple-700 text-white rounded hover:bg-purple-600 disabled:opacity-50"
              >
                {rerendering ? 'Rendering…' : '↻ Re-render Annotated PNG'}
              </button>
              <p className="text-[10px] text-slate-600 text-center mt-1">
                Regenerates the screenshot PNG with current positions
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-slate-700 bg-slate-900 shrink-0 flex items-center gap-4 text-xs text-slate-500">
          <span>Step {stepNumber} · {local.length} callouts</span>
          {allGemini && (
            <span className="text-yellow-400">
              ⚠ All positions are Gemini estimates — verify before saving
            </span>
          )}
        </div>

      </div>
    </div>
  )
}
