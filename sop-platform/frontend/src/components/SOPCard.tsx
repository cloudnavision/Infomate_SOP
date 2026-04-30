import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import type { SOPListItem, SOPStatus, SOPTag } from '../api/types'
import { deleteSOP, updateSOPTags, sopKeys } from '../api/client'
import { useAuthContext } from '../contexts/AuthContext'

interface Props {
  sop: SOPListItem
}

// Named color keys stored in DB → Tailwind classes
const TAG_COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-500/10 text-blue-500 border-blue-500/30',
  purple: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
  green:  'bg-green-500/10 text-green-500 border-green-500/30',
  orange: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  pink:   'bg-pink-500/10 text-pink-500 border-pink-500/30',
  teal:   'bg-teal-500/10 text-teal-500 border-teal-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
  rose:   'bg-rose-500/10 text-rose-500 border-rose-500/30',
  amber:  'bg-amber-500/10 text-amber-500 border-amber-500/30',
  cyan:   'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
}

const TAG_COLOR_KEYS = Object.keys(TAG_COLOR_MAP)

// Swatch dot colors for the picker
const TAG_DOT_MAP: Record<string, string> = {
  blue:   'bg-blue-400',
  purple: 'bg-purple-400',
  green:  'bg-green-400',
  orange: 'bg-orange-400',
  pink:   'bg-pink-400',
  teal:   'bg-teal-400',
  indigo: 'bg-indigo-400',
  rose:   'bg-rose-400',
  amber:  'bg-amber-400',
  cyan:   'bg-cyan-400',
}

function tagClasses(color: string) {
  return TAG_COLOR_MAP[color] ?? TAG_COLOR_MAP.blue
}

function nextColor(current: string) {
  const idx = TAG_COLOR_KEYS.indexOf(current)
  return TAG_COLOR_KEYS[(idx + 1) % TAG_COLOR_KEYS.length]
}

