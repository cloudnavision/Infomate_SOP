import { createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '../components/Layout'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Layout />
    </QueryClientProvider>
  ),
})
