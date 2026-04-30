import { MessageCircle, Info, Zap, AlertTriangle } from 'lucide-react'
import type { StepDiscussion } from '../api/types'

interface Props {
  discussion: StepDiscussion
}

function TypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'question':
      return <MessageCircle className="w-4 h-4 text-blue-500" />
    case 'clarification':
      return <Info className="w-4 h-4 text-blue-500" />
    case 'decision':
      return <Zap className="w-4 h-4 text-purple-500" />
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />
    default:
      return <MessageCircle className="w-4 h-4 text-muted" />
  }
}

export function DiscussionCard({ discussion }: Props) {
  return (
    <div className="border border-default rounded-lg p-4 bg-card">
      <div className="flex items-center gap-2 mb-2">
        <TypeIcon type={discussion.discussion_type} />
        <span className="text-xs font-medium text-muted uppercase tracking-wide">
          {discussion.discussion_type ?? 'Discussion'}
        </span>
      </div>
      <p className="text-sm text-secondary mb-3">{discussion.summary}</p>
      {discussion.speakers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {discussion.speakers.map((speaker) => (
            <span
              key={speaker}
              className="bg-raised rounded-full px-2 py-0.5 text-xs text-muted"
            >
              {speaker}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