const statusConfig: Record<SOPStatus, { label: string; accent: string; avatar: string; badge: string; dot: string }> = {
  processing: { label: 'Processing', accent: 'bg-gradient-to-r from-violet-500 to-indigo-500', avatar: 'bg-gradient-to-br from-violet-500 to-indigo-500', badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20', dot: 'bg-violet-400' },
  draft:      { label: 'Draft',      accent: 'bg-gradient-to-r from-slate-400 to-slate-500',   avatar: 'bg-gradient-to-br from-slate-400 to-slate-500',   badge: 'bg-raised text-muted border-default',               dot: 'bg-slate-400' },
  in_review:  { label: 'In Review',  accent: 'bg-gradient-to-r from-blue-500 to-cyan-500',     avatar: 'bg-gradient-to-br from-blue-500 to-cyan-500',     badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',    dot: 'bg-blue-400'  },
  published:  { label: 'Published',  accent: 'bg-gradient-to-r from-emerald-500 to-teal-500',  avatar: 'bg-gradient-to-br from-emerald-500 to-teal-500',  badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  archived:   { label: 'Archived',   accent: 'bg-gradient-to-r from-gray-400 to-gray-500',     avatar: 'bg-gradient-to-br from-gray-400 to-gray-500',     badge: 'bg-raised text-muted border-default',               dot: 'bg-gray-400'  },
}

const PIPELINE_STAGES = [
  'transcribing', 'detecting_screenshare', 'extracting_frames', 'deduplicating',
  'classifying_frames', 'generating_annotations', 'extracting_clips', 'generating_sections',
]

const stageLabel: Record<string, string> = {
  transcribing:           'Transcribing',
  detecting_screenshare:  'Detecting screen',
  extracting_frames:      'Extracting frames',
  deduplicating:          'Deduplicating',
  classifying_frames:     'Classifying',
  generating_annotations: 'Annotating',
  extracting_clips:       'Clipping',
  generating_sections:    'Generating sections',
}

function PipelineProgress({ stage }: { stage: string | null }) {
  if (!stage) return null
  const idx = PIPELINE_STAGES.indexOf(stage)
  const pct = idx < 0 ? 5 : Math.round(((idx + 1) / PIPELINE_STAGES.length) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-violet-600 font-medium flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          {stageLabel[stage] ?? stage}…
        </span>
        <span className="text-xs text-muted font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-raised rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Initials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(w => /[a-zA-Z0-9]/.test(w[0]))
  const letters = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2)
  return letters.toUpperCase()
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SOPCard({ sop }: Props) {
  const navigate = useNavigate()
  const { appUser } = useAuthContext()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagColor, setTagColor] = useState('blue')
  const tagInputRef = useRef<HTMLInputElement>(null)
  const cfg = statusConfig[sop.status] ?? statusConfig.draft
  const canEdit = appUser?.role === 'editor' || appUser?.role === 'admin'
  const canDelete = canEdit
  const tags: SOPTag[] = sop.tags || []

  const deleteMutation = useMutation({
    mutationFn: () => deleteSOP(sop.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sopKeys.all }),
  })

  const tagMutation = useMutation({
    mutationFn: (newTags: SOPTag[]) => updateSOPTags(sop.id, newTags),
    onSuccess: () => qc.invalidateQueries({ queryKey: sopKeys.all }),
  })

  function removeTag(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    tagMutation.mutate(tags.filter(t => t.name !== name))
  }

  function cycleColor(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    tagMutation.mutate(tags.map(t => t.name === name ? { ...t, color: nextColor(t.color) } : t))
  }

  function commitTag() {
    const val = tagInput.trim()
    if (val && !tags.find(t => t.name === val)) {
      tagMutation.mutate([...tags, { name: val, color: tagColor }])
    }
    setTagInput('')
    setTagColor('blue')
    setAddingTag(false)
  }

  function openTagInput(e: React.MouseEvent) {
    e.stopPropagation()
    setAddingTag(true)
    setTimeout(() => tagInputRef.current?.focus(), 0)
  }

  const isPipelineRunning = sop.pipeline_status && sop.pipeline_status !== 'completed' && sop.pipeline_status !== 'failed'
  const cleanTitle = sop.title.replace(/\b\d{8}\s+\d{6}\b/g, '').replace(/\s{2,}/g, ' ').trim()
  const displayName = sop.process_name || cleanTitle
  const subtitle = sop.client_name ?? null

  return (
    <div
      onClick={() => navigate({ to: '/sop/$id/procedure', params: { id: sop.id } })}
      className="group bg-card rounded-2xl border border-subtle shadow-sm hover:shadow-xl hover:border-default hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      <div className={clsx('h-1.5', cfg.accent)} />

      <div className="p-5 space-y-3.5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={clsx('shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm', cfg.avatar)}>
            <Initials name={displayName} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-semibold text-default truncate leading-snug">{displayName}</p>
            {subtitle && <p className="text-xs text-muted truncate mt-0.5">{subtitle}</p>}
          </div>
          <span className={clsx('shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border flex items-center gap-1.5', cfg.badge)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
        </div>

        {/* Pipeline progress */}
        {isPipelineRunning && sop.pipeline_stage && <PipelineProgress stage={sop.pipeline_stage} />}
        {sop.pipeline_status === 'failed' && (
          <p className="text-xs text-red-500 font-medium flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-[10px]">⚠</span>
            Pipeline failed
          </p>
        )}

        {/* Tags */}
        {(tags.length > 0 || canEdit) && (
          <div className="flex flex-wrap gap-1.5 items-center" onClick={e => e.stopPropagation()}>
            {tags.map(tag => (
              <span
                key={tag.name}
                className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium', tagClasses(tag.color))}
              >
                {/* Color swatch — click to cycle */}
                {canEdit && (
                  <button
                    title="Change color"
                    onClick={e => cycleColor(tag.name, e)}
                    className={clsx('w-2.5 h-2.5 rounded-full shrink-0 hover:scale-125 transition-transform', TAG_DOT_MAP[tag.color] ?? 'bg-blue-400')}
                  />
                )}
                {tag.name}
                {canEdit && (
                  <button onClick={e => removeTag(tag.name, e)} className="opacity-40 hover:opacity-100 leading-none ml-0.5">×</button>
                )}
              </span>
            ))}
            {canEdit && (
              addingTag ? (
                <div
                  className="w-full mt-1 p-3 bg-card border border-default rounded-xl shadow-lg"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Live preview */}
                  <div className="mb-2.5">
                    <span className={clsx('inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium', tagClasses(tagColor))}>
                      <span className={clsx('w-2 h-2 rounded-full', TAG_DOT_MAP[tagColor])} />
                      {tagInput.trim() || 'preview'}
                    </span>
                  </div>

                  {/* Name input */}
                  <input
                    ref={tagInputRef}
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitTag() }
                      if (e.key === 'Escape') { setAddingTag(false); setTagInput(''); setTagColor('blue') }
                    }}
                    placeholder="Tag name…"
                    className="w-full text-xs px-2.5 py-1.5 border border-default rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 mb-2.5"
                  />

                  {/* Color swatches */}
                  <div className="flex gap-1.5 mb-3">
                    {TAG_COLOR_KEYS.map(c => (
                      <button
                        key={c}
                        onClick={e => { e.stopPropagation(); setTagColor(c) }}
                        title={c}
                        className={clsx(
                          'w-5 h-5 rounded-full transition-all hover:scale-110',
                          TAG_DOT_MAP[c],
                          tagColor === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'opacity-60 hover:opacity-100'
                        )}
                      />
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); commitTag() }}
                      disabled={!tagInput.trim()}
                      className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      Add tag
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setAddingTag(false); setTagInput(''); setTagColor('blue') }}
                      className="text-xs px-3 py-1.5 border border-default rounded-lg text-muted hover:bg-raised transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={openTagInput}
                  className="text-xs px-2.5 py-1 border border-dashed border-default rounded-full text-muted hover:border-blue-400/50 hover:text-blue-400 transition-colors"
                >
                  + Add tag
                </button>
              )
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-subtle">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{sop.step_count} {sop.step_count === 1 ? 'step' : 'steps'}</span>
            {sop.meeting_date && <span>·</span>}
            {sop.meeting_date && <span>{formatDate(sop.meeting_date)}</span>}
          </div>
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {!confirming ? (
              <>
                <button
                  onClick={e => { e.stopPropagation(); navigate({ to: '/sop/$id/procedure', params: { id: sop.id } }) }}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Open
                </button>
                {canDelete && (
                  <button
                    onClick={e => { e.stopPropagation(); setConfirming(true) }}
                    className="text-xs w-7 h-7 flex items-center justify-center border border-default rounded-lg text-muted hover:border-red-400/40 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setConfirming(false) }}
                  className="text-xs px-2.5 py-1.5 border border-default rounded-lg text-muted hover:bg-raised transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteMutation.mutate() }}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
