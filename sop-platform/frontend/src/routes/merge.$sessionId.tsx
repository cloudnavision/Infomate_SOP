import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/merge/$sessionId')({
  component: () => <Outlet />,
})
