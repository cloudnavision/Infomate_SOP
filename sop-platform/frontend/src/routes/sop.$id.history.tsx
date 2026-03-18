import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sop/$id/history')({
  component: () => (
    <p className="text-gray-400 text-sm">Version history - coming in Phase 5</p>
  ),
})
