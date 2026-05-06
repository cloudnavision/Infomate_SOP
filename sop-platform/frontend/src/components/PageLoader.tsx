import type { ReactNode } from 'react'

interface PageLoaderProps {
  label?: string
}

export function PageLoader({ label = 'Loading…' }: PageLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      {/* Animated rings */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-violet-400 animate-spin [animation-duration:0.75s] [animation-direction:reverse]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-blue-500/30 animate-pulse" />
        </div>
      </div>
      <p className="text-sm text-muted font-medium tracking-wide">{label}</p>
    </div>
  )
}

interface InlineLoaderProps {
  label?: string
}

export function InlineLoader({ label = 'Loading…' }: InlineLoaderProps) {
  return (
    <div className="flex items-center gap-2.5 py-8 text-muted text-sm">
      <svg className="animate-spin w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </div>
  )
}

interface PageErrorProps {
  message?: string
  onRetry?: () => void
  children?: ReactNode
}

export function PageError({ message = 'Something went wrong.', onRetry, children }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-secondary mb-1">Failed to load</p>
        <p className="text-xs text-muted max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs font-medium text-blue-500 hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-4 py-2 rounded-xl transition-all"
        >
          Try again
        </button>
      )}
      {children}
    </div>
  )
}

export function SOPPageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Title skeleton */}
      <div className="mb-4">
        <div className="h-6 bg-raised rounded-lg w-2/3 mb-2" />
        <div className="h-3.5 bg-raised rounded w-1/3" />
      </div>
      {/* Tab bar skeleton */}
      <div className="flex gap-1 border-b border-subtle mb-6 pb-0">
        {[80, 72, 100, 68, 72].map((w, i) => (
          <div key={i} className="h-9 bg-raised rounded-t-lg mr-1" style={{ width: w }} />
        ))}
      </div>
      {/* Content skeleton — 3-column layout hint */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-raised rounded-xl" />
          ))}
        </div>
        <div className="md:col-span-1 space-y-3">
          <div className="h-48 bg-raised rounded-xl" />
          <div className="h-24 bg-raised rounded-xl" />
        </div>
        <div className="md:col-span-1 space-y-3">
          <div className="h-64 bg-raised rounded-xl" />
        </div>
      </div>
    </div>
  )
}
