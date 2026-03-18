import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sop/new')({
  component: () => (
    <p className="text-gray-400 text-sm">Upload a recording - coming in Phase 4</p>
  ),
})
