import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sop/$id/matrices')({
  component: () => (
    <p className="text-gray-400 text-sm">
      Communication matrices and quality parameters
    </p>
  ),
})
