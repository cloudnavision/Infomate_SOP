import { createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '../components/Layout'
import { AuthProvider } from '../contexts/AuthContext'
import { ThemeProvider } from '../contexts/ThemeContext'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <Layout />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  ),
})
